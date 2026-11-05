import { parseFuzzyDate } from '../model/dates';
import type { DatePart, FuzzyDate } from '../model/types';

// Даты GEDCOM ↔ неточные даты KinMap.
// GEDCOM: «12 MAR 1950», «ABT 1950», «EST/CAL 1950», «BEF 1920», «AFT 1945»,
// «BET 1900 AND 1905», «FROM 1900 TO 1905», «INT 1950 (текст)», «(свободный текст)»,
// календари: 5.5.1 — «@#DJULIAN@ 12 MAR 1700», 7.0 — «JULIAN 12 MAR 1700».
// Даты не по григорианскому календарю сохраняем текстом — пересчёт календарей не делаем.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function fromGedcomDate(raw: string | undefined): FuzzyDate | undefined {
  if (!raw) return undefined;
  let s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return undefined;

  // Свободный текст в скобках
  if (/^\(.*\)$/.test(s)) return { text: s.slice(1, -1).trim() };
  // Календарь не григорианский — сохраняем как есть
  if (/@#D(JULIAN|HEBREW|FRENCH R|ROMAN|UNKNOWN)@|^(JULIAN|HEBREW|FRENCH_R)\b/i.test(s)) return { text: s };
  s = s.replace(/@#DGREGORIAN@\s*|^GREGORIAN\s+/i, '');
  // «INT 1950 (около войны)» — интерпретация: берём дату, текст отбрасываем
  s = s.replace(/^INT\s+(.*?)\s*\(.*\)$/i, '$1');
  // Двойной год «1700/01» — берём новый стиль
  s = s.replace(/(\d{3,4})\/(\d{2})\b/, (_, y: string, yy: string) => String(Number(y.slice(0, -2) + yy)));

  const period = s.match(/^FROM\s+(.+?)\s+TO\s+(.+)$/i);
  if (period) return parseFuzzyDate(`BET ${period[1]} AND ${period[2]}`) ?? { text: raw.trim() };
  const from = s.match(/^FROM\s+(.+)$/i);
  if (from) return wrap(parseFuzzyDate(`AFT ${from[1]}`), raw);
  const to = s.match(/^TO\s+(.+)$/i);
  if (to) return wrap(parseFuzzyDate(`BEF ${to[1]}`), raw);

  return wrap(parseFuzzyDate(s), raw);
}

const wrap = (d: FuzzyDate | undefined, raw: string): FuzzyDate =>
  d && d.date ? d : { text: raw.trim().replace(/^\((.*)\)$/, '$1') };

function part(p: DatePart): string {
  const m = p.m !== undefined ? MONTHS[p.m - 1] : undefined;
  if (p.d !== undefined && m) return `${p.d} ${m} ${p.y}`;
  if (m) return `${m} ${p.y}`;
  return String(p.y);
}

/** Неточная дата KinMap → строка GEDCOM. Текст: 5.5.1 — в скобках, 7.0 — отдельно (PHRASE) */
export function toGedcomDate(d: FuzzyDate | undefined): { value?: string; phrase?: string } {
  if (!d) return {};
  if (!d.date) return d.text ? { phrase: d.text } : {};
  const a = part(d.date);
  switch (d.q) {
    case 'about':
      return { value: `ABT ${a}` };
    case 'before':
      return { value: `BEF ${a}` };
    case 'after':
      return { value: `AFT ${a}` };
    case 'between':
      return { value: d.date2 ? `BET ${a} AND ${part(d.date2)}` : a };
    default:
      return { value: a };
  }
}
