import { approxYear } from '../model/dates';
import { childrenOf, parentFamiliesOf, parentsOf, unionsOf } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import type { Bounds } from './types';

// Художественное «Дерево». Два режима:
//
//   ancestors   — родословное дерево: человек у основания кроны (над стволом),
//                 в кроне — его предки: род отца слева, род матери справа,
//                 выше — деды, прадеды… (по умолчанию 7 поколений).
//                 Неизвестный отец или мать — пустой кружок «+», чтобы видеть пробелы.
//   descendants — дерево потомков: родоначальник над стволом, дети — толстые ветви,
//                 внуки — тоньше и т.д.
//   full        — человек целиком: предки в кроне (как ancestors), потомки — в корнях под землёй.
//   clan        — весь род: от ствола две большие ветви — род отца (потомки самого старшего
//                 предка по отцу) слева и род матери (потомки старшего предка по её отцу) справа.
//                 У жён и мужей, пришедших из других семей, — их родители (маленькие кружки).
//                 Мать стоит рядом с отцом в роду отца, а в роду матери — ссылкой (пунктир),
//                 чтобы её дети не рисовались дважды.
//
// Люди — круглые «листья» с фото или инициалами. Крона — полукруг вверх: у каждой ветви
// свой сектор, пропорциональный числу её «концевых» людей, поэтому ветви не перекрещиваются.

export const ART_ROOT_R = 38;
export const ART_NODE_R = 28;
export const ART_GHOST_R = 20;
/** Минимальное расстояние между соседними «листьями» на внешнем ярусе */
const MIN_ARC = 124;
const MIN_STEP = 165;
/** Крона шире, чем выше, — так больше похоже на дерево */
const WIDEN = 1.25;
/** Сектор кроны: от −π + PAD до −PAD (вверх) */
const PAD = 0.32;
/** Пустой кружок «+» занимает меньше места, чем человек */
const GHOST_WEIGHT = 0.6;
export const TRUNK_H = 190;

export type ArtMode = 'ancestors' | 'descendants' | 'full' | 'clan';

/** Ключ «узла-основания» корней: от него идут корни к детям в режиме full */
export const ROOTS_ANCHOR = 'roots-anchor';
/** Откуда растут корни (y): чуть ниже земли */
export const ROOTS_TOP = TRUNK_H + 36;

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
  /** Есть ещё люди за пределом показанных поколений */
  more?: boolean;
  /** Сколько «концевых» людей у ветви (сам человек — 1): от этого толщина ветви */
  weight: number;
  /** Человек в корнях (потомок в режиме full): рисуется под землёй, без листвы */
  under?: boolean;
  /** Родители супругов, пришедших из других семей (режим clan): супруг → [отец, мать] */
  spouseParents?: Record<PersonId, PersonId[]>;
}

/** Пустое место для неизвестного отца или матери: по клику — добавить */
export interface ArtGhost {
  key: string;
  /** Чей это родитель */
  childId: PersonId;
  kind: 'father' | 'mother';
  x: number;
  y: number;
  angle: number;
  parentKey: string;
}

export interface ArtTreeLayout {
  mode: ArtMode;
  rootId: PersonId;
  nodes: ArtNode[];
  ghosts: ArtGhost[];
  /** Потомки в корнях (режим full); у детей человека parentKey = ROOTS_ANCHOR */
  under: ArtNode[];
  bounds: Bounds;
  /** Радиус «облака» кроны вокруг каждого человека */
  crownR: number;
}

/** Толщина ветви к человеку — растёт с числом людей на ней */
export const branchWidth = (weight: number) => Math.min(30, 4 + 3.4 * Math.sqrt(weight));
/** Половина ширины ствола вверху — по толщине всех ветвей */
export const trunkHalf = (rootWeight: number) => Math.max(18, branchWidth(rootWeight) * 0.9 + 8);

