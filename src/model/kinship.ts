import { parentFamiliesOf, unionsOf } from './queries';
import type { ChildRelation, PersonId, TreeData, UnionStatus } from './types';

// Поиск связи между двумя людьми — «кем B приходится A».
//
// Древо — это граф: от человека можно шагнуть вверх (к родителю), вниз (к ребёнку)
// или вбок (к супругу). Ищем кратчайшую цепочку от A к B со строгими правилами:
//   1) сначала меньше браков в цепочке (кровное родство важнее родства через брак);
//   2) потом меньше шагов;
//   3) внутри кровного участка — сначала только вверх, потом только вниз
//      (через общего предка). Так «двоюродный брат» — это 2 шага вверх и 2 вниз,
//      а не «сын тёти по какой-то другой дороге».
// Цепочка делится на кровные участки, разделённые браками: [кровь] (брак [кровь])*.

export type StepKind = 'up' | 'down' | 'spouse';

export interface Step {
  kind: StepKind;
  from: PersonId;
  to: PersonId;
  /** Для вверх/вниз — родной, приёмный… */
  relation?: ChildRelation;
  /** Для брака — его статус */
  status?: UnionStatus;
}

/** Кровный участок цепочки: сколько поколений вверх и вниз */
export interface BloodSegment {
  start: PersonId;
  end: PersonId;
  up: number;
  down: number;
  /** Общий предок (вершина участка), если были шаги и вверх, и вниз */
  top?: PersonId;
  /** Общий только один из родителей (для братьев/сестёр — единокровные/единоутробные) */
  half: boolean;
  /** В участке есть усыновление/опека */
  adopted: boolean;
}

export interface Kinship {
  steps: Step[];
  /** Люди по цепочке от A до B */
  path: PersonId[];
  segments: BloodSegment[];
  /** Статусы браков между участками (их на один меньше, чем участков) */
  marriages: UnionStatus[];
}

const MAX_MARRIAGES = 3;
const MAX_STEPS = 40;

interface Node {
  id: PersonId;
  /** 0 — ещё можно вверх; 1 — уже шли вниз в этом участке */
  phase: 0 | 1;
}

const keyOf = (n: Node) => `${n.id}|${n.phase}`;

export function findKinship(tree: TreeData, a: PersonId, b: PersonId): Kinship | null {
  if (!tree.people[a] || !tree.people[b]) return null;
  if (a === b) return { steps: [], path: [a], segments: [{ start: a, end: a, up: 0, down: 0, half: false, adopted: false }], marriages: [] };

  // Дейкстра по стоимости «браки × 1000 + шаги». Стоимости небольшие целые —
  // используем «корзины» по стоимости вместо кучи.
  const cost = new Map<string, number>();
  const prev = new Map<string, { node: Node; step: Step }>();
  const buckets: Node[][] = [];
  const push = (n: Node, c: number) => {
    (buckets[c] ??= []).push(n);
  };
  const start: Node = { id: a, phase: 0 };
  cost.set(keyOf(start), 0);
  push(start, 0);

  let found: Node | null = null;
  for (let c = 0; c < buckets.length && !found; c++) {
    for (const node of buckets[c] ?? []) {
      if (cost.get(keyOf(node)) !== c) continue;
      if (node.id === b) {
        found = node;
        break;
      }
      const marriages = Math.floor(c / 1000);
      const steps = c % 1000;
      if (steps >= MAX_STEPS) continue;

      const relax = (next: Node, step: Step, nc: number) => {
        const k = keyOf(next);
        if (nc < (cost.get(k) ?? Infinity)) {
          cost.set(k, nc);
          prev.set(k, { node, step });
          push(next, nc);
        }
      };

      // Вверх — только пока не начали спускаться
      if (node.phase === 0) {
        for (const f of parentFamiliesOf(tree, node.id)) {
          const relation = f.children.find((x) => x.id === node.id)!.relation;
          for (const p of f.partners) {
            relax({ id: p, phase: 0 }, { kind: 'up', from: node.id, to: p, relation }, c + 1);
          }
        }
      }
      // Вниз
      for (const f of unionsOf(tree, node.id)) {
        for (const ch of f.children) {
          relax({ id: ch.id, phase: 1 }, { kind: 'down', from: node.id, to: ch.id, relation: ch.relation }, c + 1);
        }
      }
      // К супругу — новый кровный участок
      if (marriages < MAX_MARRIAGES) {
        for (const f of unionsOf(tree, node.id)) {
          for (const p of f.partners) {
            if (p !== node.id) relax({ id: p, phase: 0 }, { kind: 'spouse', from: node.id, to: p, status: f.status }, c + 1001);
          }
        }
      }
    }
  }
  if (!found) return null;

  // Восстанавливаем цепочку
  const steps: Step[] = [];
  let k = keyOf(found);
  while (prev.has(k)) {
    const p = prev.get(k)!;
    steps.unshift(p.step);
    k = keyOf(p.node);
  }
  return fromSteps(tree, a, steps);
}

