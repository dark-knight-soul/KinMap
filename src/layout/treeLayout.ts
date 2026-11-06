import { approxYear } from '../model/dates';
import { parentFamiliesOf, siblingsOf, unionsOf } from '../model/queries';
import type { ChildRelation, Family, PersonId, TreeData } from '../model/types';
import {
  CARD_H,
  CARD_W,
  COUPLE_GAP,
  H_GAP,
  V_GAP,
  boundsOf,
  type CardBox,
  type ChartLayout,
  type LinkLine,
} from './types';

// Раскладка схемы по поколениям.
//
// Принцип: у каждого человека своя «полоса» по ширине, в которой целиком помещаются
// он сам, его супруги и все потомки (или предки). Полосы соседей не пересекаются —
// поэтому карточки никогда не налезают друг на друга. Это не самая плотная раскладка,
// зато простая, быстрая (линейная) и предсказуемая.
//
// Виды:
//   descendants — потомки человека вниз (с супругами);
//   ancestors   — предки вверх;
//   family      — «песочные часы»: предки сверху, потомки снизу, братья и сёстры рядом.
//
// Горизонтальный вариант (предки слева, потомки справа) считается той же раскладкой
// в «повёрнутых» размерах: вдоль полосы карточка занимает свою высоту, поколение — ширину.
// Потом x и y меняются местами.

interface Dims {
  /** Размер карточки вдоль полосы (поперёк поколений) */
  w: number;
  /** Размер карточки вдоль оси поколений */
  h: number;
  hGap: number;
  coupleGap: number;
  vGap: number;
}

const VERTICAL: Dims = { w: CARD_W, h: CARD_H, hGap: H_GAP, coupleGap: COUPLE_GAP, vGap: V_GAP };
const HORIZONTAL: Dims = { w: CARD_H, h: CARD_W, hGap: 14, coupleGap: 10, vGap: 56 };

// Текущие размеры. Раскладка синхронная, поэтому общая переменная безопасна:
// её выставляет и возвращает обратно withDims() вокруг каждого вызова.
let D: Dims = VERTICAL;
const ROW_ = () => D.h + D.vGap;
const SPOUSE_STEP_ = () => D.w + D.coupleGap;

function withDims(horizontal: boolean, build: () => ChartLayout): ChartLayout {
  const prev = D;
  D = horizontal ? HORIZONTAL : VERTICAL;
  try {
    const out = build();
    return horizontal ? transpose(out) : out;
  } finally {
    D = prev;
  }
}

/** Поворот раскладки: x ↔ y. Карточки получают пометку направления (для стрелок «есть ещё») */
export function transpose(l: ChartLayout): ChartLayout {
  const cards = l.cards.map((c) => ({ ...c, x: c.y, y: c.x, dir: 'h' as const }));
  const lines = l.lines.map((ln) => ({ ...ln, points: ln.points.map(([x, y]) => [y, x] as [number, number]) }));
  return { cards, lines, bounds: boundsOf(cards) };
}

/** Рамка карточек в текущих размерах */
function boundsD(cards: CardBox[]) {
  if (!cards.length) return { minX: 0, minY: 0, maxX: D.w, maxY: D.h };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + D.w);
    maxY = Math.max(maxY, c.y + D.h);
  }
  return { minX, minY, maxX, maxY };
}

const byBirth = (tree: TreeData) => (a: PersonId, b: PersonId) =>
  (approxYear(tree.people[a]?.birth?.date) ?? 99999) - (approxYear(tree.people[b]?.birth?.date) ?? 99999);

class Builder {
  cards: CardBox[] = [];
  lines: LinkLine[] = [];
  private seq = 0;

  card(c: Omit<CardBox, 'key'>): CardBox {
    const box = { ...c, key: `${c.personId}#${this.seq++}` };
    this.cards.push(box);
    return box;
  }

  line(points: [number, number][], dashed?: boolean): void {
    this.lines.push({ key: `l${this.seq++}`, points, dashed: dashed || undefined });
  }

  result(): ChartLayout {
    return { cards: this.cards, lines: this.lines, bounds: boundsD(this.cards) };
  }
}

// ─── Потомки ────────────────────────────────────────────────────────────────

interface DChild {
  node: DNode;
  relation: ChildRelation;
}

interface DUnion {
  family: Family;
  spouseId?: PersonId;
  children: DChild[];
  /** Ширина блока детей этого союза */
  width: number;
}

