import { childrenOf, parentsOf } from './queries';
import type { PersonId, TreeData } from './types';

// Сколько поколений известно у человека: предков (родители, деды, прадеды…)
// и потомков (дети, внуки…), и сколько в них людей. Считаем по уровням,
// каждого человека — один раз (на случай браков между родственниками и ошибок в данных).

export interface KnownGenerations {
  /** Поколений предков: 1 — известны родители, 2 — деды и бабушки… */
  up: number;
  upPeople: number;
  /** Поколений потомков: 1 — дети, 2 — внуки… */
  down: number;
  downPeople: number;
}

function levels(start: PersonId, next: (id: PersonId) => PersonId[]): { depth: number; people: number } {
  const seen = new Set<PersonId>([start]);
  let frontier = [start];
  let depth = 0;
  let people = 0;
  for (;;) {
    const level: PersonId[] = [];
    for (const id of frontier) {
      for (const n of next(id)) {
        if (seen.has(n)) continue;
        seen.add(n);
        level.push(n);
      }
    }
    if (!level.length) return { depth, people };
    depth++;
    people += level.length;
    frontier = level;
  }
}

/** Число всех потомков каждого человека (каждый потомок считается один раз) */
export function countDescendants(tree: TreeData): Map<PersonId, number> {
  const kids = new Map<PersonId, PersonId[]>();
  for (const f of Object.values(tree.families)) {
    for (const p of f.partners) {
      const list = kids.get(p) ?? [];
      for (const c of f.children) if (tree.people[c.id]) list.push(c.id);
      kids.set(p, list);
    }
  }
  const out = new Map<PersonId, number>();
  for (const id of Object.keys(tree.people)) {
    const seen = new Set<PersonId>();
    const stack = [...(kids.get(id) ?? [])];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen.has(c) || c === id) continue;
      seen.add(c);
      stack.push(...(kids.get(c) ?? []));
    }
    out.set(id, seen.size);
  }
  return out;
}

export interface DescendantRoot {
  id: PersonId;
  /** Сколько у него потомков */
  count: number;
  /** На сколько поколений он выше выбранного человека (0 — сам человек) */
  depth: number;
}

/**
 * От кого можно показать «Дерево потомков» для выбранного человека: он сам (если есть дети)
 * и все его предки по обеим линиям. По умолчанию — сам человек, а если детей нет —
 * предок с самым большим родом (при равенстве — ближе и по отцу).
 */
export function descendantRoots(tree: TreeData, id: PersonId): { list: DescendantRoot[]; best?: PersonId } {
  if (!tree.people[id]) return { list: [] };
  const counts = countDescendants(tree);
  const list: DescendantRoot[] = [];
  const seen = new Set<PersonId>([id]);
  let level = [id];
  for (let depth = 0; level.length; depth++) {
    for (const p of level) if ((counts.get(p) ?? 0) > 0) list.push({ id: p, count: counts.get(p)!, depth });
    const next: PersonId[] = [];
    for (const p of level) {
      const ps = parentsOf(tree, p)
        .map((x) => x.person)
        .sort((a, b) => (a.sex === 'M' ? 0 : 1) - (b.sex === 'M' ? 0 : 1));
      for (const q of ps) if (!seen.has(q.id)) (seen.add(q.id), next.push(q.id));
    }
    level = next;
  }
  const own = list.find((x) => x.id === id);
  const best = own?.id ?? [...list].sort((a, b) => b.count - a.count)[0]?.id;
  return { list, best };
}

export function knownGenerations(tree: TreeData, id: PersonId): KnownGenerations {
  if (!tree.people[id]) return { up: 0, upPeople: 0, down: 0, downPeople: 0 };
  const up = levels(id, (x) => parentsOf(tree, x).map((p) => p.person.id));
  const down = levels(id, (x) => childrenOf(tree, x).map((c) => c.person.id));
  return { up: up.depth, upPeople: up.people, down: down.depth, downPeople: down.people };
}
