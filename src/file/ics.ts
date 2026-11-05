import { collectEvents, occurrenceIn, type CalEvent, type CalEventKind } from '../model/calendar';
import type { TreeData } from '../model/types';

// Экспорт семейных дат в iCalendar (.ics) — файл открывается в Google Календаре,
// календаре iPhone/Android, Outlook. События повторяются каждый год (RRULE), поэтому
// напоминания будут приходить всегда, а не только в этом году.
//
// Формат: RFC 5545. Строки длиннее 75 байт переносятся (CRLF + пробел), спецсимволы
// в тексте экранируются.

export interface IcsOptions {
  /** Включать памятные даты умерших (по умолчанию — да) */
  includeMemorial: boolean;
  /** Подпись события: «🎂 Алексей Демидов (р. 1985)» */
  summary: (e: CalEvent, names: string) => string;
  calendarName: string;
  now?: Date;
}

const MEMORIAL: CalEventKind[] = ['birthMemorial', 'deathMemorial', 'weddingMemorial'];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Экранирование текста по RFC 5545 */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Перенос длинных строк: не больше 75 байт UTF-8, не разрывая символы */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    // У строк продолжения первый байт — пробел, поэтому им остаётся 74
    const limit = parts.length === 0 ? 75 : 74;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

export function buildIcs(tree: TreeData, opts: IcsOptions): { text: string; count: number } {
  const now = opts.now ?? new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const nameOf = (id: string) => {
    const p = tree.people[id];
    return p ? [p.names.given, p.names.surname].filter(Boolean).join(' ') : '';
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KinMap//Family Tree//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(opts.calendarName)}`,
  ];
  let count = 0;
  for (const e of collectEvents(tree, now.getFullYear())) {
    if (!opts.includeMemorial && MEMORIAL.includes(e.kind)) continue;
    // Начало — в этом году (или в год события, если оно позже): без длинной истории повторов
    const startYear = Math.max(e.year, now.getFullYear());
    const start = occurrenceIn(e, startYear);
    const leapDay = e.month === 2 && e.day === 29;
    lines.push(
      'BEGIN:VEVENT',
      // Постоянный id: при повторном импорте календарь обновит событие, а не создаст копию
      `UID:${e.kind}-${e.familyId ?? e.personIds[0]}@${tree.id}.kinmap`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start.y}${pad(start.m)}${pad(start.d)}`,
      // 29 февраля: каждый год последний день февраля
      leapDay ? 'RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1' : 'RRULE:FREQ=YEARLY',
      `SUMMARY:${icsEscape(opts.summary(e, e.personIds.map(nameOf).filter(Boolean).join(' и ')))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
    count++;
  }
  lines.push('END:VCALENDAR');
  return { text: lines.map(foldLine).join('\r\n') + '\r\n', count };
}