interface DNode {
  id: PersonId;
  duplicate: boolean;
  moreBelow: boolean;
  left: DUnion[]; // союзы с супругами слева (от ближнего к дальнему)
  right: DUnion[]; // союзы с супругами справа
  single: DUnion[]; // второй родитель неизвестен
  unitWidth: number;
  width: number;
}

/** Союзы в порядке слева направо (так же расставляются их дети) */
const orderedUnions = (n: DNode) => [...[...n.left].reverse(), ...n.single, ...n.right];

function buildDesc(tree: TreeData, id: PersonId, depth: number, maxDepth: number, expanded: Set<PersonId>): DNode {
  const duplicate = expanded.has(id);
  expanded.add(id);
  const node: DNode = { id, duplicate, moreBelow: false, left: [], right: [], single: [], unitWidth: D.w, width: D.w };
  if (duplicate) return node;

  const sort = byBirth(tree);
  let spouseIndex = 0;
  for (const family of unionsOf(tree, id)) {
    const spouseId = family.partners.find((p) => p !== id);
    const children: DChild[] = [];
    if (depth < maxDepth) {
      const ids = family.children.map((c) => c.id).filter((c) => tree.people[c]);
      for (const cid of [...ids].sort(sort)) {
        const relation = family.children.find((c) => c.id === cid)!.relation;
        children.push({ node: buildDesc(tree, cid, depth + 1, maxDepth, expanded), relation });
      }
    } else if (family.children.length) {
      node.moreBelow = true;
    }
    const width = children.reduce((s, c) => s + c.node.width, 0) + D.hGap * Math.max(0, children.length - 1);
    const union: DUnion = { family, spouseId, children, width };
    if (!spouseId) node.single.push(union);
    else if (spouseIndex++ % 2 === 0) node.right.push(union);
    else node.left.push(union);
  }

  const spouses = node.left.length + node.right.length;
  node.unitWidth = D.w + spouses * SPOUSE_STEP_();
  const blocks = orderedUnions(node).filter((u) => u.width > 0);
  const childrenWidth = blocks.reduce((s, u) => s + u.width, 0) + D.hGap * Math.max(0, blocks.length - 1);
  node.width = Math.max(node.unitWidth, childrenWidth);
  return node;
}

/** Расставить узел потомков в полосе [left, left + width]. Возвращает центр карточки человека */
function placeDesc(b: Builder, n: DNode, left: number, depth: number, role: CardBox['role'] = 'main'): number {
  const y = depth * ROW_();
  const unitLeft = left + (n.width - n.unitWidth) / 2;
  const personX = unitLeft + n.left.length * SPOUSE_STEP_();
  b.card({ personId: n.id, x: personX, y, role, duplicate: n.duplicate || undefined, moreBelow: n.moreBelow || undefined });
  const personCx = personX + D.w / 2;
  const midY = y + D.h / 2;

  // Супруги и точка, откуда идёт линия к детям каждого союза
  const dropX = new Map<DUnion, number>();
  const placeSpouse = (u: DUnion, i: number, side: -1 | 1) => {
    const x = personX + side * (i + 1) * SPOUSE_STEP_();
    b.card({ personId: u.spouseId!, x, y, role: 'spouse' });
    const spouseCx = x + D.w / 2;
    // Линия пары (проходит «под» карточками, видна в промежутках)
    b.line(
      [
        [personCx, midY],
        [spouseCx, midY],
      ],
      u.family.status === 'divorced',
    );
    // Точка в промежутке рядом с этим супругом
    dropX.set(u, side === 1 ? x - D.coupleGap / 2 : x + D.w + D.coupleGap / 2);
  };
  n.right.forEach((u, i) => placeSpouse(u, i, 1));
  n.left.forEach((u, i) => placeSpouse(u, i, -1));
  n.single.forEach((u) => dropX.set(u, personCx));

  // Дети
  const blocks = orderedUnions(n).filter((u) => u.width > 0);
  const total = blocks.reduce((s, u) => s + u.width, 0) + D.hGap * Math.max(0, blocks.length - 1);
  let cursor = left + (n.width - total) / 2;
  blocks.forEach((u, ui) => {
    const centers: { cx: number; dashed: boolean }[] = [];
    for (const c of u.children) {
      centers.push({ cx: placeDesc(b, c.node, cursor, depth + 1), dashed: c.relation !== 'birth' });
      cursor += c.node.width + D.hGap;
    }
    // Промежуток между блоками союзов уже добавлен после последнего ребёнка
    const dx = dropX.get(u)!;
    const startY = u.spouseId ? midY : y + D.h;
    // Шины разных союзов чуть смещаем по высоте, чтобы не сливались
    const busY = y + D.h + D.vGap / 2 + (ui - (blocks.length - 1) / 2) * 6;
    const xs = [dx, ...centers.map((c) => c.cx)];
    b.line([
      [dx, startY],
      [dx, busY],
    ]);
    b.line([
      [Math.min(...xs), busY],
      [Math.max(...xs), busY],
    ]);
    for (const c of centers) {
      b.line(
        [
          [c.cx, busY],
          [c.cx, (depth + 1) * ROW_()],
        ],
        c.dashed,
      );
    }
  });
  return personCx;
}

