import { approxYear } from '../model/dates';
import { unionsOf } from '../model/queries';
import type { Family, PersonId, TreeData } from '../model/types';
import { layoutAncestors, layoutDescendants } from './treeLayout';
import { CARD_H, CARD_W, H_GAP, V_GAP, boundsOf, type CardBox, type ChartLayout, type LinkLine } from './types';

// «Бабочка»: пара в центре, предки одного супруга — левое крыло,
// предки другого — правое (зеркально), их общие дети и потомки — снизу.
// Если супруга нет — только левое крыло и дети.

/** Промежуток между супругами в центре (там линия брака) */
const COUPLE_GAP = 40;

/** Союз для «бабочки»: первый союз с супругом (жена справа), иначе любой */
function coupleOf(tree: TreeData, id: PersonId): { family?: Family; left: PersonId; right?: PersonId } {
  const unions = unionsOf(tree, id);
  const family = unions.find((f) => f.partners.length === 2) ?? unions[0];
  const spouse = family?.partners.find((p) => p !== id && tree.people[p]);
  if (!spouse) return { family, left: id };
  // Муж слева, жена справа (как на семейных фото); если пол не указан — центральный человек слева
  const swap = tree.people[id]?.sex === 'F' && tree.people[spouse]?.sex !== 'F';
  return { family, left: swap ? spouse : id, right: swap ? id : spouse };
}

export function layoutButterfly(tree: TreeData, focusId: PersonId, up: number, down: number): ChartLayout {
  if (!tree.people[focusId]) return { cards: [], lines: [], bounds: boundsOf([]) };
  const { family, left, right } = coupleOf(tree, focusId);
  const cards: CardBox[] = [];
  const lines: LinkLine[] = [];
  let seq = 0;
  const push = (c: CardBox, dx: number, dy: number, mirror = false, k = 0) => {
    const x = mirror ? -c.x - CARD_W + k : c.x + dx;
    cards.push({ ...c, key: `b${seq++}:${c.key}`, x, y: c.y + dy, ...(mirror && { dir: 'hr' as const }) });
  };
  const pushLine = (l: LinkLine, dx: number, dy: number, mirror = false, k = 0) => {
    lines.push({ ...l, key: `b${seq++}`, points: l.points.map(([x, y]) => [mirror ? -x + k : x + dx, y + dy] as [number, number]) });
  };

  // Левое крыло: предки левого супруга, корень — в точке (0, 0)
  const lw = layoutAncestors(tree, left, up, true);
  const lRoot = lw.cards.find((c) => c.personId === left)!;
  lw.cards.forEach((c) => push(c, -lRoot.x, -lRoot.y));
  lw.lines.forEach((l) => pushLine(l, -lRoot.x, -lRoot.y));

  // Правое крыло: предки правого супруга, зеркально, корень — справа от левого
  if (right) {
    const rw = layoutAncestors(tree, right, up, true);
    const rRoot = rw.cards.find((c) => c.personId === right)!;
    // Зеркало x → K − x: корень (после сдвига к 0) встаёт в CARD_W + COUPLE_GAP
    const K = 2 * CARD_W + COUPLE_GAP;
    rw.cards.forEach((c) => push({ ...c, x: c.x - rRoot.x }, 0, -rRoot.y, true, K));
    rw.lines.forEach((l) => pushLine({ ...l, points: l.points.map(([x, y]) => [x - rRoot.x, y] as [number, number]) }, 0, -rRoot.y, true, K));
    lines.push({
      key: `b${seq++}`,
      points: [
        [CARD_W, CARD_H / 2],
        [CARD_W + COUPLE_GAP, CARD_H / 2],
      ],
      dashed: family?.status === 'divorced' || undefined,
    });
  }

  // Дети пары — снизу, каждый со своими потомками (обычная вертикальная схема)
  const kids = (family?.children ?? [])
    .filter((c) => tree.people[c.id])
    .sort((a, b) => (approxYear(tree.people[a.id]!.birth?.date) ?? 99999) - (approxYear(tree.people[b.id]!.birth?.date) ?? 99999));
  if (kids.length) {
    const blocks = kids.map((k) => ({ k, l: layoutDescendants(tree, k.id, Math.max(0, down - 1)) }));
    const widths = blocks.map((b) => b.l.bounds.maxX - b.l.bounds.minX);
    const total = widths.reduce((a, b) => a + b, 0) + H_GAP * (blocks.length - 1);
    const cx = right ? CARD_W + COUPLE_GAP / 2 : CARD_W / 2;
    const leftX = cx - total / 2;
    // Опускаем детей ниже крыльев, если те свисают над местом для детей
    let top = CARD_H + V_GAP;
    for (const c of cards) {
      if (c.x + CARD_W > leftX - H_GAP && c.x < leftX + total + H_GAP && c.y !== 0) top = Math.max(top, c.y + CARD_H + V_GAP);
    }
    const busY = top - V_GAP / 2;
    let cursor = leftX;
    const centers: { x: number; dashed: boolean }[] = [];
    blocks.forEach(({ k, l }, i) => {
      const dx = cursor - l.bounds.minX;
      const root = l.cards.find((c) => c.personId === k.id && c.role === 'main')!;
      centers.push({ x: root.x + dx + CARD_W / 2, dashed: k.relation !== 'birth' });
      l.cards.forEach((c) => push(c, dx, top));
      l.lines.forEach((ln) => pushLine(ln, dx, top));
      cursor += widths[i]! + H_GAP;
    });
    const startY = right ? CARD_H / 2 : CARD_H;
    lines.push({ key: `b${seq++}`, points: [[cx, startY], [cx, busY]] });
    const xs = [cx, ...centers.map((c) => c.x)];
    lines.push({ key: `b${seq++}`, points: [[Math.min(...xs), busY], [Math.max(...xs), busY]] });
    for (const c of centers) lines.push({ key: `b${seq++}`, points: [[c.x, busY], [c.x, top]], dashed: c.dashed || undefined });
  } else if ((family?.children.length ?? 0) > 0) {
    cards.find((c) => c.personId === left)!.moreBelow = true;
  }

  // Человек, попавший на схему дважды (браки между родственниками), — второй раз «ссылкой»
  const seen = new Set<PersonId>();
  for (const c of cards) {
    if (c.role === 'spouse') continue;
    if (seen.has(c.personId)) c.duplicate = true;
    seen.add(c.personId);
  }
  const main = new Set(cards.filter((c) => c.role !== 'spouse' && !c.duplicate).map((c) => c.personId));
  for (const c of cards) if (c.role === 'spouse' && main.has(c.personId)) c.duplicate = true;
  return { cards, lines, bounds: boundsOf(cards) };
}