interface TNode {
  id: PersonId;
  children: TNode[];
  weight: number;
  duplicate: boolean;
  more: boolean;
  /** Пустое место для неизвестного родителя */
  ghost?: 'father' | 'mother';
  /** Родословное дерево: чья это сторона у родителей человека в центре */
  side?: 'father' | 'mother';
}

/**
 * От кого растить «Дерево потомков». Если у выбранного человека есть дети — от него самого.
 * Если детей нет (дерево вышло бы «пеньком» из одного кружка) — от самого старшего
 * предка по отцовской линии, чтобы человек оказался на ветке своего рода.
 * depth — на каком поколении от корня стоит выбранный человек.
 */
export function artTreeRoot(tree: TreeData, focus: PersonId, always = false): { root: PersonId; depth: number } {
  if (!tree.people[focus] || (!always && childrenOf(tree, focus).length)) return { root: focus, depth: 0 };
  const seen = new Set<PersonId>([focus]);
  let cur = focus;
  let depth = 0;
  for (;;) {
    // Родной отец, потом родная мать, потом приёмные
    const parents = parentsOf(tree, cur)
      .filter((p) => !seen.has(p.person.id))
      .sort((a, b) => Number(a.relation !== 'birth') - Number(b.relation !== 'birth') || Number(a.person.sex !== 'M') - Number(b.person.sex !== 'M'));
    const next = parents[0]?.person.id;
    if (!next) return { root: cur, depth };
    seen.add(next);
    cur = next;
    depth++;
  }
}

/**
 * «Строитель» дерева потомков с общим учётом: кто уже нарисован, какие союзы уже показаны
 * (их дети не повторяются) и кто стоит на схеме супругом. Человек, у которого все союзы
 * уже показаны там, где он супруг, становится ссылкой (пунктиром).
 */
function descBuilder(tree: TreeData, maxGen: number) {
  const seen = new Set<PersonId>();
  const doneFamilies = new Set<string>();
  const spouses = new Set<PersonId>();
  const birth = (id: PersonId) => approxYear(tree.people[id]?.birth?.date) ?? 99999;
  const state = { depth: 0 };

  const build = (id: PersonId, gen: number): TNode => {
    const duplicate = seen.has(id);
    seen.add(id);
    state.depth = Math.max(state.depth, gen);
    const node: TNode = { id, children: [], weight: 1, duplicate, more: false };
    if (duplicate) return node;
    const unions = unionsOf(tree, id);
    const fresh = unions.filter((f) => !doneFamilies.has(f.id));
    // Все союзы уже показаны в другом месте, где человек стоит супругом, — здесь только ссылка
    if (unions.length && !fresh.length && spouses.has(id)) {
      node.duplicate = true;
      return node;
    }
    const kids = [...new Set(fresh.flatMap((f) => f.children.map((c) => c.id)))]
      .filter((c) => tree.people[c])
      .sort((a, b) => birth(a) - birth(b));
    if (gen >= maxGen) {
      node.more = kids.length > 0;
      return node;
    }
    for (const f of fresh) {
      doneFamilies.add(f.id);
      for (const p of f.partners) if (p !== id) spouses.add(p);
    }
    node.children = kids.map((k) => build(k, gen + 1));
    if (node.children.length) node.weight = node.children.reduce((s, c) => s + c.weight, 0);
    return node;
  };
  return { build, seen, state };
}

/** Дерево потомков (как раньше) */
export function layoutArtTree(tree: TreeData, rootId: PersonId, maxGen: number, mode: ArtMode = 'descendants'): ArtTreeLayout {
  if (!tree.people[rootId]) return emptyLayout(rootId, mode);
  const b = descBuilder(tree, maxGen);
  const root = b.build(rootId, 0);
  return radial(tree, mode, root, b.state.depth, () => true);
}

/** Сколько поколений показывать во «Всём роде» — по сути без ограничения */
const CLAN_DEPTH = 100;

/**
 * Весь род: потомки самого старшего предка по отцу (выбранный человек — на своей ветке),
 * у супругов из других семей — их родители.
 */
