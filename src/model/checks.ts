import { approxYear } from './dates';
import { childrenOf, isAncestor, parentsOf } from './queries';
import type { DatePart, FuzzyDate, Person, PersonId, TreeData } from './types';

// Проверка данных на явные ошибки: «мать младше ребёнка», «родился после смерти матери»…
//
// Даты бывают неточными («ок. 1950», «до 1920»), поэтому каждая дата — это диапазон
// [самый ранний день, самый поздний день]. Замечание выдаётся, только если ошибка есть
// ПРИ ЛЮБОМ варианте внутри диапазонов — так мы не пугаем ложными тревогами.

export type IssueCode =
  | 'deathBeforeBirth'
  | 'tooOld'
  | 'parentTooYoung'
  | 'motherTooOld'
  | 'fatherTooOld'
  | 'bornAfterMotherDeath'
  | 'bornAfterFatherDeath'
  | 'marriageBeforeBirth'
  | 'marriedTooYoung'
  | 'marriageAfterDeath'
  | 'siblingsTooClose'
  | 'ownAncestor'
  | 'possibleDuplicate';

export interface Issue {
  /** Ключ для «это не ошибка»: код + участники */
  key: string;
  code: IssueCode;
  severity: 'error' | 'warning';
  /** Участники: первый — о ком замечание, второй — с кем связано */
  personIds: PersonId[];
  params?: Record<string, number>;
}

const YEAR = 365.25;
export const LIMITS = {
  maxAge: 120,
  minParentAge: 12,
  maxMotherAge: 55,
  maxFatherAge: 85,
  minMarriageAge: 14,
  /** Ребёнок может родиться позже смерти отца, но не более чем через ~10 месяцев */
  posthumousDays: 300,
  /** Дети одной матери с разницей меньше ~8 месяцев (кроме близнецов) */
  siblingGapDays: 240,
};

/** День как число (примерно; для сравнений в годах этого достаточно) */
const dayNum = (y: number, m = 1, d = 1) => y * YEAR + (m - 1) * 30.44 + (d - 1);

function partRange(p: DatePart): [number, number] {
  if (p.m === undefined) return [dayNum(p.y), dayNum(p.y, 12, 31)];
  if (p.d === undefined) return [dayNum(p.y, p.m), dayNum(p.y, p.m, 31)];
  const d = dayNum(p.y, p.m, p.d);
  return [d, d];
}

/** Диапазон возможных дней для неточной даты; null — даты нет или не разобрана */
export function dateRange(fd: FuzzyDate | undefined): [number, number] | null {
  if (!fd?.date) return null;
  const [a, b] = partRange(fd.date);
  switch (fd.q) {
    case 'about':
      return [a - 3 * YEAR, b + 3 * YEAR];
    case 'before':
      return [-Infinity, b];
    case 'after':
      return [a, Infinity];
    case 'between':
      return [a, fd.date2 ? partRange(fd.date2)[1] : b];
    default:
      return [a, b];
  }
}

const isExact = (fd: FuzzyDate | undefined) => !!fd?.date?.d && !fd.q;

const issueKey = (code: IssueCode, ids: PersonId[]) => `${code}:${[...ids].sort().join(',')}`;

const cache = new WeakMap<TreeData, Issue[]>();

