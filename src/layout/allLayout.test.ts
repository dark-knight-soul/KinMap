import { describe, expect, it } from 'vitest';
import { createBigTree, createDemoTree } from '../model/demo';
import { addPerson, createTree, linkChild, linkPartners } from '../model/ops';
import type { TreeData } from '../model/types';
import { layoutAll } from './treeLayout';
import { CARD_H, CARD_W, ROW, type ChartLayout } from './types';

// «Всё древо» (1.8): все люди на одной схеме.

const demo = createDemoTree('Демо');
const idOf = (tree: TreeData, name: string) => {
  const p = Object.values(tree.people).find((x) => `${x.names.given} ${x.names.surname}`.startsWith(name));
  if (!p) throw new Error(`нет человека: ${name}`);
  return p.id;
};

/** Никакие две карточки не пересекаются */
function expectNoOverlaps(layout: ChartLayout) {
  const cs = [...layout.cards].sort((a, b) => a.x - b.x);
  for (let i = 0; i < cs.length; i++) {
    for (let j = i + 1; j < cs.length && cs[j]!.x < cs[i]!.x + CARD_W - 0.001; j++) {
      const a = cs[i]!;
      const b = cs[j]!;
      const overlapY = a.y < b.y + CARD_H - 0.001 && b.y < a.y + CARD_H - 0.001;
      expect(overlapY, `наложение: ${a.key} и ${b.key}`).toBe(false);
    }
  }
}

/** Каждый человек нарисован ровно одной «настоящей» (не пунктирной) карточкой */
function expectEveryoneOnce(tree: TreeData, layout: ChartLayout) {
  const solid = new Map<string, number>();
  for (const c of layout.cards) if (!c.duplicate) solid.set(c.personId, (solid.get(c.personId) ?? 0) + 1);
  for (const id of Object.keys(tree.people)) {
    expect(solid.get(id), `${tree.people[id]!.names.given} ${tree.people[id]!.names.surname}`).toBe(1);
  }
}

describe('всё древо', () => {
  it('на демо-семье — все люди по одному разу, без наложений', () => {
    const l = layoutAll(demo, idOf(demo, 'Алексей'));
    expectNoOverlaps(l);
    expectEveryoneOnce(demo, l);
  });

  it('от любого человека в центре — тот же набор людей', () => {
    for (const p of Object.values(demo.people)) {
      const l = layoutAll(demo, p.id);
      expectNoOverlaps(l);
      expectEveryoneOnce(demo, l);
    }
  });

  it('поколения на своих строках: ребёнок ниже родителя на одну строку', () => {
    const l = layoutAll(demo, idOf(demo, 'Алексей'));
    const y = (name: string) => l.cards.find((c) => c.personId === idOf(demo, name) && !c.duplicate)!.y;
    expect(y('Сергей') - y('Иван')).toBe(ROW);
    expect(y('Алексей') - y('Сергей')).toBe(ROW);
  });

  it('несвязанные семьи в одном файле тоже видны', () => {
    let t = createTree('Две семьи');
    const a = addPerson(t, { sex: 'M', names: { given: 'Аз' } });
    const b = addPerson(a.tree, { sex: 'F', names: { given: 'Буки' } });
    const c = addPerson(b.tree, { sex: 'M', names: { given: 'Веди' } });
    t = linkPartners(c.tree, a.id, b.id).tree;
    t = linkChild(t, a.id, c.id).tree;
    const d = addPerson(t, { sex: 'M', names: { given: 'Глаголь' } });
    t = d.tree;
    const l = layoutAll(t, a.id);
    expectNoOverlaps(l);
    expectEveryoneOnce(t, l);
  });

  it('пустое древо — пустая схема', () => {
    expect(layoutAll(createTree('Пусто'), 'нет').cards).toHaveLength(0);
  });

  it('горизонтально — без наложений', () => {
    const l = layoutAll(demo, idOf(demo, 'Алексей'), true);
    expectNoOverlaps(l);
    expect(l.cards.every((c) => c.dir === 'h')).toBe(true);
  });

  it('большое древо считается быстро', () => {
    const big = createBigTree(6, 3);
    const start = performance.now();
    const l = layoutAll(big, Object.keys(big.people)[0]!);
    expect(performance.now() - start).toBeLessThan(2000);
    expectEveryoneOnce(big, l);
  });
});