export function layoutArtClan(tree: TreeData, focusId: PersonId): ArtTreeLayout {
  if (!tree.people[focusId]) return emptyLayout(focusId, 'clan');
  const fatherRoot = artTreeRoot(tree, focusId, true).root;
  const mother = parentsForTree(tree, focusId).mother;
  // Род матери — только если известны её предки: иначе ветка состояла бы из одной ссылки на неё
  const mr = mother ? artTreeRoot(tree, mother, true).root : undefined;
  const motherRoot = mr && mr !== mother ? mr : undefined;

  const b = descBuilder(tree, CLAN_DEPTH);
  let layout: ArtTreeLayout;
  if (!motherRoot || motherRoot === fatherRoot) {
    layout = radial(tree, 'clan', b.build(fatherRoot, 0), b.state.depth, () => true);
  } else {
    // Две ветви от ствола: род отца слева, род матери справа. Сам ствол — «пустой» узел без человека
    const fatherClan = b.build(fatherRoot, 1);
    fatherClan.side = 'father';
    const motherClan = b.build(motherRoot, 1);
    motherClan.side = 'mother';
    const top: TNode = {
      id: '',
      children: [fatherClan, motherClan],
      weight: fatherClan.weight + motherClan.weight,
      duplicate: false,
      more: false,
    };
    layout = radial(tree, 'clan', top, b.state.depth, () => true, true);
  }
  const inClan = new Set(layout.nodes.map((n) => n.personId));
  for (const n of layout.nodes) {
    const sp: Record<PersonId, PersonId[]> = {};
    for (const s of n.spouses) {
      if (inClan.has(s)) continue;
      const parents = parentsForTree(tree, s);
      const ids = [parents.father, parents.mother].filter((x): x is PersonId => !!x);
      if (ids.length) sp[s] = ids;
    }
    if (Object.keys(sp).length) n.spouseParents = sp;
  }
  return layout;
}

/**
 * Человек целиком: предки в кроне (род отца слева, матери справа), потомки — в корнях.
 * Корни — то же дерево потомков, отражённое вниз от основания ствола.
 */
export function layoutArtFull(tree: TreeData, focusId: PersonId, gens: number, ghosts = true): ArtTreeLayout {
  const anc = layoutArtAncestors(tree, focusId, gens, ghosts);
  if (!tree.people[focusId]) return { ...anc, mode: 'full' };
  const desc = layoutArtTree(tree, focusId, gens);
  const top = desc.nodes.find((n) => n.gen === 0);
  const under: ArtNode[] = desc.nodes
    .filter((n) => n.gen > 0)
    .map((n) => ({
      ...n,
      y: ROOTS_TOP - n.y,
      angle: -n.angle,
      parentKey: n.parentKey === top?.key ? ROOTS_ANCHOR : n.parentKey,
      under: true,
    }));
  const b = { ...anc.bounds };
  for (const n of under) {
    b.minX = Math.min(b.minX, n.x - n.r - 80);
    b.maxX = Math.max(b.maxX, n.x + n.r + 80);
    b.maxY = Math.max(b.maxY, n.y + n.r + 50);
  }
  return { ...anc, mode: 'full', under, bounds: b };
}

/**
 * Родословное дерево: предки человека, род отца слева, род матери справа.
 * ghosts — показывать пустые места для неизвестных родителей (на экране да, в печати нет).
 */
