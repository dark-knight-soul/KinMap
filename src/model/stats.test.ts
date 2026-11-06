import { describe, expect, it } from 'vitest';
import { createDemoTree } from './demo';
import { computeStats } from './stats';
import { createTree } from './ops';

describe('статистика рода', () => {
  const demo = createDemoTree('Д');
  const s = computeStats(demo, 2026);
  const name = (id?: string) => (id ? demo.people[id]?.names.given : undefined);

  it('люди, семьи, поколения', () => {
    expect(s.people).toBe(Object.keys(demo.people).length);
    expect(s.males + s.females).toBe(s.people);
    expect(s.generations).toBe(5); // прадед → дед → отец → Алексей → Артём
  });

  it('самый ранний и самый поздний год рождения', () => {
    expect(s.earliest?.year).toBe(1898);
    expect(name(s.earliest?.id)).toBe('Григорий');
    expect(s.latest?.year).toBe(2015);
  });

  it('продолжительность жизни: средняя, по векам, долгожители', () => {
    expect(s.avgLifespan).toBeGreaterThan(50);
    expect(s.byCentury.map((c) => c.century)).toEqual([19, 20]);
    expect(name(s.longestLived[0]?.id)).toBe('Нина'); // Нина Каримова, 1930–2015 = 85
    expect(s.longestLived[0]?.years).toBe(85);
    expect(name(s.longestLived[1]?.id)).toBe('Ольга'); // Ольга Белова, 1906–1990 = 84
  });

  it('Демидов и Демидова — одна фамилия', () => {
    // Алексей, Пётр, Анна, Иван, Елена, Виктор, Сергей, Гульнара, Ирина, Максим, Марина, Артём, София
    expect(s.topSurnames[0]).toEqual(['Демидов', 13]);
  });

  it('пустое древо', () => {
    const e = computeStats(createTree('Т'), 2026);
    expect(e).toMatchObject({ people: 0, generations: 0, withBirthDate: 0 });
    expect(e.avgLifespan).toBeUndefined();
  });
});
