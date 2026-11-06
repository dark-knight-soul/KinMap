import { describe, expect, it } from 'vitest';
import { formatFuzzyDate, parseFuzzyDate } from './dates';
import { createDemoTree } from './demo';
import { findKinship } from './kinship';
import { nameKinship } from './kinshipTerms';
import { bloodTermUz, chain, possessive } from './kinshipUz';

// Узбекские термины родства на примере демо-семьи: «кем B приходится A».

const demo = createDemoTree('Д');
const id = (n: string) => Object.values(demo.people).find((p) => `${p.names.given} ${p.names.surname}`.startsWith(n))!.id;
const uz = (a: string, b: string) => {
  const k = findKinship(demo, id(a), id(b));
  return k ? nameKinship(demo, k, 'uz').term : null;
};

describe('узбекские термины родства', () => {
  it('предки и потомки', () => {
    expect(uz('Алексей', 'Сергей')).toBe('ota');
    expect(uz('Алексей', 'Гульнара')).toBe('ona');
    expect(uz('Алексей', 'Иван Демидов')).toBe('bobo');
    expect(uz('Алексей', 'Елена')).toBe('buvi');
    expect(uz('Алексей', 'Пётр')).toBe('katta bobo');
    expect(uz('Алексей', 'Артём')).toBe('o‘g‘il');
    expect(uz('Алексей', 'София')).toBe('qiz');
    expect(uz('Сергей', 'Артём')).toBe('nevara');
    expect(uz('Иван Демидов', 'Артём')).toBe('chevara');
    expect(uz('Пётр', 'Артём')).toBe('evara');
  });

  it('брат и сестра — старше или младше', () => {
    expect(uz('Алексей', 'Ольга Лебедева')).toBe('singil'); // 1988 моложе 1985
    expect(uz('Ольга Лебедева', 'Алексей')).toBe('aka');
    expect(uz('Сергей', 'Татьяна')).toBe('singil');
    expect(uz('Татьяна', 'Сергей')).toBe('aka');
  });

  it('по отцу — amaki/amma, по матери — tog‘a/xola; двоюродные', () => {
    expect(uz('Алексей', 'Татьяна')).toBe('amma');
    expect(uz('Алексей', 'Рустам')).toBe('tog‘a');
    expect(uz('Алексей', 'Азиз')).toBe('tog‘avachcha');
    expect(uz('Алексей', 'Дмитрий')).toBe('ammavachcha');
    expect(uz('Азиз', 'Алексей')).toBe('ammavachcha'); // для Азиза Алексей — сын сестры отца
    expect(uz('Алексей', 'Дарья')).toBe('jiyan');
  });

  it('свойство: qaynota, qaynsingil, kelin, kuyov, quda', () => {
    expect(uz('Марина', 'Сергей')).toBe('qaynota');
    expect(uz('Марина', 'Гульнара')).toBe('qaynona');
    expect(uz('Марина', 'Ольга Лебедева')).toBe('qaynsingil'); // младшая сестра мужа
    expect(uz('Сергей', 'Марина')).toBe('kelin');
    expect(uz('Алексей', 'Павел')).toBe('kuyov'); // муж младшей сестры
    expect(uz('Ольга Лебедева', 'Марина')).toBe('kelinoyi'); // жена старшего брата
    expect(uz('Иван Демидов', 'Тимур')).toBe('quda');
    expect(uz('Елена', 'Нина')).toBe('qudag‘ay');
    expect(uz('Алексей', 'Марина')).toBe('xotin');
    expect(uz('Марина', 'Алексей')).toBe('er');
  });

  it('нет точного слова — описание цепочкой', () => {
    // Жена брата матери
    expect(uz('Алексей', 'Лола')).toBe('tog‘asining xotini');
    expect(uz('Алексей', 'Кира')).toBe('sobiq xotin');
  });

  it('притяжательные формы', () => {
    expect(possessive('ota')).toBe('otasi');
    expect(possessive('o‘g‘il')).toBe('o‘g‘li');
    expect(possessive('singil')).toBe('singlisi');
    expect(possessive('xotin')).toBe('xotini');
    expect(possessive('sherik')).toBe('sherigi');
    expect(possessive('katta bobo')).toBe('katta bobosi');
    expect(chain(['xotin', 'uka', 'o‘g‘il'])).toBe('xotinining ukasining o‘g‘li');
  });

  it('без сведений о возрасте и линии — обе формы', () => {
    expect(bloodTermUz(1, 1, 'M')).toBe('aka/uka');
    expect(bloodTermUz(2, 1, 'F')).toBe('amma/xola');
    expect(bloodTermUz(0, 2, 'U')).toBe('nevara');
  });
});

describe('узбекские даты', () => {
  const samples = ['1950', '03.1950', '12.03.1950', 'ок. 1950', 'до 1920', 'после 05.1945', 'между 1900 и 1905'];

  it.each(samples)('%s — вывод по-узбекски снова разбирается в ту же дату', (s) => {
    const parsed = parseFuzzyDate(s);
    expect(parseFuzzyDate(formatFuzzyDate(parsed, 'uz'))).toEqual(parsed);
  });

  it('послелоги и месяцы', () => {
    expect(formatFuzzyDate(parseFuzzyDate('до 1920'), 'uz')).toBe('1920 gacha');
    expect(formatFuzzyDate(parseFuzzyDate('после 1945'), 'uz')).toBe('1945 dan keyin');
    expect(formatFuzzyDate(parseFuzzyDate('между 1900 и 1905'), 'uz')).toBe('1900 va 1905 oralig‘ida');
    expect(parseFuzzyDate('taxminan 1950')).toEqual({ q: 'about', date: { y: 1950 } });
    expect(parseFuzzyDate('1920-yilgacha')).toEqual({ q: 'before', date: { y: 1920 } });
    expect(parseFuzzyDate("1900 va 1905 oralig'ida")).toMatchObject({ q: 'between' });
    expect(parseFuzzyDate('12 mart 1950')).toEqual({ date: { y: 1950, m: 3, d: 12 } });
    expect(parseFuzzyDate('5 iyul 1941')).toEqual({ date: { y: 1941, m: 7, d: 5 } });
    expect(parseFuzzyDate('3 iyun 1941')).toEqual({ date: { y: 1941, m: 6, d: 3 } });
  });
});