export function layoutArtAncestors(tree: TreeData, focusId: PersonId, maxGen: number, ghosts = true): ArtTreeLayout {
  if (!tree.people[focusId]) return emptyLayout(focusId, 'ancestors');
  const seen = new Set<PersonId>();
  let depth = 0;

  const build = (id: PersonId, gen: number): TNode => {
    const duplicate = seen.has(id);
    seen.add(id);
    depth = Math.max(depth, gen);
    const node: TNode = { id, children: [], weight: 1, duplicate, more: false };
    if (duplicate) return node;
    const { father, mother } = parentsForTree(tree, id);
    if (gen >= maxGen) {
      node.more = !!(father || mother);
      return node;
    }
    const slot = (pid: PersonId | undefined, kind: 'father' | 'mother'): TNode | null => {
      const n: TNode | null = pid
        ? build(pid, gen + 1)
        : ghosts
          ? { id: '', children: [], weight: GHOST_WEIGHT, duplicate: false, more: false, ghost: kind }
          : null;
      if (!pid && n) depth = Math.max(depth, gen + 1);
      if (n && gen === 0) n.side = kind;
      return n;
    };
    // Порядок важен: первый ребёнок узла уходит влево — туда идёт род отца
    node.children = [slot(father, 'father'), slot(mother, 'mother')].filter((x): x is TNode => !!x);
    if (node.children.length) node.weight = node.children.reduce((s, c) => s + c.weight, 0);
    return node;
  };
  const root = build(focusId, 0);
  // Супруг(а) — только у самого человека: у предков второй супруг и так стоит рядом, на соседней ветке
  return radial(tree, 'ancestors', root, depth, (gen) => gen === 0, true);
}

/** Отец и мать для родословного дерева: из родной семьи (иначе — из первой) */
function parentsForTree(tree: TreeData, id: PersonId): { father?: PersonId; mother?: PersonId } {
  const families = parentFamiliesOf(tree, id);
  const rel = (fid: string) => tree.families[fid]?.children.find((c) => c.id === id)?.relation;
  const family = families.find((f) => rel(f.id) === 'birth') ?? families[0];
  if (!family) return {};
  const partners = family.partners.filter((p) => tree.people[p]);
  let father = partners.find((p) => tree.people[p]!.sex === 'M');
  let mother = partners.find((p) => tree.people[p]!.sex === 'F');
  // Пол не указан — занимаем свободное место
  for (const p of partners) {
    if (p === father || p === mother) continue;
    if (!father) father = p;
    else if (!mother) mother = p;
  }
  return { father, mother };
}

function emptyLayout(rootId: PersonId, mode: ArtMode): ArtTreeLayout {
  return { mode, rootId, nodes: [], ghosts: [], under: [], bounds: { minX: -100, minY: -100, maxX: 100, maxY: TRUNK_H }, crownR: 0 };
}

