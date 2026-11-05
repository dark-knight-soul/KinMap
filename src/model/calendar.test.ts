import { describe, expect, it } from 'vitest';
import { collectEvents, inMonth, isJubilee, occurrenceIn, upcoming } from './calendar';
import { createDemoTree } from './demo';
import { addPerson, createTree, linkPartners } from './ops';
import { parseFuzzyDate } from './dates';
import type { TreeData } from './types';

const demo = createDemoTree('Д');
const name = (tree: TreeData, id: string) => tree.people[id]!.names.given;

describe('события древа', () => {
  it('только точные даты; живым — день рождения, умершим — память', () => {
    const kinds = collectEvents(demo, 2026).map((e) => `${e.kind}:${name(demo, e.personIds[0]!)}`);
    // Точные даты в демо: Алексей 14.02.1985, Иван 03.05.1925, Сергей 21.09.1952, близнецы 10.06.1988
    expect(kinds.sort()).toEqual(['birthMemorial:Иван', 'birthday:Алексей', 'birthday:Ирина', 'birthday:Ольга', 'birthday:Сергей'].sort());
  });

  it('свадьба: обе стороны живы — годовщина, развод — не отмечается', () => {
    let tree = createTree('Т');
    const a = addPerson(tree, { names: { given: 'А' }, birth: { date: parseFuzzyDate('1990') } });
    const b = addPerson(a.tree, { names: { given: 'Б' }, birth: { date: parseFuzzyDate('1991') } });
    const f = linkPartners(b.tree, a.id, b.id);
    tree = { ...f.tree, families: { [f.familyId]: { ...f.tree.families[f.familyId]!, marriage: { date: parseFuzzyDate('15.07.2015') } } } };
    expect(collectEvents(tree, 2026).map((e) => e.kind)).toEqual(['wedding']);
    const divorced = { ...tree, families: { [f.familyId]: { ...tree.families[f.familyId]!, status: 'divorced' as const } } };
    expect(collectEvents(divorced, 2026)).toEqual([]);
  });
});

describe('ближайшие события', () => {
  it('сегодня и в ближайшие 30 дней, по порядку, с возрастом', () => {
    const list = upcoming(demo, { y: 2026, m: 5, d: 3 }, 45);
    expect(list.map((o) => [name(demo, o.personIds[0]!), o.daysUntil, o.years])).toEqual([
      ['Иван', 0, 101],
      ['Ольга', 38, 38],
      ['Ирина', 38, 38],
    ]);
  });

  it('через Новый год: в декабре видно январские события следующего года', () => {
    const r = addPerson(createTree('Т'), { names: { given: 'Январь' }, birth: { date: parseFuzzyDate('05.01.2000') } });
    const [o] = upcoming(r.tree, { y: 2026, m: 12, d: 30 }, 10);
    expect(o).toMatchObject({ daysUntil: 6, years: 27, date: { y: 2027, m: 1, d: 5 } });
  });

  it('29 февраля в невисокосный год — 28 февраля', () => {
    const e = { kind: 'birthday' as const, personIds: ['x'], year: 2000, month: 2, day: 29 };
    expect(occurrenceIn(e, 2027)).toEqual({ y: 2027, m: 2, d: 28 });
    expect(occurrenceIn(e, 2028)).toEqual({ y: 2028, m: 2, d: 29 });
  });

  it('событие в год рождения и раньше — не показывается', () => {
    const r = addPerson(createTree('Т'), { names: { given: 'Малыш' }, birth: { date: parseFuzzyDate('01.06.2026') } });
    expect(upcoming(r.tree, { y: 2026, m: 5, d: 1 }, 60)).toEqual([]);
  });
});

describe('месяц и юбилеи', () => {
  it('события месяца по дням', () => {
    const june = inMonth(demo, 2026, 6, { y: 2026, m: 1, d: 1 });
    expect(june.map((o) => `${o.date.d}:${name(demo, o.personIds[0]!)}`)).toEqual(['10:Ольга', '10:Ирина']);
  });

  it.each([
    [10, true],
    [25, true],
    [41, false],
    [45, false],
    [50, true],
    [55, true],
    [100, true],
    [101, false],
  ])('%i лет — круглая: %s', (y, j) => {
    expect(isJubilee(y)).toBe(j);
  });
});
