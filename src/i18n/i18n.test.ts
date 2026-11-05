import { describe, expect, it } from 'vitest';
import { ru } from './ru';
import { en } from './en';
import { detectLanguage } from './detect';

// Собирает все ключи словаря в плоский список вида «welcome.title»
function flatten(obj: object, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

describe('словари', () => {
  const ruFlat = flatten(ru);
  const enFlat = flatten(en);

  // Формы множественного числа у языков разные (в русском есть _few/_many) — сравниваем без них
  const PLURAL_ONLY = /_(zero|two|few|many)$/;
  const baseKeys = (flat: Record<string, unknown>) =>
    Object.keys(flat)
      .filter((k) => !PLURAL_ONLY.test(k))
      .sort();

  it('в русском и английском одинаковые ключи', () => {
    expect(baseKeys(enFlat)).toEqual(baseKeys(ruFlat));
  });

  it('нет пустых строк', () => {
    for (const [key, value] of Object.entries({ ...ruFlat, ...enFlat })) {
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
    }
  });

  it('подстановки {{...}} совпадают в обоих языках', () => {
    const vars = (s: unknown) => String(s).match(/{{\s*\w+\s*}}/g)?.sort() ?? [];
    for (const key of baseKeys(ruFlat)) {
      expect(vars(enFlat[key]), key).toEqual(vars(ruFlat[key]));
    }
  });
});

describe('detectLanguage', () => {
  it('сохранённый выбор важнее браузера', () => {
    expect(detectLanguage('en', ['ru-RU'])).toBe('en');
  });

  it('неизвестный сохранённый язык игнорируется', () => {
    expect(detectLanguage('xx', ['ru-RU'])).toBe('ru');
  });

  it('узбекский браузер получает русский интерфейс', () => {
    expect(detectLanguage(null, ['uz-UZ', 'en-US'])).toBe('ru');
  });

  it('английский браузер получает английский', () => {
    expect(detectLanguage(null, ['en-GB'])).toBe('en');
  });

  it('незнакомый язык — английский', () => {
    expect(detectLanguage(null, ['de-DE', 'fr'])).toBe('en');
    expect(detectLanguage(null, [])).toBe('en');
  });
});
