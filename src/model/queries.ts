import { approxYear } from './dates';
import type { ChildRelation, Family, FamilyId, Person, PersonId, TreeData } from './types';

// Вопросы к древу: кто родители, дети, супруги, братья и сёстры.
// Только чтение — изменения делаются в ops.ts.

export interface ParentLink {
  person: Person;
  familyId: FamilyId;
  relation: ChildRelation;
}

export interface ChildLink {
  person: Person;
  familyId: FamilyId;
  relation: ChildRelation;
}

// Индекс «человек → его семьи». Строится один раз на каждую версию древа
// (древо неизменяемое, поэтому кэш по самому объекту всегда верен).
// Без индекса каждый вопрос перебирает все семьи — на 5000 людях схема тормозила бы.
interface TreeIndex {
  unions: Map<PersonId, Family[]>;
  parentFamilies: Map<PersonId, Family[]>;
}

const indexCache = new WeakMap<TreeData, TreeIndex>();
const EMPTY: Family[] = [];

function indexOf(tree: TreeData): TreeIndex {
  let idx = indexCache.get(tree);
  if (!idx) {
    idx = { unions: new Map(), parentFamilies: new Map() };
    const push = (map: Map<PersonId, Family[]>, id: PersonId, f: Family) => {
      const list = map.get(id);
      if (list) list.push(f);
      else map.set(id, [f]);
    };
    for (const f of Object.values(tree.families)) {
      for (const p of f.partners) push(idx.unions, p, f);
      for (const c of f.children) push(idx.parentFamilies, c.id, f);
    }
    indexCache.set(tree, idx);
  }
  return idx;
}

/** Семьи, где человек — ребёнок */
export function parentFamiliesOf(tree: TreeData, id: PersonId): Family[] {
  return indexOf(tree).parentFamilies.get(id) ?? EMPTY;
}

/** Семьи (союзы), где человек — партнёр */
export function unionsOf(tree: TreeData, id: PersonId): Family[] {
  return indexOf(tree).unions.get(id) ?? EMPTY;
}

export function parentsOf(tree: TreeData, id: PersonId): ParentLink[] {
  const out: ParentLink[] = [];
  for (const f of parentFamiliesOf(tree, id)) {
    const relation = f.children.find((c) => c.id === id)!.relation;
    for (const pid of f.partners) {
      const person = tree.people[pid];
      if (person) out.push({ person, familyId: f.id, relation });
    }
  }
  return out;
}

export function spousesOf(tree: TreeData, id: PersonId): { person: Person; family: Family }[] {
  const out: { person: Person; family: Family }[] = [];
  for (const f of unionsOf(tree, id)) {
    for (const pid of f.partners) {
      const person = pid !== id ? tree.people[pid] : undefined;
      if (person) out.push({ person, family: f });
    }
  }
  return out;
}

export function childrenOf(tree: TreeData, id: PersonId): ChildLink[] {
  const out: ChildLink[] = [];
  for (const f of unionsOf(tree, id)) {
    for (const c of f.children) {
      const person = tree.people[c.id];
      if (person) out.push({ person, familyId: f.id, relation: c.relation });
    }
  }
  return out;
}

/** Братья и сёстры: родные (общая семья) и единокровные/единоутробные (общий один родитель) */
export function siblingsOf(tree: TreeData, id: PersonId): { full: Person[]; half: Person[] } {
  const full = new Map<PersonId, Person>();
  const half = new Map<PersonId, Person>();
  const ownFamilies = parentFamiliesOf(tree, id);

  for (const f of ownFamilies) {
    for (const c of f.children) {
      const p = tree.people[c.id];
      if (p && c.id !== id) full.set(c.id, p);
    }
  }
  for (const f of ownFamilies) {
    for (const parentId of f.partners) {
      for (const other of unionsOf(tree, parentId)) {
        if (other.id === f.id) continue;
        for (const c of other.children) {
          const p = tree.people[c.id];
          if (p && c.id !== id && !full.has(c.id)) half.set(c.id, p);
        }
      }
    }
  }
  return { full: [...full.values()], half: [...half.values()] };
}

/** Является ли `ancestorId` предком `personId` (через любые связи родитель→ребёнок) */
export function isAncestor(tree: TreeData, ancestorId: PersonId, personId: PersonId): boolean {
  const seen = new Set<PersonId>();
  const stack = [personId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const f of parentFamiliesOf(tree, cur)) {
      for (const p of f.partners) {
        if (p === ancestorId) return true;
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
  }
  return false;
}

/** Сколько лет считаем «возможно жив», если дата смерти неизвестна */
export const LIVING_MAX_AGE = 100;

/**
 * Жив ли человек — для скрытия данных при экспорте.
 * Ручная отметка важнее; иначе: есть смерть → умер; родился меньше 100 лет назад
 * или год рождения неизвестен → считаем живым (безопаснее для приватности).
 */
export function isLiving(person: Person, currentYear = new Date().getFullYear()): boolean {
  if (person.living !== undefined) return person.living;
  if (person.death && (person.death.date || person.death.place)) return false;
  const born = approxYear(person.birth?.date);
  if (born === undefined) return true;
  return currentYear - born < LIVING_MAX_AGE;
}

/** Полное имя: Имя Отчество Фамилия */
export function fullName(person: Person): string {
  const n = person.names;
  return [n.given, n.patronymic, n.surname].filter(Boolean).join(' ').trim();
}

/** Ключ сортировки списка: Фамилия Имя Отчество */
export function sortKey(person: Person): string {
  const n = person.names;
  // Разделитель — пробел: при сравнении строк он учитывается и идёт раньше букв
  // (невидимый символ U+0000 сравнение пропускает, и «Демидова Анна» оказывалась раньше «Демидов Алексей»)
  return [n.surname, n.given, n.patronymic].map((s) => s ?? '').join(' ').toLocaleLowerCase();
}

/** Поиск по всем частям имени, без учёта регистра и «ё/е» */
export function matchesQuery(person: Person, query: string): boolean {
  const norm = (s: string) => s.toLocaleLowerCase().replace(/ё/g, 'е');
  const words = norm(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const n = person.names;
  const hay = norm([n.given, n.patronymic, n.surname, n.birthSurname].filter(Boolean).join(' '));
  return words.every((w) => hay.includes(w));
}
