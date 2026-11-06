import { approxYear } from './dates';
import { genderSurname } from './names';
import { isLiving, parentFamiliesOf } from './queries';
import type { PersonId, TreeData } from './types';

// Статистика рода: сколько людей и поколений, продолжительность жизни,
// частые имена, фамилии и места, насколько полно заполнено древо.

export interface TreeStats {
  people: number;
  families: number;
  males: number;
  females: number;
  living: number;
  /** Самая длинная цепочка «родитель → ребёнок» */
  generations: number;
  earliest?: { id: PersonId; year: number };
  latest?: { id: PersonId; year: number };
  avgLifespan?: number;
  /** Средняя продолжительность жизни по векам рождения (век — 19 для 1801–1900) */
  byCentury: { century: number; avg: number; count: number }[];
  longestLived: { id: PersonId; years: number }[];
  topGivenMale: [string, number][];
  topGivenFemale: [string, number][];
  topSurnames: [string, number][];
  topPlaces: [string, number][];
  /** Доля людей с датой рождения / с фото (0..1) */
  withBirthDate: number;
  withPhoto: number;
}

const top = (counts: Map<string, number>, n: number): [string, number][] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

const bump = (m: Map<string, number>, key: string | undefined) => {
  if (key) m.set(key, (m.get(key) ?? 0) + 1);
};

export function computeStats(tree: TreeData, currentYear = new Date().getFullYear()): TreeStats {
  const people = Object.values(tree.people);
  const given = { M: new Map<string, number>(), F: new Map<string, number>() };
  const surnames = new Map<string, number>();
  const places = new Map<string, number>();
  const centuries = new Map<number, { sum: number; count: number }>();
  const lifespans: { id: PersonId; years: number }[] = [];
  let earliest: TreeStats['earliest'];
  let latest: TreeStats['latest'];

  for (const p of people) {
    if (p.sex === 'M' || p.sex === 'F') bump(given[p.sex], p.names.given?.trim());
    // Иванов и Иванова — одна фамилия
    bump(surnames, p.names.surname ? genderSurname(p.names.surname.trim(), 'M') : undefined);
    // Место — до первой запятой: «Казань, Россия» → «Казань»
    bump(places, p.birth?.place?.split(',')[0]?.trim());

    const b = approxYear(p.birth?.date);
    const d = approxYear(p.death?.date);
    if (b !== undefined) {
      if (!earliest || b < earliest.year) earliest = { id: p.id, year: b };
      if (!latest || b > latest.year) latest = { id: p.id, year: b };
    }
    if (b !== undefined && d !== undefined && d >= b && d - b < 130) {
      const years = d - b;
      lifespans.push({ id: p.id, years });
      const century = Math.floor((b - 1) / 100) + 1;
      const c = centuries.get(century) ?? { sum: 0, count: 0 };
      c.sum += years;
      c.count++;
      centuries.set(century, c);
    }
  }

  // Поколения: длина самой длинной цепочки предков (с защитой от зацикленных данных)
  const depth = new Map<PersonId, number>();
  const visiting = new Set<PersonId>();
  const depthOf = (id: PersonId): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let best = 0;
    for (const f of parentFamiliesOf(tree, id)) for (const p of f.partners) best = Math.max(best, depthOf(p));
    visiting.delete(id);
    depth.set(id, best + 1);
    return best + 1;
  };
  let generations = 0;
  for (const p of people) generations = Math.max(generations, depthOf(p.id));

  return {
    people: people.length,
    families: Object.keys(tree.families).length,
    males: people.filter((p) => p.sex === 'M').length,
    females: people.filter((p) => p.sex === 'F').length,
    living: people.filter((p) => isLiving(p, currentYear)).length,
    generations,
    earliest,
    latest,
    avgLifespan: lifespans.length ? Math.round(lifespans.reduce((s, l) => s + l.years, 0) / lifespans.length) : undefined,
    byCentury: [...centuries.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([century, c]) => ({ century, avg: Math.round(c.sum / c.count), count: c.count })),
    longestLived: [...lifespans].sort((a, b) => b.years - a.years).slice(0, 3),
    topGivenMale: top(given.M, 5),
    topGivenFemale: top(given.F, 5),
    topSurnames: top(surnames, 5),
    topPlaces: top(places, 5),
    withBirthDate: people.length ? people.filter((p) => p.birth?.date?.date).length / people.length : 0,
    withPhoto: people.length ? people.filter((p) => p.photos?.length).length / people.length : 0,
  };
}
