import { approxYear } from './dates';
import { mainParentFamily } from '../layout/treeLayout';
import { unionsOf } from './queries';
import type { Family, PersonId, TreeData } from './types';

// Родословные росписи — классические текстовые отчёты генеалогии.
//
// Потомки (поколенная роспись): родоначальник — «1», его дети — «1.1», «1.2»…,
// внуки — «1.1.1» и т.д. (нумерация д’Абовиля). Записи идут по поколениям («коленам»).
//
// Предки (нумерация Соса — Страдоница): человек — 1, отец — 2, мать — 3,
// у человека с номером n отец — 2n, мать — 2n+1. Поколение — по номеру: 2–3, 4–7, 8–15…

export interface DescUnion {
  family: Family;
  spouseId?: PersonId;
  /** Номера детей этого союза */
  children: string[];
}

export interface DescEntry {
  num: string;
  personId: PersonId;
  /** Колено: родоначальник — 1 */
  gen: number;
  /** Номер родителя (кроме родоначальника) */
  parentNum?: string;
  /** Человек уже есть в росписи под этим номером (браки между родственниками) */
  seeNum?: string;
  unions: DescUnion[];
  /** Есть потомки дальше показанных колен */
  more: boolean;
}

const byBirth = (tree: TreeData) => (a: PersonId, b: PersonId) =>
  (approxYear(tree.people[a]?.birth?.date) ?? 99999) - (approxYear(tree.people[b]?.birth?.date) ?? 99999);

export function descendantReport(tree: TreeData, rootId: PersonId, maxGen = 99): DescEntry[] {
  if (!tree.people[rootId]) return [];
  const out: DescEntry[] = [];
  const numOf = new Map<PersonId, string>();
  // Обход в ширину — так записи сразу идут по коленам
  const queue: { id: PersonId; num: string; gen: number; parentNum?: string }[] = [{ id: rootId, num: '1', gen: 1 }];
  const sort = byBirth(tree);
  while (queue.length) {
    const { id, num, gen, parentNum } = queue.shift()!;
    const seen = numOf.get(id);
    if (seen) {
      out.push({ num, personId: id, gen, parentNum, seeNum: seen, unions: [], more: false });
      continue;
    }
    numOf.set(id, num);
    const entry: DescEntry = { num, personId: id, gen, parentNum, unions: [], more: false };
    // Дети всех союзов нумеруются подряд по году рождения
    const unions = unionsOf(tree, id);
    const kids = [...new Set(unions.flatMap((f) => f.children.map((c) => c.id)))].filter((c) => tree.people[c]).sort(sort);
    const kidNum = new Map(kids.map((k, i) => [k, `${num}.${i + 1}`]));
    for (const family of unions) {
      const spouseId = family.partners.find((p) => p !== id && tree.people[p]);
      const children = family.children.filter((c) => kidNum.has(c.id)).map((c) => c.id).sort(sort).map((c) => kidNum.get(c)!);
      entry.unions.push({ family, spouseId, children: gen < maxGen ? children : [] });
    }
    if (gen < maxGen) for (const k of kids) queue.push({ id: k, num: kidNum.get(k)!, gen: gen + 1, parentNum: num });
    else entry.more = kids.length > 0;
    out.push(entry);
  }
  return out;
}

export interface AncEntry {
  num: number;
  personId: PersonId;
  /** Поколение: человек — 0, родители — 1… */
  gen: number;
  /** Этот предок уже встречался под другим номером («потеря предков» при браке родственников) */
  seeNum?: number;
}

export function ancestorReport(tree: TreeData, rootId: PersonId, maxGen = 12): AncEntry[] {
  if (!tree.people[rootId]) return [];
  const out: AncEntry[] = [];
  const numOf = new Map<PersonId, number>();
  const queue: { id: PersonId; num: number; gen: number }[] = [{ id: rootId, num: 1, gen: 0 }];
  while (queue.length) {
    const { id, num, gen } = queue.shift()!;
    const seen = numOf.get(id);
    if (seen !== undefined) {
      out.push({ num, personId: id, gen, seeNum: seen });
      continue;
    }
    numOf.set(id, num);
    out.push({ num, personId: id, gen });
    if (gen >= maxGen) continue;
    const pf = mainParentFamily(tree, id);
    if (!pf) continue;
    const parents = pf.family.partners.filter((p) => tree.people[p]);
    const father = parents.find((p) => tree.people[p]!.sex === 'M');
    const mother = parents.find((p) => p !== father && tree.people[p]!.sex === 'F');
    // Пол не указан — на свободное место
    const rest = parents.filter((p) => p !== father && p !== mother);
    const slots: (PersonId | undefined)[] = [father, mother];
    for (const p of rest) slots[slots[0] ? 1 : 0] ??= p;
    slots.forEach((p, i) => p && queue.push({ id: p, num: num * 2 + i, gen: gen + 1 }));
  }
  return out.sort((a, b) => a.num - b.num);
}

/** Родоначальник по умолчанию: самый дальний предок по мужской линии (отец отца…) */
export function progenitorOf(tree: TreeData, id: PersonId): PersonId {
  let cur = id;
  const seen = new Set<PersonId>([id]);
  for (;;) {
    const pf = mainParentFamily(tree, cur);
    const parents = pf?.family.partners.filter((p) => tree.people[p]) ?? [];
    const next = parents.find((p) => tree.people[p]!.sex === 'M') ?? parents[0];
    if (!next || seen.has(next)) return cur;
    seen.add(next);
    cur = next;
  }
}
