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

export function knownGenerations(tree: TreeData, id: PersonId): KnownGenerations {
  if (!tree.people[id]) return { up: 0, upPeople: 0, down: 0, downPeople: 0 };
  const up = levels(id, (x) => parentsOf(tree, x).map((p) => p.person.id));
  const down = levels(id, (x) => childrenOf(tree, x).map((c) => c.person.id));
  return { up: up.depth, upPeople: up.people, down: down.depth, downPeople: down.people };
}
