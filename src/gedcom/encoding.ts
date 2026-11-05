// Определение кодировки GEDCOM-файла и перевод в текст.
//
// В жизни встречаются: UTF-8 (современные программы), UTF-16 (некоторые старые
// Windows-программы), Windows-1251 (русские программы, часто с пометкой «ANSI»),
// IBM866 (DOS), ANSEL (старый стандарт GEDCOM 5.5). Заголовок CHAR не всегда правдив:
// многие пишут «ANSEL», а внутри UTF-8, или «ANSI», а внутри кириллица.

export type GedEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1251' | 'windows-1252' | 'ibm866' | 'ansel';

const startsWith = (b: Uint8Array, ...sig: number[]) => sig.every((x, i) => b[i] === x);

function isValidUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const hasHighBytes = (bytes: Uint8Array) => bytes.some((b) => b >= 0x80);

/** Что написано в заголовке «1 CHAR …» (ищем в начале файла) */
function declaredCharset(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 8192));
  return head.match(/\n\s*1\s+CHAR\s+([^\r\n]+)/i)?.[1]?.trim().toUpperCase();
}

/** Кириллица или западноевропейский текст в 8-битной кодировке */
function guessSingleByte(bytes: Uint8Array): 'windows-1251' | 'windows-1252' {
  const text = new TextDecoder('windows-1251').decode(bytes);
  const cyr = text.match(/[А-яЁё]/g)?.length ?? 0;
  const high = bytes.reduce((n, b) => n + (b >= 0x80 ? 1 : 0), 0);
  return high > 0 && cyr / high > 0.6 ? 'windows-1251' : 'windows-1252';
}

export function detectEncoding(bytes: Uint8Array): GedEncoding {
  if (startsWith(bytes, 0xef, 0xbb, 0xbf)) return 'utf-8';
  if (startsWith(bytes, 0xff, 0xfe)) return 'utf-16le';
  if (startsWith(bytes, 0xfe, 0xff)) return 'utf-16be';
  // UTF-16 без метки: «0» и нулевой байт
  if (startsWith(bytes, 0x30, 0x00)) return 'utf-16le';
  if (startsWith(bytes, 0x00, 0x30)) return 'utf-16be';

  const declared = declaredCharset(bytes) ?? '';
  // Если байты — корректный UTF-8 с не-ASCII символами, это почти наверняка UTF-8
  if (hasHighBytes(bytes) && isValidUtf8(bytes)) return 'utf-8';
  if (/1251|CYRILLIC/.test(declared)) return 'windows-1251';
  if (/866|DOS/.test(declared)) return 'ibm866';
  if (declared === 'ANSEL') return 'ansel';
  if (!hasHighBytes(bytes)) return 'utf-8';
  return guessSingleByte(bytes);
}

export function decodeGedcom(bytes: Uint8Array): { text: string; encoding: GedEncoding } {
  const encoding = detectEncoding(bytes);
  const text = encoding === 'ansel' ? decodeAnsel(bytes) : new TextDecoder(encoding).decode(bytes);
  return { text: text.replace(/^﻿/, ''), encoding };
}

// ─── ANSEL (ANSI Z39.47) ────────────────────────────────────────────────────
// Особенность: диакритический знак (ударение, умлаут…) пишется ПЕРЕД буквой,
// а в Юникоде — после. Поэтому знаки копим и ставим после следующей буквы.

const ANSEL_SPACING: Record<number, string> = {
  0xa1: 'Ł', 0xa2: 'Ø', 0xa3: 'Đ', 0xa4: 'Þ', 0xa5: 'Æ', 0xa6: 'Œ', 0xa7: 'ʹ', 0xa8: '·', 0xa9: '♭',
  0xaa: '®', 0xab: '±', 0xac: 'Ơ', 0xad: 'Ư', 0xae: 'ʼ', 0xb0: 'ʻ', 0xb1: 'ł', 0xb2: 'ø', 0xb3: 'đ',
  0xb4: 'þ', 0xb5: 'æ', 0xb6: 'œ', 0xb7: 'ʺ', 0xb8: 'ı', 0xb9: '£', 0xba: 'ð', 0xbc: 'ơ', 0xbd: 'ư',
  0xc0: '°', 0xc1: 'ℓ', 0xc2: '℗', 0xc3: '©', 0xc4: '♯', 0xc5: '¿', 0xc6: '¡', 0xc7: 'ß', 0xc8: '€',
};

const ANSEL_COMBINING: Record<number, string> = {
  0xe0: '̉', 0xe1: '̀', 0xe2: '́', 0xe3: '̂', 0xe4: '̃', 0xe5: '̄',
  0xe6: '̆', 0xe7: '̇', 0xe8: '̈', 0xe9: '̌', 0xea: '̊', 0xeb: '︠',
  0xec: '︡', 0xed: '̕', 0xee: '̋', 0xef: '̐', 0xf0: '̧', 0xf1: '̨',
  0xf2: '̣', 0xf3: '̤', 0xf4: '̥', 0xf5: '̳', 0xf6: '̲', 0xf7: '̦',
  0xf8: '̜', 0xf9: '̮', 0xfa: '︢', 0xfb: '︣', 0xfe: '̓',
};

export function decodeAnsel(bytes: Uint8Array): string {
  let out = '';
  let marks = '';
  for (const b of bytes) {
    const mark = ANSEL_COMBINING[b];
    if (mark) {
      marks += mark;
      continue;
    }
    const ch = b < 0x80 ? String.fromCharCode(b) : (ANSEL_SPACING[b] ?? '�');
    out += ch + marks;
    marks = '';
  }
  return (out + marks).normalize('NFC');
}
