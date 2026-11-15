import type { NameVariant, Person, PersonNames } from './types';

// Имя на других языках: «Иван Петрович Демидов» → uz «Ivan Petrovich Demidov», en «Ivan Petrovich Demidov».
// Вариант для языка интерфейса показывается на схеме и в списках вместо основного имени.
// Здесь же — транслитерация: кириллица → латиница (узбекская или английская) и обратно.

/** Языки вариантов имени: код и самоназвание (не переводится) */
export const NAME_LANGS: { code: string; label: string }[] = [
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: 'Oʻzbekcha (lotin)' },
  { code: 'uz-Cyrl', label: 'Ўзбекча (кирилл)' },
  { code: 'en', label: 'English' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'ky', label: 'Кыргызча' },
  { code: 'tg', label: 'Тоҷикӣ' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'de', label: 'Deutsch' },
  { code: 'ar', label: 'العربية' },
];

export const langLabel = (code: string) => NAME_LANGS.find((l) => l.code === code)?.label ?? code;

const NAME_FIELDS = ['given', 'patronymic', 'surname'] as const;

/**
 * Имя для показа на языке `lang`: поля варианта поверх основного имени.
 * Поля, которых в варианте нет (например, отчество), переводятся транслитерацией,
 * чтобы не получилось «Ivan Петрович Demidov».
 */
export function namesIn(person: Person, lang: string | undefined): PersonNames {
  const v = lang ? person.names.variants?.find((x) => x.lang === lang) : undefined;
  if (!v) return person.names;
  const out: PersonNames = { ...person.names };
  for (const f of NAME_FIELDS) {
    const main = person.names[f];
    if (v[f]) out[f] = v[f];
    else if (main) out[f] = transliterate(main, v.lang) || main;
  }
  return out;
}

/** Есть ли в варианте хоть одно поле */
export const isEmptyVariant = (v: NameVariant) => !NAME_FIELDS.some((f) => v[f]?.trim());

// ─── Транслитерация ──────────────────────────────────────────────────────────

const CYR = /[а-яёўқғҳ]/i;
const VOWELS_CYR = 'аеёиоуыэюяў';

// Кириллица → узбекская латиница (официальная схема 1995 г.)
const TO_UZ: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: 'ʼ', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'oʻ', қ: 'q', ғ: 'gʻ', ҳ: 'h',
};
// Кириллица → английская запись (как в загранпаспортах, упрощённо)
const TO_EN: Record<string, string> = {
  ...TO_UZ,
  ж: 'zh', х: 'kh', щ: 'shch', ъ: '', ы: 'y', ў: 'u', қ: 'q', ғ: 'gh', ҳ: 'h',
};

function fromCyrillic(text: string, map: Record<string, string>): string {
  let out = '';
  const chars = [...text];
  chars.forEach((ch, i) => {
    const low = ch.toLocaleLowerCase();
    let lat = map[low];
    if (lat === undefined) {
      out += ch;
      return;
    }
    const prev = chars[i - 1]?.toLocaleLowerCase();
    // «е» в начале слова и после гласной, ъ, ь — «ye»: Елена → Yelena, Сергеевич → Sergeyevich
    if (low === 'е' && (!prev || !/[а-яёўқғҳ]/i.test(prev) || VOWELS_CYR.includes(prev) || prev === 'ъ' || prev === 'ь')) lat = 'ye';
    if (ch !== low && lat) {
      // Заглавная: первая буква сочетания заглавная, остальные — как у соседа (ШУРА → SHURA)
      const nextUpper = chars[i + 1] && chars[i + 1] !== chars[i + 1]!.toLocaleLowerCase();
      lat = nextUpper ? lat.toUpperCase() : lat[0]!.toUpperCase() + lat.slice(1);
    }
    out += lat;
  });
  return out;
}