export function layoutDescendants(tree: TreeData, rootId: PersonId, maxDepth: number, horizontal = false): ChartLayout {
  return withDims(horizontal, () => descendantsRaw(tree, rootId, maxDepth));
}

function descendantsRaw(tree: TreeData, rootId: PersonId, maxDepth: number): ChartLayout {
  const b = new Builder();
  if (!tree.people[rootId]) return b.result();
  const root = buildDesc(tree, rootId, 0, maxDepth, new Set());
  placeDesc(b, root, 0, 0);
  markDuplicateSpouses(b.cards);
  return b.result();
}

/** Супруг, который уже нарисован как основная карточка, помечается как «ссылка» */
function markDuplicateSpouses(cards: CardBox[]): void {
  const main = new Set(cards.filter((c) => c.role === 'main' && !c.duplicate).map((c) => c.personId));
  for (const c of cards) if (c.role === 'spouse' && main.has(c.personId)) c.duplicate = true;
}

// ─── Предки ─────────────────────────────────────────────────────────────────

interface ANode {
  id: PersonId;
  duplicate: boolean;
  moreAbove: boolean;
  parents: ANode[];
  relation: ChildRelation;
  family?: Family;
  width: number;
}

/** Семья родителей для схемы: родная, если есть, иначе первая */
export function mainParentFamily(tree: TreeData, id: PersonId): { family: Family; relation: ChildRelation } | undefined {
  const families = parentFamiliesOf(tree, id);
  const rel = (f: Family) => f.children.find((c) => c.id === id)!.relation;
  const family = families.find((f) => rel(f) === 'birth') ?? families[0];
  return family ? { family, relation: rel(family) } : undefined;
}

function sortParents(tree: TreeData, ids: PersonId[]): PersonId[] {
  const order = { M: 0, U: 1, F: 2 } as const;
  return [...ids].sort((a, b) => order[tree.people[a]?.sex ?? 'U'] - order[tree.people[b]?.sex ?? 'U']);
}

function buildAnc(tree: TreeData, id: PersonId, gen: number, maxGen: number, seen: Set<PersonId>): ANode {
  const duplicate = seen.has(id);
  seen.add(id);
  const node: ANode = { id, duplicate, moreAbove: false, parents: [], relation: 'birth', width: D.w };
  if (duplicate) return node;
  const pf = mainParentFamily(tree, id);
  if (!pf) return node;
  node.family = pf.family;
  node.relation = pf.relation;
  const parentIds = sortParents(tree, pf.family.partners.filter((p) => tree.people[p]));
  if (gen >= maxGen) {
    node.moreAbove = parentIds.length > 0;
    return node;
  }
  node.parents = parentIds.map((p) => buildAnc(tree, p, gen + 1, maxGen, seen));
  const sum = node.parents.reduce((s, p) => s + p.width, 0) + D.hGap * Math.max(0, node.parents.length - 1);
  node.width = Math.max(D.w, sum);
  return node;
}

function placeAnc(b: Builder, n: ANode, left: number, gen: number, skipSelf = false): number {
  const y = -gen * ROW_();
  let cx = left + n.width / 2;
  if (n.parents.length) {
    const total = n.parents.reduce((s, p) => s + p.width, 0) + D.hGap * (n.parents.length - 1);
    let cursor = left + (n.width - total) / 2;
    const centers = n.parents.map((p) => {
      const c = placeAnc(b, p, cursor, gen + 1);
      cursor += p.width + D.hGap;
      return c;
    });
    const parentMidY = y - ROW_() + D.h / 2;
    if (centers.length === 2) {
      b.line(
        [
          [centers[0]!, parentMidY],
          [centers[1]!, parentMidY],
        ],
        n.family?.status === 'divorced',
      );
      cx = (centers[0]! + centers[1]!) / 2;
      b.line(
        [
          [cx, parentMidY],
          [cx, y],
        ],
        n.relation !== 'birth',
      );
    } else {
      cx = centers[0]!;
      b.line(
        [
          [cx, y - D.vGap],
          [cx, y],
        ],
        n.relation !== 'birth',
      );
    }
  }
  const x = Math.min(Math.max(cx - D.w / 2, left), left + n.width - D.w);
  if (!skipSelf) {
    b.card({ personId: n.id, x, y, role: 'main', duplicate: n.duplicate || undefined, moreAbove: n.moreAbove || undefined });
  }
  return x + D.w / 2;
}

