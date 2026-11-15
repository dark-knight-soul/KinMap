import { describe, expect, it } from 'vitest';
import { createDemoTree } from './demo';
import { descendantRoots, knownGenerations } from './generations';
import { addPerson, createTree } from './ops';
import type { TreeData } from './types';

const demo = createDemoTree('Демо');
const idOf = (tree: TreeData, name: string) =>
  Object.values(tree.people).find((x) => `${x.names.given} ${x.names.surname}`.startsWith(name))!.id;

describe('известные поколения', () => {
  it('у правнука — предки, у прадеда — потомки', () => {
    const artem = knownGenerations(demo, idOf(demo, 'Артём'));
    expect(artem.up).toBeGreaterThanOrEqual(4);
    expect(artem.down).toBe(0);
    const petr = knownGenerations(demo, idOf(demo, 'Пётр Демидов'));
    expect(petr.up).toBe(0);
    expect(petr.down).toBeGreaterThanOrEqual(4);
    expect(petr.downPeople).toBeGreaterThan(petr.down);
  });

  it('у одиночки — ничего', () => {
    const { tree, id } = addPerson(createTree('Т'), { sex: 'M', names: { given: 'Один' } });
    expect(knownGenerations(tree, id)).toEqual({ up: 0, upPeople: 0, down: 0, downPeople: 0 });
  });

  it('у Алексея: родители (1), деды (2), прадеды (3)', () => {
    const g = knownGenerations(demo, idOf(demo, 'Алексей'));
    expect(g.up).toBe(3);
    expect(g.down).toBe(1);
  });
});

describe('«Потомки» — от кого', () => {
  it('у человека с детьми — он сам', () => {
    const sergey = idOf(demo, 'Сергей');
    expect(descendantRoots(demo, sergey).best).toBe(sergey);
  });

  it('без детей — предок с самым большим родом, список — сам и все предки с потомками', () => {
    const sofia = idOf(demo, 'София');
    const r = descendantRoots(demo, sofia);
    const best = r.list.find((x) => x.id === r.best)!;
    expect(best.count).toBe(Math.max(...r.list.map((x) => x.count)));
    expect(r.list.some((x) => x.id === idOf(demo, 'Алексей') && x.depth === 1)).toBe(true);
    expect(r.list.some((x) => x.id === sofia)).toBe(false);
  });
});
