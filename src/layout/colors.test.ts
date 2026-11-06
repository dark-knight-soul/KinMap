import { describe, expect, it } from 'vitest';
import { createDemoTree } from '../model/demo';
import { lineKinds, SURNAME_PALETTE, surnameColors, surnameKey } from './colors';

describe('окраска по линиям', () => {
  const demo = createDemoTree('Д');
  const id = (n: string) => Object.values(demo.people).find((p) => `${p.names.given} ${p.names.surname}`.startsWith(n))!.id;
  const kinds = lineKinds(demo, id('Алексей'));

  it('предки по отцу и по матери', () => {
    expect(kinds.get(id('Сергей'))).toBe('paternal');
    expect(kinds.get(id('Пётр'))).toBe('paternal');
    expect(kinds.get(id('Гульнара'))).toBe('maternal');
    expect(kinds.get(id('Фёдор'))).toBe('maternal');
  });

  it('свои: сам, братья, сёстры, потомки; супруги — без линии', () => {
    for (const n of ['Алексей', 'Ольга Лебедева', 'Максим', 'Артём', 'Дарья']) expect(kinds.get(id(n)), n).toBe('own');
    expect(kinds.get(id('Марина'))).toBeUndefined();
  });
});

describe('цвет фамилии', () => {
  it('Иванов и Иванова — одна фамилия, пустая — без ключа', () => {
    expect(surnameKey('Иванова')).toBe(surnameKey('Иванов'));
    expect(surnameKey('Невская')).toBe('невский');
    expect(surnameKey('  ')).toBeUndefined();
  });

  it('самая частая фамилия — первый цвет, разные фамилии — разные цвета', () => {
    const demo = createDemoTree('Д');
    const colors = surnameColors(demo);
    expect(colors.get('демидов')).toBe(SURNAME_PALETTE[0]);
    const firstNine = [...colors.values()].slice(0, SURNAME_PALETTE.length);
    expect(new Set(firstNine).size).toBe(firstNine.length);
  });
});