/** Все замечания по древу (с учётом «это не ошибка»). Результат кэшируется на версию древа */
export function computeIssues(tree: TreeData): Issue[] {
  const cached = cache.get(tree);
  if (cached) return cached;

  const issues: Issue[] = [];
  const add = (code: IssueCode, severity: Issue['severity'], personIds: PersonId[], params?: Issue['params']) =>
    issues.push({ key: issueKey(code, personIds), code, severity, personIds, params });

  const people = Object.values(tree.people);

  for (const p of people) {
    const birth = dateRange(p.birth?.date);
    const death = dateRange(p.death?.date);

    if (birth && death && death[1] < birth[0]) add('deathBeforeBirth', 'error', [p.id]);
    if (birth && death && death[0] - birth[1] > LIMITS.maxAge * YEAR) {
      add('tooOld', 'warning', [p.id], { years: LIMITS.maxAge });
    }
    if (isAncestor(tree, p.id, p.id)) add('ownAncestor', 'error', [p.id]);

    // Проверки «родитель — ребёнок» (только для родных детей)
    for (const c of childrenOf(tree, p.id)) {
      if (c.relation !== 'birth') continue;
      const cb = dateRange(c.person.birth?.date);
      if (!cb) continue;
      if (birth && cb[1] - birth[0] < LIMITS.minParentAge * YEAR) {
        add('parentTooYoung', 'warning', [c.person.id, p.id], { years: LIMITS.minParentAge });
      }
      if (birth && p.sex === 'F' && cb[0] - birth[1] > LIMITS.maxMotherAge * YEAR) {
        add('motherTooOld', 'warning', [c.person.id, p.id], { years: LIMITS.maxMotherAge });
      }
      if (birth && p.sex === 'M' && cb[0] - birth[1] > LIMITS.maxFatherAge * YEAR) {
        add('fatherTooOld', 'warning', [c.person.id, p.id], { years: LIMITS.maxFatherAge });
      }
      if (death && p.sex === 'F' && cb[0] > death[1]) add('bornAfterMotherDeath', 'error', [c.person.id, p.id]);
      if (death && p.sex === 'M' && cb[0] > death[1] + LIMITS.posthumousDays) {
        add('bornAfterFatherDeath', 'error', [c.person.id, p.id]);
      }
    }
  }

  // Браки
  for (const f of Object.values(tree.families)) {
    const m = dateRange(f.marriage?.date);
    if (!m) continue;
    for (const pid of f.partners) {
      const p = tree.people[pid];
      if (!p) continue;
      const other = f.partners.find((x) => x !== pid);
      const ids = other ? [pid, other] : [pid];
      const b = dateRange(p.birth?.date);
      const d = dateRange(p.death?.date);
      if (b && m[1] < b[0]) add('marriageBeforeBirth', 'error', ids);
      else if (b && m[1] - b[0] < LIMITS.minMarriageAge * YEAR) {
        add('marriedTooYoung', 'warning', ids, { years: LIMITS.minMarriageAge });
      }
      if (d && m[0] > d[1]) add('marriageAfterDeath', 'error', ids);
    }
  }

  // Дети одной матери, родившиеся слишком близко (точные даты, не в один день)
  for (const mother of people.filter((p) => p.sex === 'F')) {
    const kids = childrenOf(tree, mother.id)
      .filter((c) => c.relation === 'birth' && isExact(c.person.birth?.date))
      .map((c) => ({ id: c.person.id, day: dateRange(c.person.birth!.date)![0] }))
      .sort((a, b) => a.day - b.day);
    for (let i = 1; i < kids.length; i++) {
      const gap = kids[i]!.day - kids[i - 1]!.day;
      if (gap > 2 && gap < LIMITS.siblingGapDays) add('siblingsTooClose', 'warning', [kids[i]!.id, kids[i - 1]!.id]);
    }
  }

  // Возможные дубликаты: одинаковые имя, фамилия и год рождения
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    const y = approxYear(p.birth?.date);
    const name = `${p.names.given ?? ''}|${p.names.surname ?? ''}`.toLocaleLowerCase().replace(/ё/g, 'е');
    if (!p.names.given || !p.names.surname || y === undefined) continue;
    const k = `${name}|${y}`;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const g of groups.values()) {
    for (let i = 1; i < g.length; i++) {
      // Родители и дети с одинаковым именем — не дубликаты (бывает «Иван Иванович»)
      if (parentsOf(tree, g[i]!.id).some((x) => x.person.id === g[0]!.id)) continue;
      add('possibleDuplicate', 'warning', [g[i]!.id, g[0]!.id]);
    }
  }

  // «Это не ошибка»: замечание скрыто, если его отметил любой из участников
  const result = issues.filter(
    (iss, i, arr) =>
      arr.findIndex((x) => x.key === iss.key) === i &&
      !iss.personIds.some((id) => tree.people[id]?.ignoredChecks?.includes(iss.key)),
  );
  cache.set(tree, result);
  return result;
}

/** Замечания, касающиеся человека */
export function issuesOf(tree: TreeData, id: PersonId): Issue[] {
  return computeIssues(tree).filter((i) => i.personIds.includes(id));
}
