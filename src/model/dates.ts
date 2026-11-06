import type { DatePart, FuzzyDate } from './types';

// Разбор и вывод неточных дат. Понимает форматы, которые люди реально вводят:
//   1950 · 03.1950 · 12.03.1950 · 1950-03-12 · 12 марта 1950 · 12 Mar 1950
//   ок. 1950 / около / ~ / abt / about / c. / ca.   → около
//   до 1950 / bef / before / <                    → до
//   после 1950 / aft / after / >                  → после
//   между 1900 и 1905 / 1900–1905 / bet 1900 and 1905 → между
// По-узбекски: taxm. 1950 / taxminan 1950 → около; 1950 gacha → до; 1950 dan keyin → после;
//   1900 va 1905 oralig‘ida → между; месяцы: yanvar, fevral, mart…
// Нераспознанный текст сохраняется в FuzzyDate.text, чтобы не потерять данные.

export type DateLocale = 'ru' | 'en' | 'uz';

const MONTH_STEMS: [RegExp, number][] = [
  [/^(янв|jan|yan)/, 1],
  [/^(фев|feb|fev)/, 2],
  [/^(мар|mar)/, 3],
  [/^(апр|apr)/, 4],
  [/^(ма[йя]|may)/, 5],
  [/^(июн|jun|iyun)/, 6],
  [/^(июл|jul|iyul)/, 7],
  [/^(авг|aug|avg)/, 8],
  [/^(сен|sep|sen)/, 9],
  [/^(окт|oct|okt)/, 10],
  [/^(ноя|nov|noy)/, 11],
  [/^(дек|dec|dek)/, 12],
];

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function isValidPart(p: DatePart): boolean {
  if (!Number.isInteger(p.y) || p.y < 1 || p.y > 9999) return false;
  if (p.m === undefined) return p.d === undefined;
  if (p.m < 1 || p.m > 12) return false;
  if (p.d === undefined) return true;
  return p.d >= 1 && p.d <= daysInMonth(p.y, p.m);
}

function monthFromWord(word: string): number | undefined {
  const w = word.toLowerCase().replace(/\.$/, '');
  return MONTH_STEMS.find(([re]) => re.test(w))?.[1];
}

/** Разбор одной даты без приставок */
export function parseDatePart(input: string): DatePart | undefined {
  const s = input.trim().replace(/\s+/g, ' ').replace(/\s*г(ода?|\.)?$/i, '');
  let m: RegExpMatchArray | null;
  let part: DatePart | undefined;

  if ((m = s.match(/^(\d{1,4})$/))) part = { y: +m[1]! };
  else if ((m = s.match(/^(\d{1,2})[./](\d{3,4})$/))) part = { y: +m[2]!, m: +m[1]! };
  else if ((m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{3,4})$/))) part = { y: +m[3]!, m: +m[2]!, d: +m[1]! };
  else if ((m = s.match(/^(\d{3,4})-(\d{1,2})(?:-(\d{1,2}))?$/)))
    part = m[3] ? { y: +m[1]!, m: +m[2]!, d: +m[3] } : { y: +m[1]!, m: +m[2]! };
  else if ((m = s.match(/^(?:(\d{1,2}) )?([\p{L}]+\.?) (\d{3,4})$/u))) {
    const month = monthFromWord(m[2]!);
    if (month) part = m[1] ? { y: +m[3]!, m: month, d: +m[1] } : { y: +m[3]!, m: month };
  }

  return part && isValidPart(part) ? part : undefined;
}

const PREFIXES: [RegExp, NonNullable<FuzzyDate['q']>][] = [
  // Длинные слова раньше коротких: иначе «aft» откусит начало «after»
  [/^(около|примерно|прим\.?|ок\.?|~|about|abt\.?|circa|cal\.?|ca?\.|est\.?|taxminan|taxm\.?)\s*/i, 'about'],
  [/^(ранее|до|before|bef\.?|<)\s*/i, 'before'],
  [/^(позднее|после|after|aft\.?|>)\s*/i, 'after'],
];

/** Узбекский апостроф в «o‘», «g‘» пишут по-разному: ‘ ' ʻ ` ’ */
const UZ_APOS = "[‘'ʻ`’]";
// Узбекские послелоги: «1950 gacha», «1950 dan keyin», «1900 va 1905 oralig‘ida»
const UZ_SUFFIXES: [RegExp, NonNullable<FuzzyDate['q']>][] = [
  [/^(.+?)\s*-?(?:yil)?\s*-?gacha$/i, 'before'],
  [new RegExp(`^(.+?)\\s*-?(?:yil)?\\s*-?dan\\s+(?:keyin|so${UZ_APOS}ng)$`, 'i'), 'after'],
];
const UZ_BETWEEN = new RegExp(`^(.+?)\\s+va\\s+(.+?)\\s+oralig${UZ_APOS}ida$`, 'i');

