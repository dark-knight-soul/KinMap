import { describe, expect, it } from 'vitest';
import { createDemoTree } from './demo';
import { knownGenerations } from './generations';
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