function fromSteps(tree: TreeData, a: PersonId, steps: Step[]): Kinship {
  const path = [a, ...steps.map((s) => s.to)];
  const segments: BloodSegment[] = [];
  const marriages: UnionStatus[] = [];
  let seg: BloodSegment = { start: a, end: a, up: 0, down: 0, half: false, adopted: false };
  let lastUp: PersonId | undefined;

  steps.forEach((s) => {
    if (s.kind === 'spouse') {
      segments.push(seg);
      marriages.push(s.status ?? 'unknown');
      seg = { start: s.to, end: s.to, up: 0, down: 0, half: false, adopted: false };
      lastUp = undefined;
      return;
    }
    if (s.relation === 'adopted' || s.relation === 'foster') seg.adopted = true;
    if (s.kind === 'up') {
      seg.up++;
      lastUp = s.from;
    } else {
      if (seg.down === 0 && seg.up > 0) {
        // Поворот вниз: вершина участка — общий предок
        seg.top = s.from;
        seg.half = !shareBothParents(tree, s.from, lastUp!, s.to);
      }
      seg.down++;
    }
    seg.end = s.to;
  });
  segments.push(seg);
  return { steps, path, segments, marriages };
}

/**
 * Родные ли по обоим родителям два ребёнка общего предка `top`
 * (оба в одной семье, где два родителя, и второй родитель тоже общий).
 */
function shareBothParents(tree: TreeData, top: PersonId, c1: PersonId, c2: PersonId): boolean {
  return Object.values(tree.families).some(
    (f) =>
      f.partners.length === 2 &&
      f.partners.includes(top) &&
      f.children.some((c) => c.id === c1) &&
      f.children.some((c) => c.id === c2),
  );
}

/**
 * Все кровные связи (бывает несколько, если родственники женились между собой).
 * Возвращает пары «вверх/вниз» через разных ближайших общих предков.
 */
export function bloodRelations(tree: TreeData, a: PersonId, b: PersonId): { up: number; down: number; via: PersonId }[] {
  const depthsA = ancestorDepths(tree, a);
  const depthsB = ancestorDepths(tree, b);
  const sum = (x: PersonId) => depthsA.get(x)! + depthsB.get(x)!;
  const common = [...depthsA.keys()].filter((x) => depthsB.has(x)).sort((p, q) => sum(p) - sum(q));

  // Связь через общего предка X считается, только если от A и от B до X есть
  // две дороги, которые не пересекаются нигде, кроме X. Так дедушка родных братьев
  // не даёт «вторую» связь (обе дороги идут через их отца), а при браке родственников
  // находятся действительно разные связи.
  const seen = new Set<string>();
  const out: { up: number; down: number; via: PersonId }[] = [];
  for (const x of common) {
    const pair = disjointPaths(tree, a, b, x);
    if (!pair) continue;
    const r = { up: pair[0].length - 1, down: pair[1].length - 1, via: x };
    const k = `${r.up}:${r.down}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(r);
    }
  }
  return out;
}

/** Пара дорог вверх A→X и B→X без общих людей (кроме X) или null */
function disjointPaths(tree: TreeData, a: PersonId, b: PersonId, x: PersonId): [PersonId[], PersonId[]] | null {
  const tryOrder = (first: PersonId, second: PersonId): [PersonId[], PersonId[]] | null => {
    const p1 = upPath(tree, first, x, new Set());
    if (!p1) return null;
    const p2 = upPath(tree, second, x, new Set(p1.slice(0, -1)));
    return p2 ? [p1, p2] : null;
  };
  const ab = tryOrder(b, a);
  if (ab) return [ab[1], ab[0]];
  return tryOrder(a, b);
}

/** Кратчайшая дорога вверх от `from` до предка `to`, не заходя в `avoid` */
function upPath(tree: TreeData, from: PersonId, to: PersonId, avoid: Set<PersonId>): PersonId[] | null {
  if (avoid.has(from)) return null;
  const prev = new Map<PersonId, PersonId | null>([[from, null]]);
  let level = [from];
  while (level.length && !prev.has(to)) {
    const next: PersonId[] = [];
    for (const v of level) {
      for (const f of parentFamiliesOf(tree, v)) {
        for (const p of f.partners) {
          if (prev.has(p) || avoid.has(p)) continue;
          prev.set(p, v);
          next.push(p);
        }
      }
    }
    level = next;
  }
  if (!prev.has(to)) return null;
  const path: PersonId[] = [];
  for (let v: PersonId | null = to; v !== null; v = prev.get(v) ?? null) path.unshift(v);
  return path;
}

const depthCache = new WeakMap<TreeData, Map<PersonId, Map<PersonId, number>>>();

/** Предки человека (включая его самого, глубина 0) с минимальной глубиной */
function ancestorDepths(tree: TreeData, id: PersonId): Map<PersonId, number> {
  let byPerson = depthCache.get(tree);
  if (!byPerson) depthCache.set(tree, (byPerson = new Map()));
  const cached = byPerson.get(id);
  if (cached) return cached;
  const depths = new Map<PersonId, number>([[id, 0]]);
  let level = [id];
  for (let d = 1; level.length && d < 60; d++) {
    const next: PersonId[] = [];
    for (const x of level) {
      for (const f of parentFamiliesOf(tree, x)) {
        for (const p of f.partners) {
          if (!depths.has(p)) {
            depths.set(p, d);
            next.push(p);
          }
        }
      }
    }
    level = next;
  }
  byPerson.set(id, depths);
  return depths;
}