/** Разбор строки в неточную дату. Пустая строка → undefined */
export function parseFuzzyDate(input: string): FuzzyDate | undefined {
  const raw = input.trim();
  if (!raw) return undefined;

  const uzBetween = raw.match(UZ_BETWEEN);
  if (uzBetween) {
    const a = parseDatePart(uzBetween[1]!);
    const b = parseDatePart(uzBetween[2]!);
    if (a && b && compareParts(a, b) <= 0) return { q: 'between', date: a, date2: b };
    return { text: raw };
  }
  for (const [re, q] of UZ_SUFFIXES) {
    const m = raw.match(re);
    if (m) {
      const part = parseDatePart(m[1]!);
      return part ? { q, date: part } : { text: raw };
    }
  }

  // «между X и Y», «bet X and Y», «X–Y» (только годы через тире, чтобы не спутать с ISO)
  const between =
    raw.match(/^(?:между|bet\.?|between)\s+(.+?)\s+(?:и|and|-|–)\s+(.+)$/i) ??
    raw.match(/^(\d{3,4})\s*[–—-]\s*(\d{3,4})$/);
  if (between) {
    const a = parseDatePart(between[1]!);
    const b = parseDatePart(between[2]!);
    if (a && b && compareParts(a, b) <= 0) return { q: 'between', date: a, date2: b };
    return { text: raw };
  }

  for (const [re, q] of PREFIXES) {
    const m = raw.match(re);
    if (m) {
      const part = parseDatePart(raw.slice(m[0].length));
      return part ? { q, date: part } : { text: raw };
    }
  }

  const part = parseDatePart(raw);
  return part ? { date: part } : { text: raw };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDatePart(p: DatePart, locale: DateLocale): string {
  // По-русски и по-узбекски — числами: 12.03.1950
  if (locale === 'ru' || locale === 'uz') {
    if (p.d !== undefined && p.m !== undefined) return `${pad(p.d)}.${pad(p.m)}.${p.y}`;
    if (p.m !== undefined) return `${pad(p.m)}.${p.y}`;
    return String(p.y);
  }
  const mon = p.m !== undefined ? EN_MONTHS[p.m - 1] : undefined;
  if (p.d !== undefined && mon) return `${p.d} ${mon} ${p.y}`;
  if (mon) return `${mon} ${p.y}`;
  return String(p.y);
}

const WORDS: Record<'ru' | 'en', Record<'about' | 'before' | 'after' | 'between' | 'and', string>> = {
  ru: { about: 'ок.', before: 'до', after: 'после', between: 'между', and: 'и' },
  en: { about: 'abt', before: 'before', after: 'after', between: 'between', and: 'and' },
};

/** Вывод даты для человека. Результат снова разбирается parseFuzzyDate (проверено тестами) */
export function formatFuzzyDate(date: FuzzyDate | undefined, locale: DateLocale): string {
  if (!date) return '';
  if (!date.date) return date.text ?? '';
  const a = formatDatePart(date.date, locale);
  if (locale === 'uz') {
    // Узбекский — с послелогами: «1950 gacha», «1950 dan keyin»
    switch (date.q) {
      case 'about':
        return `taxm. ${a}`;
      case 'before':
        return `${a} gacha`;
      case 'after':
        return `${a} dan keyin`;
      case 'between':
        return date.date2 ? `${a} va ${formatDatePart(date.date2, locale)} oralig‘ida` : a;
      default:
        return a;
    }
  }
  const w = WORDS[locale];
  switch (date.q) {
    case 'about':
      return `${w.about} ${a}`;
    case 'before':
      return `${w.before} ${a}`;
    case 'after':
      return `${w.after} ${a}`;
    case 'between':
      return date.date2 ? `${w.between} ${a} ${w.and} ${formatDatePart(date.date2, locale)}` : a;
    default:
      return a;
  }
}

export function compareParts(a: DatePart, b: DatePart): number {
  return a.y - b.y || (a.m ?? 0) - (b.m ?? 0) || (a.d ?? 0) - (b.d ?? 0);
}

/** Год для сортировок и расчётов (для «между» — середина) */
export function approxYear(date: FuzzyDate | undefined): number | undefined {
  if (!date?.date) return undefined;
  if (date.q === 'between' && date.date2) return Math.round((date.date.y + date.date2.y) / 2);
  return date.date.y;
}
