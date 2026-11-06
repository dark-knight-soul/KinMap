import { describe, expect, it } from 'vitest';
import { parseFuzzyDate } from './dates';
import { createDemoTree } from './demo';
import { addPerson, createTree } from './ops';
import { buildTimeline, directLine, UNKNOWN_SPAN } from './timeline';

describe('лента времени', () => {
  const demo = createDemoTree('Д');
  const id = (n: string) => Object.values(demo.people).find((p) => `${p.names.given} ${p.names.surname}`.startsWith(n))!.id;

  it('строки по году рождения, у умерших — год смерти, у живых — сегодня', () => {
    const tl = buildTimeline(demo, 2026);
    expect(tl.rows.length).toBe(Object.keys(demo.people).length - tl.withoutDates);
    for (let i = 1; i < tl.rows.length; i++) expect(tl.rows[i]!.from).toBeGreaterThanOrEqual(tl.rows[i - 1]!.from);
    const grigory = tl.rows.find((r) => r.id === id('Григорий'))!;
    expect(grigory).toMatchObject({ from: 1898, end: 'death' });
    const artem = tl.rows.find((r) => r.id === id('Артём'))!;
    expect(artem).toMatchObject({ from: 2012, to: 2026, end: 'living' });
    expect(tl.minYear).toBe(1885);
  });

  it('неизвестный год смерти у давно родившегося — полоса ограниченной длины', () => {
    let t = createTree('Т');
    t = addPerson(t, { names: { given: 'Старый' }, birth: { date: parseFuzzyDate('1850') } }).tree;
    t = addPerson(t, { names: { given: 'Без дат' } }).tree;
    const tl = buildTimeline(t, 2026);
    expect(tl.withoutDates).toBe(1);
    expect(tl.rows[0]).toMatchObject({ from: 1850, to: 1850 + UNKNOWN_SPAN, end: 'unknown' });
  });

  it('прямая линия: предки и потомки, без братьев и супругов', () => {
    const line = directLine(demo, id('Сергей'));
    expect(line.has(id('Иван'))).toBe(true); // отец
    expect(line.has(id('Пётр'))).toBe(true); // дед
    expect(line.has(id('Алексей'))).toBe(true); // сын
    expect(line.has(id('Артём'))).toBe(true); // внук
    expect(line.has(id('Гульнара'))).toBe(false); // жена
  });
});
