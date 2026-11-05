import { isLiving } from './queries';
import type { FuzzyDate, PersonId, TreeData } from './types';

// Календарь семейных дат: дни рождения, памятные даты, годовщины свадеб.
//
// Берутся только точные даты (известны день и месяц, без «около/до/после»).
// Живым — «день рождения, исполнится N лет»; умершим — «N лет со дня рождения/смерти».
// Родившиеся 29 февраля в невисокосный год отмечаются 28 февраля.

export type CalEventKind = 'birthday' | 'birthMemorial' | 'deathMemorial' | 'wedding' | 'weddingMemorial';

export interface CalEvent {
  kind: CalEventKind;
  personIds: PersonId[];
  familyId?: string;
  /** Исходная дата события */
  year: number;
  month: number;
  day: number;
}

export interface YMD {
  y: number;
  m: number;
  d: number;
}

export interface Occurrence extends CalEvent {
  /** Когда событие отмечается в этот раз */
  date: YMD;
  /** Сколько лет исполняется */
  years: number;
  /** Через сколько дней (0 — сегодня) */
  daysUntil: number;
  /** Круглая дата */
  jubilee: boolean;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const dayNumber = (d: YMD) => Date.UTC(d.y, d.m - 1, d.d) / 86_400_000;

export function todayYMD(now = new Date()): YMD {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** Точная дата (день и месяц известны, без «около» и т.п.) */
function exact(fd: FuzzyDate | undefined): { year: number; month: number; day: number } | null {
  if (!fd?.date || fd.q || fd.date.m === undefined || fd.date.d === undefined) return null;
  return { year: fd.date.y, month: fd.date.m, day: fd.date.d };
}

/**
 * Круглая дата: 10, 20, 30…; 25; после 50 — каждые 5 лет (55, 60, 65…).
 * Для памятных дат то же правило (100 лет со дня рождения — круглая).
 */
export function isJubilee(years: number): boolean {
  return years > 0 && (years % 10 === 0 || years === 25 || (years >= 50 && years % 5 === 0));
}

const cache = new WeakMap<TreeData, Map<number, CalEvent[]>>();

/** Все события древа (для текущего года — от него зависит, кто считается живым) */
export function collectEvents(tree: TreeData, currentYear = new Date().getFullYear()): CalEvent[] {
  let byYear = cache.get(tree);
  if (!byYear) cache.set(tree, (byYear = new Map()));
  const cached = byYear.get(currentYear);
  if (cached) return cached;

  const events: CalEvent[] = [];
  for (const p of Object.values(tree.people)) {
    const alive = isLiving(p, currentYear);
    const b = exact(p.birth?.date);
    if (b) events.push({ kind: alive ? 'birthday' : 'birthMemorial', personIds: [p.id], ...b });
    const d = exact(p.death?.date);
    if (d && !alive) events.push({ kind: 'deathMemorial', personIds: [p.id], ...d });
  }
  for (const f of Object.values(tree.families)) {
    if (f.status === 'divorced' || f.partners.length !== 2) continue;
    const m = exact(f.marriage?.date);
    if (!m) continue;
    const bothAlive = f.partners.every((id) => {
      const p = tree.people[id];
      return p ? isLiving(p, currentYear) : false;
    });
    events.push({ kind: bothAlive ? 'wedding' : 'weddingMemorial', personIds: [...f.partners], familyId: f.id, ...m });
  }
  byYear.set(currentYear, events);
  return events;
}

/** Когда событие отмечается в году y (29 февраля → 28 февраля в невисокосный год) */
export function occurrenceIn(e: CalEvent, y: number): YMD {
  if (e.month === 2 && e.day === 29 && !isLeap(y)) return { y, m: 2, d: 28 };
  return { y, m: e.month, d: e.day };
}

function makeOccurrence(e: CalEvent, date: YMD, today: YMD): Occurrence | null {
  const years = date.y - e.year;
  if (years <= 0) return null;
  return { ...e, date, years, daysUntil: dayNumber(date) - dayNumber(today), jubilee: isJubilee(years) };
}

/** Ближайшие события начиная с сегодняшнего дня (включительно), на `days` дней вперёд */
export function upcoming(tree: TreeData, today: YMD, days: number): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of collectEvents(tree, today.y)) {
    for (const y of [today.y, today.y + 1]) {
      const occ = makeOccurrence(e, occurrenceIn(e, y), today);
      if (occ && occ.daysUntil >= 0 && occ.daysUntil <= days) {
        out.push(occ);
        break;
      }
    }
  }
  return out.sort((a, b) => a.daysUntil - b.daysUntil || Number(b.jubilee) - Number(a.jubilee));
}

/** События месяца (для сетки календаря) */
export function inMonth(tree: TreeData, year: number, month: number, today: YMD): Occurrence[] {
  const out: Occurrence[] = [];
  for (const e of collectEvents(tree, today.y)) {
    const date = occurrenceIn(e, year);
    if (date.m !== month) continue;
    const occ = makeOccurrence(e, date, today);
    if (occ) out.push(occ);
  }
  return out.sort((a, b) => a.date.d - b.date.d);
}