export function layoutAncestors(tree: TreeData, rootId: PersonId, maxGen: number, horizontal = false): ChartLayout {
  return withDims(horizontal, () => ancestorsRaw(tree, rootId, maxGen));
}

function ancestorsRaw(tree: TreeData, rootId: PersonId, maxGen: number): ChartLayout {
  const b = new Builder();
  if (!tree.people[rootId]) return b.result();
  placeAnc(b, buildAnc(tree, rootId, 0, maxGen, new Set()), 0, 0);
  return b.result();
}

// ─── «Песочные часы»: предки + потомки + братья и сёстры ────────────────────

export function layoutFamily(tree: TreeData, focusId: PersonId, up: number, down: number, horizontal = false): ChartLayout {
  return withDims(horizontal, () => familyRaw(tree, focusId, up, down));
}

function familyRaw(tree: TreeData, focusId: PersonId, up: number, down: number): ChartLayout {
  const b = new Builder();
  if (!tree.people[focusId]) return b.result();

  // Низ: сам человек, супруги, потомки
  const desc = buildDesc(tree, focusId, 0, down, new Set());
  const focusCx = placeDesc(b, desc, 0, 0);

  // Верх: предки (сам человек уже нарисован — пропускаем)
  // Уже нарисованные внизу люди сверху станут «ссылками» (кроме самого человека)
  const seen = new Set(collectIds(desc));
  seen.delete(focusId);
  const anc = buildAnc(tree, focusId, 0, up, seen);
  if (anc.parents.length) {
    const ancBuilder = new Builder();
    const ancCx = placeAnc(ancBuilder, anc, 0, 0, true);
    const shift = focusCx - ancCx;
    for (const c of ancBuilder.cards) b.card({ ...c, x: c.x + shift });
    for (const l of ancBuilder.lines) b.line(l.points.map(([x, y]) => [x + shift, y] as [number, number]), l.dashed);
  } else if (anc.moreAbove) {
    b.cards.find((c) => c.personId === focusId && c.role === 'main')!.moreAbove = true;
  }

  // Братья и сёстры — слева от человека и его супругов, на той же строке
  const { full, half } = siblingsOf(tree, focusId);
  const sort = byBirth(tree);
  const siblings = [
    ...full.map((p) => p.id).sort(sort).map((id) => ({ id, half: false })),
    ...half.map((p) => p.id).sort(sort).map((id) => ({ id, half: true })),
  ];
  if (siblings.length) {
    const rowLeft = Math.min(...b.cards.filter((c) => c.y === 0).map((c) => c.x));
    const busY = -D.vGap / 2;
    const hasParents = anc.parents.length > 0;
    siblings.forEach((s, i) => {
      const x = rowLeft - (siblings.length - i) * (D.w + D.hGap);
      b.card({ personId: s.id, x, y: 0, role: s.half ? 'halfSibling' : 'sibling' });
      if (hasParents) {
        b.line(
          [
            [x + D.w / 2, busY],
            [x + D.w / 2, 0],
          ],
          s.half,
        );
      }
    });
    if (hasParents) {
      const firstCx = rowLeft - siblings.length * (D.w + D.hGap) + D.w / 2;
      // Шина от братьев до линии, идущей от родителей к человеку
      const parentsDropX = findParentsDropX(b.lines, focusCx);
      b.line([
        [firstCx, busY],
        [parentsDropX ?? focusCx, busY],
      ]);
    }
  }

  markDuplicateSpouses(b.cards);
  return b.result();
}

/** x вертикальной линии, приходящей сверху к карточке человека в точке (focusCx, 0) */
function findParentsDropX(lines: LinkLine[], focusCx: number): number | undefined {
  for (const l of lines) {
    const last = l.points[l.points.length - 1]!;
    if (last[1] === 0 && Math.abs(last[0] - focusCx) < D.w / 2) return last[0];
  }
  return undefined;
}

function* collectIds(n: DNode): Generator<PersonId> {
  yield n.id;
  for (const u of [...n.left, ...n.right, ...n.single]) {
    if (u.spouseId) yield u.spouseId;
    for (const c of u.children) yield* collectIds(c.node);
  }
}
