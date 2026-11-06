import { describe, expect, it } from 'vitest';
import { createDemoTree } from './demo';
import { ancestorReport, descendantReport, progenitorOf } from './reports';

describe('родословные росписи', () => {
  const demo = createDemoTree('Д');
  const id = (n: string) => Object.values(demo.people).find((p) => `${p.names.given} ${p.names.surname}`.startsWith(n))!.id;
  const name = (pid: string) => `${demo.people[pid]!.names.given} ${demo.people[pid]!.names.surname}`;

  it('потомки: нумерация 1, 1.1, 1.1.1…, по коленам, дети по году рождения', () => {
    const r = descendantReport(demo, id('Пётр Демидов'));
    const at = (num: string) => name(r.find((e) => e.num === num)!.personId);
    expect(at('1')).toBe('Пётр Демидов');
    expect(at('1.1')).toBe('Иван Демидов');
    // У Ивана дети от двух браков: Виктор (1948), Сергей (1952), Татьяна (1955)
    expect([at('1.1.1'), at('1.1.2'), at('1.1.3')]).toEqual(['Виктор Демидов', 'Сергей Демидов', 'Татьяна Ковалёва']);
    expect(at('1.1.2.1')).toBe('Алексей Демидов');
    // Колена не убывают
    for (let i = 1; i < r.length; i++) expect(r[i]!.gen).toBeGreaterThanOrEqual(r[i - 1]!.gen);
    // У Ивана два союза, дети распределены по ним
    const ivan = r.find((e) => e.num === '1.1')!;
    expect(ivan.unions).toHaveLength(2);
    expect(ivan.unions.flatMap((u) => u.children).sort()).toEqual(['1.1.1', '1.1.2', '1.1.3']);
  });

  it('потомки: ограничение колен — отметка «есть ещё»', () => {
    const r = descendantReport(demo, id('Пётр Демидов'), 2);
    expect(r.map((e) => e.num)).toEqual(['1', '1.1']);
    expect(r[1]!.more).toBe(true);
    expect(r[1]!.unions.every((u) => u.children.length === 0)).toBe(true);
  });

  it('предки: отец 2n, мать 2n+1', () => {
    const r = ancestorReport(demo, id('Алексей'));
    const at = (num: number) => name(r.find((e) => e.num === num)!.personId);
    expect(at(1)).toBe('Алексей Демидов');
    expect(at(2)).toBe('Сергей Демидов');
    expect(at(3)).toBe('Гульнара Демидова');
    expect(at(4)).toBe('Иван Демидов');
    expect(at(7)).toBe('Нина Каримова');
    expect(at(8)).toBe('Пётр Демидов');
    expect(r.find((e) => e.num === 15)!.gen).toBe(3);
  });

  it('родоначальник — предок по мужской линии', () => {
    expect(name(progenitorOf(demo, id('Алексей')))).toBe('Пётр Демидов');
    expect(name(progenitorOf(demo, id('Пётр Демидов')))).toBe('Пётр Демидов');
  });
});