// Латиница (узбекская) → кириллица. Сначала сочетания, потом одиночные буквы.
const APOS = "['‘’`ʻ]";
const LAT_PAIRS: [RegExp, string, string][] = [
  // [образец, узбекская кириллица, русская]
  [new RegExp(`o${APOS}`, 'gi'), 'ў', 'у'],
  [new RegExp(`g${APOS}`, 'gi'), 'ғ', 'г'],
  [/sh/gi, 'ш', 'ш'],
  [/ch/gi, 'ч', 'ч'],
  [/yo/gi, 'ё', 'ё'],
  [/yu/gi, 'ю', 'ю'],
  [/ya/gi, 'я', 'я'],
  [/ye/gi, 'е', 'е'],
  [/zh/gi, 'ж', 'ж'],
  [/kh/gi, 'х', 'х'],
];
const LAT_SINGLE: Record<string, [string, string]> = {
  a: ['а', 'а'], b: ['б', 'б'], d: ['д', 'д'], e: ['е', 'е'], f: ['ф', 'ф'], g: ['г', 'г'], h: ['ҳ', 'х'],
  i: ['и', 'и'], j: ['ж', 'ж'], k: ['к', 'к'], l: ['л', 'л'], m: ['м', 'м'], n: ['н', 'н'], o: ['о', 'о'],
  p: ['п', 'п'], q: ['қ', 'к'], r: ['р', 'р'], s: ['с', 'с'], t: ['т', 'т'], u: ['у', 'у'], v: ['в', 'в'],
  x: ['х', 'х'], y: ['й', 'й'], z: ['з', 'з'], w: ['в', 'в'], c: ['к', 'к'],
};

function toCyrillic(text: string, russian: boolean): string {
  const k = russian ? 2 : 1;
  // Сочетания заменяем на временные метки, чтобы одиночные буквы их не тронули
  let s = text;
  for (const [re, uz, ru] of LAT_PAIRS) {
    s = s.replace(re, (m) => {
      const cyr = k === 1 ? uz : ru;
      return m[0] !== m[0]!.toLowerCase() ? cyr.toUpperCase() : cyr;
    });
  }
  let out = '';
  const chars = [...s];
  chars.forEach((ch, i) => {
    const low = ch.toLowerCase();
    const pair = LAT_SINGLE[low];
    if (!pair) {
      // Узбекский «тутуқ белгиси» (ʼ) → ъ
      out += ch === 'ʼ' ? 'ъ' : ch;
      return;
    }
    let cyr = pair[k - 1]!;
    // «e» в начале слова — «э»: Ergash → Эргаш, Elmira → Элмира
    const prev = chars[i - 1];
    if (low === 'e' && (!prev || !/\p{L}/u.test(prev))) cyr = 'э';
    out += ch !== low ? cyr.toUpperCase() : cyr;
  });
  return out;
}

/**
 * Перевести имя в письменность языка `lang`.
 * null — если для этой пары перевести нельзя (например, латиница → английский — оставляем как есть).
 */
export function transliterate(text: string, lang: string): string | null {
  if (!text.trim()) return '';
  const cyr = CYR.test(text);
  if (cyr) {
    if (lang === 'uz') return fromCyrillic(text, TO_UZ);
    if (lang === 'en' || lang === 'tr' || lang === 'de') return fromCyrillic(text, TO_EN);
    return null;
  }
  if (lang === 'uz-Cyrl') return toCyrillic(text, false);
  if (lang === 'ru' || lang === 'kk' || lang === 'ky' || lang === 'tg') return toCyrillic(text, true);
  return null;
}

/** Вариант имени, заполненный транслитерацией основного (поля, которые не перевести, пустые) */
export function autoVariant(names: PersonNames, lang: string): NameVariant {
  const v: NameVariant = { lang };
  for (const f of NAME_FIELDS) {
    const src = names[f];
    const t = src ? transliterate(src, lang) : null;
    if (t) v[f] = t;
  }
  return v;
}

/** Каким языком удобнее всего начать новый вариант: кириллица → узбекская латиница, латиница → русский */
export function suggestLang(names: PersonNames, used: string[], uiLang: string): string {
  const sample = [names.given, names.surname].filter(Boolean).join(' ');
  const prefer = CYR.test(sample) ? [uiLang === 'ru' ? 'uz' : uiLang, 'uz', 'en'] : ['ru', 'uz-Cyrl', 'en'];
  return [...prefer, ...NAME_LANGS.map((l) => l.code)].find((c) => !used.includes(c)) ?? 'en';
}
