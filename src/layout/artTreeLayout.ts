import { approxYear } from '../model/dates';
import { unionsOf } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import type { Bounds } from './types';

// Художественное «Дерево»: родоначальник у основания кроны (над стволом),
// его дети — толстые ветви, внуки — ветви тоньше и т.д. Люди — круглые «листья»
// с фото или инициалами. Крона — полукруг вверх: у каждого потомка свой сектор,
// пропорциональный числу его «концевых» потомков, поэтому ветви не перекрещиваются.

export const ART_ROOT_R = 38;
export const ART_NODE_R = 28;
/** Минимальное расстояние между соседними «листьями» на внешнем ярусе */
const MIN_ARC = 92;
const MIN_STEP = 150;
/** Крона шире, чем выше, — так больше похоже на дерево */
const WIDEN = 1.25;
/** Сектор кроны: от −π + PAD до −PAD (вверх) */
const PAD = 0.32;
export const TRUNK_H = 190;

export interface ArtNode {
  key: string;
  personId: PersonId;
  gen: number;
  x: number;
  y: number;
  r: number;
  /** Направление ветви (угол, рад) — по нему рисуются листья и изгиб */
  angle: number;
  parentKey?: string;
  /** Супруги (маленькие кружки рядом) */
  spouses: PersonId[];
  hasChildren: boolean;
  duplicate?: boolean;
  /** Есть потомки за пределом показанных поколений */
  more?: boolean;
}

export interface ArtTreeLayout {
  rootId: PersonId;
  nodes: ArtNode[];
  bounds: Bounds;
}

interface TNode {
  id: PersonId;
  children: TNode[];
  weight: number;
  duplicate: boolean;
  more: boolean;
}

export function layoutArtTree(tree: TreeData, rootId: PersonId, maxGen: number): ArtTreeLayout {
  const empty: ArtTreeLayout = { rootId, nodes: [], bounds: { minX: -100, minY: -100, maxX: 100, maxY: TRUNK_H } };
  if (!tree.people[rootId]) return empty;
  const seen = new Set<PersonId>();
  const birth = (id: PersonId) => approxYear(tree.people[id]?.birth?.date) ?? 99999;
  let depth = 0;

  const build = (id: PersonId, gen: number): TNode => {
    const duplicate = seen.has(id);
    seen.add(id);
    depth = Math.max(depth, gen);
    const node: TNode = { id, children: [], weight: 1, duplicate, more: false };
    if (duplicate) return node;
    const kids = [...new Set(unionsOf(tree, id).flatMap((f) => f.children.map((c) => c.id)))]
      .filter((c) => tree.people[c])
      .sort((a, b) => birth(a) - birth(b));
    if (gen >= maxGen) {
      node.more = kids.length > 0;
      return node;
    }
    node.children = kids.map((k) => build(k, gen + 1));
    if (node.children.length) node.weight = node.children.reduce((s, c) => s + c.weight, 0);
    return node;
  };
  const root = build(rootId, 0);

  const span = Math.PI - 2 * PAD;
  // Шаг между ярусами: чтобы на внешнем ярусе «листьям» хватало места
  const outerR = Math.max(MIN_STEP * Math.max(1, depth), (root.weight * MIN_ARC) / (span * WIDEN));
  const step = depth ? outerR / depth : MIN_STEP;

  const spousesOf = (id: PersonId) =>
    unionsOf(tree, id)
      .flatMap((f) => f.partners)
      .filter((p) => p !== id && tree.people[p]);

  const nodes: ArtNode[] = [];
  const place = (n: TNode, gen: number, a0: number, a1: number, parentKey?: string) => {
    const angle = gen === 0 ? -Math.PI / 2 : (a0 + a1) / 2;
    const r = gen * step;
    const key = `${n.id}@${nodes.length}`;
    nodes.push({
      key,
      personId: n.id,
      gen,
      x: Math.cos(angle) * r * WIDEN,
      y: Math.sin(angle) * r,
      r: gen === 0 ? ART_ROOT_R : ART_NODE_R,
      angle,
      parentKey,
      spouses: n.duplicate ? [] : spousesOf(n.id),
      hasChildren: n.children.length > 0,
      duplicate: n.duplicate || undefined,
      more: n.more || undefined,
    });
    let a = a0;
    for (const c of n.children) {
      const w = ((a1 - a0) * c.weight) / n.weight;
      place(c, gen + 1, a, a + w, key);
      a += w;
    }
  };
  place(root, 0, -Math.PI + PAD, -PAD);

  // Рамка: «листья» с подписями, ствол и земля
  let minX = -160;
  let maxX = 160;
  let minY = 0;
  for (const nd of nodes) {
    minX = Math.min(minX, nd.x - nd.r - 70);
    maxX = Math.max(maxX, nd.x + nd.r + 70);
    minY = Math.min(minY, nd.y - nd.r - 40);
  }
  return { rootId, nodes, bounds: { minX, minY, maxX, maxY: TRUNK_H + 50 } };
}
