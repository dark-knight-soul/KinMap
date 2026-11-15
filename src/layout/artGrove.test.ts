import { describe, expect, it } from 'vitest';
import { createDemoTree } from '../model/demo';
import { addPerson, createTree, linkChild, linkParent, linkPartners } from '../model/ops';
import type { PersonId, Sex, TreeData } from '../model/types';
import { GROVE_STEP, layoutArtGrove } from './artGroveLayout';
import type { ArtNode } from './artTreeLayout';

// «Весь род» — роща (1.13): все люди файла по ярусам-поколениям.

const demo = createDemoTree('Демо');
const idOf = (tree: TreeData, name: string) =>
  Object.values(tree.people).find((x) => `${x.names.given} ${x.names.surname}`.startsWith(name))!.id;

function expectEveryoneOnce(tree: TreeData, nodes: ArtNode[]) {
  const count = new Map<string, number>();
  for (const n of nodes) count.set(n.personId, (count.get(n.personId) ?? 0) + 1);
  expect(nodes.length).toBe(Object.keys(tree.people).length);
  for (const id of Object.keys(tree.people)) expect(count.get(id), tree.people[id]!.names.given).toBe(1);
}

function expectApart(nodes: ArtNode[]) {
  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!;
      const b = nodes[j]!;
      expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.personId} и ${b.personId}`).toBeGreaterThanOrEqual(a.r + b.r + 8);
    }
}

/** Синтетический род: несколько родоначальников, браки между их потомками */
function bigClan(founders: number): TreeData {
  let t = createTree('Род');
  const add = (sex: Sex, given: string) => {
    const r = addPerson(t, { sex, names: { given } });
    t = r.tree;
    return r.id;
  };
  const lines: PersonId[][] = [];
  for (let f = 0; f < founders; f++) {
    const a = add('M', `Р${f}`);
    const b = add('F', `Ж${f}`);
    t = linkPartners(t, a, b).tree;
    const kids: PersonId[] = [];
    for (let k = 0; k < 2; k++) {
      const c = add(k ? 'F' : 'M', `Р${f}-${k}`);
      t = linkParent(t, c, a).tree;
      t = linkParent(t, c, b).tree;
      kids.push(c);
    }
    lines.push(kids);
  }
  // Браки между линиями: сын линии i женится на дочери линии i+1, у них по ребёнку
  for (let f = 0; f + 1 < founders; f++) {
    const son = lines[f]![0]!;
    const daughter = lines[f + 1]![1]!;
    const fam = linkPartners(t, son, daughter);
    t = fam.tree;
    const c = add('M', `В${f}`);
    t = linkChild(t, son, c, { familyId: fam.familyId }).tree;
  }
  return t;
}

describe('«Весь род» — роща', () => {
  it('в демо каждый человек ровно один раз, без наложений', () => {
    const l = layoutArtGrove(demo, idOf(demo, 'Алексей'));
    expectEveryoneOnce(demo, l.nodes);
    expectApart(l.nodes);
  });

  it('дети выше обоих родителей, партнёры на одной высоте', () => {
    const l = layoutArtGrove(demo, idOf(demo, 'Алексей'));
    const at = (name: string) => l.nodes.find((n) => n.personId === idOf(demo, name))!;
    expect(at('Сергей').y).toBeLessThan(at('Иван').y);
    expect(at('Сергей').y).toBeLessThan(at('Елена').y);
    expect(at('Иван').y).toBe(at('Елена').y);
    expect(at('Алексей').y).toBeLessThan(at('Гульнара').y);
  });

  it('родоначальник — ровно на ярус ниже своего ребёнка', () => {
    const l = layoutArtGrove(demo, idOf(demo, 'Алексей'));
    const at = (name: string) => l.nodes.find((n) => n.personId === idOf(demo, name))!;
    expect(at('Григорий').y - at('Елена').y).toBe(GROVE_STEP);
  });

  it('у каждого родоначальника с детьми — пенёк, ветви от родителей к детям есть', () => {
    const l = layoutArtGrove(demo, idOf(demo, 'Алексей'));
    expect(l.grove!.stumps.length).toBeGreaterThan(1);
    expect(l.grove!.links.filter((x) => x.kind === 'child').length).toBeGreaterThan(15);
    expect(l.grove!.links.some((x) => x.onPath)).toBe(true);
  });

  it('много родоначальников и браки между линиями — все на месте, разумная ширина', () => {
    const t = bigClan(9);
    const l = layoutArtGrove(t, Object.keys(t.people)[0]!);
    expectEveryoneOnce(t, l.nodes);
    expectApart(l.nodes);
    expect(l.bounds.maxX - l.bounds.minX).toBeLessThan(5000);
  });

  it('несвязанные семьи и одиночка — отдельными рощицами, не пересекаются', () => {
    let t = createTree('Две');
    const a = addPerson(t, { sex: 'M', names: { given: 'А' } });
    const b = addPerson(a.tree, { sex: 'M', names: { given: 'Б' } });
    t = linkParent(b.tree, b.id, a.id).tree;
    const c = addPerson(t, { sex: 'F', names: { given: 'Одна' } });
    t = c.tree;
    const l = layoutArtGrove(t, a.id);
    expectEveryoneOnce(t, l.nodes);
    expectApart(l.nodes);
  });

  it('ошибка в данных (человек — свой предок) не ломает раскладку', () => {
    let t = createTree('Цикл');
    const a = addPerson(t, { sex: 'M', names: { given: 'А' } });
    const b = addPerson(a.tree, { sex: 'M', names: { given: 'Б' } });
    t = linkParent(b.tree, b.id, a.id).tree;
    // Обходим проверку ops: вручную делаем А сыном Б
    const famId = 'cyc';
    t = { ...t, families: { ...t.families, [famId]: { id: famId, partners: [b.id], children: [{ id: a.id, relation: 'birth' }] } as never } };
    const l = layoutArtGrove(t, a.id);
    expect(new Set(l.nodes.map((n) => n.personId)).size).toBe(2);
  });

  it('пустое древо — пустая схема', () => {
    expect(layoutArtGrove(createTree('П'), 'нет').nodes).toHaveLength(0);
  });
});
