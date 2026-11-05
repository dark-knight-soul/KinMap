import { describe, expect, it } from 'vitest';
import { approxYear, formatFuzzyDate, parseFuzzyDate } from './dates';

describe('parseFuzzyDate', () => {
  it.each([
    ['1950', { date: { y: 1950 } }],
    ['03.1950', { date: { y: 1950, m: 3 } }],
    ['3/1950', { date: { y: 1950, m: 3 } }],
    ['12.03.1950', { date: { y: 1950, m: 3, d: 12 } }],
    ['1950-03-12', { date: { y: 1950, m: 3, d: 12 } }],
    ['1950-03', { date: { y: 1950, m: 3 } }],
    ['12 марта 1950', { date: { y: 1950, m: 3, d: 12 } }],
    ['1 мая 1945 г.', { date: { y: 1945, m: 5, d: 1 } }],
    ['май 1945', { date: { y: 1945, m: 5 } }],
    ['12 Mar 1950', { date: { y: 1950, m: 3, d: 12 } }],
    ['12 MAR 1950', { date: { y: 1950, m: 3, d: 12 } }],
    ['ок. 1950', { q: 'about', date: { y: 1950 } }],
    ['около 1950', { q: 'about', date: { y: 1950 } }],
    ['~1950', { q: 'about', date: { y: 1950 } }],
    ['ABT 1950', { q: 'about', date: { y: 1950 } }],
    ['до 1920', { q: 'before', date: { y: 1920 } }],
    ['BEF 1920', { q: 'before', date: { y: 1920 } }],
    ['после 05.1945', { q: 'after', date: { y: 1945, m: 5 } }],
    ['между 1900 и 1905', { q: 'between', date: { y: 1900 }, date2: { y: 1905 } }],
    ['BET 1900 AND 1905', { q: 'between', date: { y: 1900 }, date2: { y: 1905 } }],
    ['1900–1905', { q: 'between', date: { y: 1900 }, date2: { y: 1905 } }],
  ])('%s', (input, expected) => {
    expect(parseFuzzyDate(input)).toEqual(expected);
  });

  it('пустая строка — нет даты', () => {
    expect(parseFuzzyDate('   ')).toBeUndefined();
  });

  it('несуществующие даты не принимаются, но текст сохраняется', () => {
    expect(parseFuzzyDate('31.02.1950')).toEqual({ text: '31.02.1950' });
    expect(parseFuzzyDate('13.1950')).toEqual({ text: '13.1950' });
    expect(parseFuzzyDate('весной после войны')).toEqual({ text: 'весной после войны' });
    expect(parseFuzzyDate('между 1905 и 1900')).toEqual({ text: 'между 1905 и 1900' });
  });

  it('29 февраля — только в високосный год', () => {
    expect(parseFuzzyDate('29.02.2000')?.date).toEqual({ y: 2000, m: 2, d: 29 });
    expect(parseFuzzyDate('29.02.1900')).toEqual({ text: '29.02.1900' });
  });
});

describe('formatFuzzyDate', () => {
  const samples = ['1950', '03.1950', '12.03.1950', 'ок. 1950', 'до 1920', 'после 05.1945', 'между 1900 и 1905'];

  it.each(samples)('ru: %s выводится так же', (s) => {
    expect(formatFuzzyDate(parseFuzzyDate(s), 'ru')).toBe(s);
  });

  it.each(samples)('en: %s — вывод снова разбирается в ту же дату', (s) => {
    const parsed = parseFuzzyDate(s);
    expect(parseFuzzyDate(formatFuzzyDate(parsed, 'en'))).toEqual(parsed);
  });

  it('английский формат', () => {
    expect(formatFuzzyDate(parseFuzzyDate('12.03.1950'), 'en')).toBe('12 Mar 1950');
    expect(formatFuzzyDate(parseFuzzyDate('ок. 1950'), 'en')).toBe('abt 1950');
  });

  it('нераспознанный текст выводится как есть', () => {
    expect(formatFuzzyDate({ text: 'зимой' }, 'ru')).toBe('зимой');
  });
});

describe('approxYear', () => {
  it('для «между» — середина', () => {
    expect(approxYear(parseFuzzyDate('между 1900 и 1910'))).toBe(1905);
    expect(approxYear(parseFuzzyDate('ок. 1950'))).toBe(1950);
    expect(approxYear({ text: 'зимой' })).toBeUndefined();
  });
});
