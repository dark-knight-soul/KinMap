import { approxYear } from './dates';
import { isLiving, parentFamiliesOf, unionsOf } from './queries';
import type { PersonId, TreeData } from './types';

// Лента времени: у каждого человека полоса от рождения до смерти (или до сегодня),
// на полосах — годы браков. Плюс исторические события для фона.

/** Сколько лет рисовать, если год смерти неизвестен (полоса «тает») */
export const UNKNOWN_SPAN = 30;

export type RowEnd = 'death' | 'living' | 'unknown';

export interface TimelineRow {
  id: PersonId;
  from: number;
  to: number;
  end: RowEnd;
  /** Годы браков (для отметок на полосе) */
  marriages: number[];
}

export interface Timeline {
  rows: TimelineRow[];
  /** Сколько людей без года рождения (на ленту не попали) */
  withoutDates: number;
  minYear: number;
  maxYear: number;
}

/** Прямая линия человека: он сам, все его предки и все потомки */
export function directLine(tree: TreeData, id: PersonId): Set<PersonId> {
  const out = new Set<PersonId>([id]);
  const up = [id];
  while (up.length) {
    const cur = up.pop()!;
    for (const f of parentFamiliesOf(tree, cur)) for (const p of f.partners) if (!out.has(p)) (out.add(p), up.push(p));
  }
  const down = [id];
  const seen = new Set<PersonId>([id]);
  while (down.length) {
    const cur = down.pop()!;
    for (const f of unionsOf(tree, cur)) {
      for (const c of f.children) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        out.add(c.id);
        down.push(c.id);
      }
    }
  }
  return out;
}

export function buildTimeline(tree: TreeData, currentYear: number, only?: Set<PersonId>): Timeline {
  const rows: TimelineRow[] = [];
  let withoutDates = 0;
  for (const p of Object.values(tree.people)) {
    if (only && !only.has(p.id)) continue;
    const from = approxYear(p.birth?.date);
    if (from === undefined) {
      withoutDates++;
      continue;
    }
    const death = approxYear(p.death?.date);
    let to: number;
    let end: RowEnd;
    if (death !== undefined && death >= from) {
      to = death;
      end = 'death';
    } else if (isLiving(p, currentYear)) {
      to = currentYear;
      end = 'living';
    } else {
      to = Math.min(currentYear, from + UNKNOWN_SPAN);
      end = 'unknown';
    }
    const marriages = unionsOf(tree, p.id)
      .map((f) => approxYear(f.marriage?.date))
      .filter((y): y is number => y !== undefined && y >= from && y <= to);
    rows.push({ id: p.id, from, to, end, marriages });
  }
  rows.sort((a, b) => a.from - b.from || a.to - b.to);
  const minYear = rows.length ? Math.floor(rows[0]!.from / 10) * 10 - 5 : currentYear - 100;
  const maxYear = currentYear + 5;
  return { rows, withoutDates, minYear, maxYear };
}

// ─── Исторические события ───────────────────────────────────────────────────
// Только общеизвестные даты, без оценок. Названия — в переводах (timeline.ev.<id>).
// Набор ориентирован на семьи из бывшего СССР (основные пользователи), плюс мировые события.

export interface HistoryEvent {
  id: string;
  from: number;
  /** Последний год (включительно); нет — событие одного года */
  to?: number;
}

export const HISTORY_EVENTS: HistoryEvent[] = [
  { id: 'war1812', from: 1812 },
  { id: 'serfdom', from: 1861 },
  { id: 'rjWar', from: 1904, to: 1905 },
  { id: 'ww1', from: 1914, to: 1918 },
  { id: 'revolution', from: 1917 },
  { id: 'civilWar', from: 1918, to: 1922 },
  { id: 'famine', from: 1932, to: 1933 },
  { id: 'ww2', from: 1939, to: 1945 },
  { id: 'space', from: 1961 },
  { id: 'tashkent', from: 1966 },
  { id: 'chernobyl', from: 1986 },
  { id: 'ussrEnd', from: 1991 },
  { id: 'covid', from: 2020, to: 2022 },
];
