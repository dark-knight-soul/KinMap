import { describe, expect, it } from 'vitest';
import { createDemoTree } from '../model/demo';
import { addPerson, createTree } from '../model/ops';
import { parseFuzzyDate } from '../model/dates';
import { buildIcs, foldLine, icsEscape } from './ics';

const opts = {
  includeMemorial: true,
  summary: (e: { kind: string; year: number }, names: string) => `${e.kind}: ${names} (${e.year})`,
  calendarName: 'Семья',
  now: new Date(Date.UTC(2026, 10, 5, 12, 0, 0)),
};

describe('iCalendar', () => {
  it('демо: события, повтор каждый год, постоянные id', () => {
    const { text, count } = buildIcs(createDemoTree('Д'), opts);
    expect(count).toBe(5);
    expect(text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(text.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(text.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(text.match(/RRULE:FREQ=YEARLY/g)).toHaveLength(5);
    expect(text).toContain('SUMMARY:birthday: Алексей Демидов (1985)');
    expect(text).toContain('DTSTART;VALUE=DATE:20260214');
    // Повторный экспорт даёт те же id
    const again = buildIcs(createDemoTree('Д'), opts).text;
    const uids = (t: string) => t.match(/UID:([^@]+)@/g)!.map((u) => u.split('-')[0]);
    expect(uids(again)).toEqual(uids(text));
  });

  it('без памятных дат — только дни рождения живых', () => {
    const { count, text } = buildIcs(createDemoTree('Д'), { ...opts, includeMemorial: false });
    expect(count).toBe(4);
    expect(text).not.toContain('birthMemorial');
  });

  it('29 февраля — последний день февраля каждый год', () => {
    const r = addPerson(createTree('Т'), { names: { given: 'Касьян' }, birth: { date: parseFuzzyDate('29.02.2000') } });
    const { text } = buildIcs(r.tree, opts);
    expect(text).toContain('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1');
    expect(text).toContain('DTSTART;VALUE=DATE:20260228');
  });

  it('экранирование и перенос длинных строк по байтам UTF-8', () => {
    expect(icsEscape('a;b,c\\d\nе')).toBe('a\\;b\\,c\\\\d\\nе');
    const long = 'SUMMARY:' + 'Ж'.repeat(100);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(long);
  });
});