/** Расстановка по полукругу: у каждой ветви свой сектор, пропорциональный её весу */
function radial(
  tree: TreeData,
  mode: ArtMode,
  root: TNode,
  /** Глубина больше не нужна: радиусы ярусов считаются по тому, сколько людей на каждом */
  _depth: number,
  withSpouses: (gen: number) => boolean,
  /** Родословное: крона пополам — слева род отца, справа род матери, сколько бы людей ни было известно */
  halves = false,
): ArtTreeLayout {
  const fullSpan = Math.PI - 2 * PAD;
  // Мало людей — крона уже, ветви идут вверх, а не в стороны («крестом»)
  const span = halves ? fullSpan : Math.min(fullSpan, 0.5 + 0.33 * root.weight);
  const start = -Math.PI / 2 - span / 2;

  // Сколько угла нужно ветке (при шаге между ярусами MIN_STEP): сам человек на своём ярусе
  // занимает дугу MIN_ARC, а ветка целиком — не меньше суммы своих детей. Все эти углы
  // обратно пропорциональны шагу, поэтому шаг подбирается одним делением.
  const req = new Map<TNode, number>();
  const calc = (n: TNode, gen: number): number => {
    const own = gen === 0 ? 0 : (MIN_ARC * (n.ghost ? GHOST_WEIGHT : 1)) / (gen * MIN_STEP * WIDEN);
    const kids = n.children.reduce((sum, c) => sum + calc(c, gen + 1), 0);
    const r = Math.max(own, kids);
    req.set(n, r);
    return r;
  };
  calc(root, 0);
  const sideReq = (side: 'father' | 'mother') =>
    root.children.filter((c) => (c.side ?? 'father') === side).reduce((sum, c) => sum + req.get(c)!, 0);
  // Во сколько раз не хватает места при шаге MIN_STEP — во столько и раздвигаем ярусы
  const squeeze = halves
    ? Math.max(sideReq('father'), sideReq('mother')) / (span / 2)
    : req.get(root)! / span;
  const step = MIN_STEP * Math.max(1, squeeze);

  // Обход с секторами: детям — доли сектора по их нужному углу (лишнее место — поровну пропорционально)
  const walk = (visit: (n: TNode, gen: number, a0: number, a1: number, parentKey?: string) => string | null) => {
    const share = (kids: TNode[], gen: number, a0: number, a1: number, key: string) => {
      const total = kids.reduce((sum, c) => sum + Math.max(req.get(c)!, 1e-9), 0);
      let a = a0;
      for (const c of kids) {
        const w = ((a1 - a0) * Math.max(req.get(c)!, 1e-9)) / total;
        go(c, gen + 1, a, a + w, key);
        a += w;
      }
    };
    const go = (n: TNode, gen: number, a0: number, a1: number, parentKey?: string) => {
      const key = visit(n, gen, a0, a1, parentKey);
      if (key === null || !n.children.length) return;
      if (gen === 0 && halves) {
        // Род отца — левая половина кроны, род матери — правая
        const mid = (a0 + a1) / 2;
        share(n.children.filter((c) => c.side !== 'mother'), 0, a0, mid, key);
        share(n.children.filter((c) => c.side === 'mother'), 0, mid, a1, key);
        return;
      }
      share(n.children, gen, a0, a1, key);
    };
    go(root, 0, start, start + span);
  };

  const spousesOf = (id: PersonId) =>
    unionsOf(tree, id)
      .flatMap((f) => f.partners)
      .filter((p) => p !== id && tree.people[p]);

  const nodes: ArtNode[] = [];
  const ghosts: ArtGhost[] = [];
  const place = (n: TNode, gen: number, a0: number, a1: number, parentKey?: string): string | null => {
    const angle = gen === 0 ? -Math.PI / 2 : (a0 + a1) / 2;
    const r = gen * step;
    const x = Math.cos(angle) * r * WIDEN;
    const y = Math.sin(angle) * r;
    if (n.ghost) {
      ghosts.push({ key: `ghost-${n.ghost}@${parentKey}`, childId: '', kind: n.ghost, x, y, angle, parentKey: parentKey! });
      return null;
    }
    const key = `${n.id}@${nodes.length}`;
    nodes.push({
      key,
      personId: n.id,
      gen,
      x,
      y,
      r: gen === 0 ? ART_ROOT_R : ART_NODE_R,
      angle,
      parentKey,
      spouses: n.duplicate || !withSpouses(gen) ? [] : spousesOf(n.id),
      hasChildren: n.children.some((c) => !c.ghost),
      duplicate: n.duplicate || undefined,
      more: n.more || undefined,
      weight: n.weight,
    });
    return key;
  };
  walk(place);

  // Чей родитель пустое место — по ключу родительского узла
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  for (const g of ghosts) g.childId = byKey.get(g.parentKey)?.personId ?? '';

  // Крона — мягкое «облако» вокруг людей: радиус от шага между ярусами
  const crownR = Math.min(130, Math.max(90, step * 0.62));

  // Рамка: «листья» с подписями, крона, ствол, земля и подписи родов
  let minX = -300;
  let maxX = 300;
  let minY = 0;
  for (const nd of [...nodes, ...ghosts]) {
    const pad = Math.max(ART_NODE_R + 75, crownR);
    minX = Math.min(minX, nd.x - pad);
    maxX = Math.max(maxX, nd.x + pad);
    minY = Math.min(minY, nd.y - Math.max(ART_NODE_R + 40, crownR));
  }
  return { mode, rootId: root.id, nodes, ghosts, under: [], bounds: { minX, minY, maxX, maxY: TRUNK_H + 50 }, crownR };
}
