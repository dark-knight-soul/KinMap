import type { PersonId, TreeData } from '../model/types';
import { approxYear } from '../model/dates';
import { unionsOf } from '../model/queries';
import { mainParentFamily } from './treeLayout';

// Веерная схема предков: человек в центре, родители — первое кольцо,
// бабушки и дедушки — второе и т.д. Каждое кольцо — полукруг (180°),
// у каждого предка своя доля: отец слева, мать справа.

export const FAN_CENTER_R = 64;
export const FAN_RING = 84;
/** Внешние кольца уже — там много маленьких секторов */
export const FAN_RING_OUTER = 64;
export const FAN_START = Math.PI; // слева
export const FAN_SPAN = Math.PI; // полукруг через верх

export interface FanSegment {
  key: string;
  personId: PersonId;
  gen: number;
  /** Углы в радианах (0 — вправо, π — влево, по часовой через верх при y вниз) */
  start: number;
  end: number;
  inner: number;
  outer: number;
  duplicate?: boolean;
}

export interface FanLayout {
  rootId: PersonId;
  segments: FanSegment[];
  radius: number;
  /** Полный круг (круговая схема потомков), а не полукруг веера */
  full?: boolean;
}

export function ringRadii(gen: number): [number, number] {
  let inner = FAN_CENTER_R;
  for (let g = 1; g < gen; g++) inner += g <= 3 ? FAN_RING : FAN_RING_OUTER;
  return [inner, inner + (gen <= 3 ? FAN_RING : FAN_RING_OUTER)];
}

export function layoutFan(tree: TreeData, rootId: PersonId, maxGen: number): FanLayout {
  const segments: FanSegment[] = [];
  const seen = new Set<PersonId>([rootId]);
  let deepest = 0;

  const visit = (id: PersonId, gen: number, slot: number) => {
    if (gen >= maxGen) return;
    const pf = mainParentFamily(tree, id);
    if (!pf) return;
    const parents = pf.family.partners.filter((p) => tree.people[p]);
    // Отец — левая половина доли, мать — правая; пол неизвестен — свободная половина
    const father = parents.find((p) => tree.people[p]!.sex === 'M');
    const mother = parents.find((p) => tree.people[p]!.sex === 'F');
    const rest = parents.filter((p) => p !== father && p !== mother);
    const slots: [PersonId | undefined, PersonId | undefined] = [father, mother];
    for (const p of rest) {
      if (!slots[0]) slots[0] = p;
      else if (!slots[1]) slots[1] = p;
    }
    const g = gen + 1;
    const count = 2 ** g;
    const [inner, outer] = ringRadii(g);
    slots.forEach((pid, half) => {
      if (!pid) return;
      const s = slot * 2 + half;
      const duplicate = seen.has(pid);
      seen.add(pid);
      deepest = Math.max(deepest, g);
      segments.push({
        key: `${pid}@${g}.${s}`,
        personId: pid,
        gen: g,
        start: FAN_START + (FAN_SPAN * s) / count,
        end: FAN_START + (FAN_SPAN * (s + 1)) / count,
        inner,
        outer,
        duplicate: duplicate || undefined,
      });
      if (!duplicate) visit(pid, g, s);
    });
  };

  if (tree.people[rootId]) visit(rootId, 0, 0);
  return { rootId, segments, radius: deepest ? ringRadii(deepest)[1] : FAN_CENTER_R };
}

// ─── Круговая схема потомков ────────────────────────────────────────────────
// Человек в центре, дети — первое кольцо, внуки — второе… на полный круг (360°).
// Доля каждого пропорциональна числу его «концевых» потомков: у кого больше
// потомков, у того шире сектор, и внешние кольца не слипаются.

interface CNode {
  id: PersonId;
  children: CNode[];
  weight: number;
  duplicate: boolean;
}

export function layoutCircle(tree: TreeData, rootId: PersonId, maxGen: number): FanLayout {
  const segments: FanSegment[] = [];
  if (!tree.people[rootId]) return { rootId, segments, radius: FAN_CENTER_R, full: true };
  const seen = new Set<PersonId>();
  const birth = (id: PersonId) => approxYear(tree.people[id]?.birth?.date) ?? 99999;

  const build = (id: PersonId, gen: number): CNode => {
    const duplicate = seen.has(id);
    seen.add(id);
    const node: CNode = { id, children: [], weight: 1, duplicate };
    if (duplicate || gen >= maxGen) return node;
    const kids = [...new Set(unionsOf(tree, id).flatMap((f) => f.children.map((c) => c.id)))]
      .filter((c) => tree.people[c])
      .sort((a, b) => birth(a) - birth(b));
    node.children = kids.map((k) => build(k, gen + 1));
    if (node.children.length) node.weight = node.children.reduce((s, c) => s + c.weight, 0);
    return node;
  };
  const root = build(rootId, 0);

  let deepest = 0;
  // Начинаем сверху (−90°) и идём по часовой стрелке
  const place = (n: CNode, gen: number, start: number, end: number) => {
    let a = start;
    for (const c of n.children) {
      const span = ((end - start) * c.weight) / n.weight;
      const g = gen + 1;
      const [inner, outer] = ringRadii(g);
      deepest = Math.max(deepest, g);
      segments.push({
        key: `${c.id}@${g}.${segments.length}`,
        personId: c.id,
        gen: g,
        start: a,
        end: a + span,
        inner,
        outer,
        duplicate: c.duplicate || undefined,
      });
      place(c, g, a, a + span);
      a += span;
    }
  };
  place(root, 0, -Math.PI / 2, (3 * Math.PI) / 2);
  return { rootId, segments, radius: deepest ? ringRadii(deepest)[1] : FAN_CENTER_R, full: true };
}
