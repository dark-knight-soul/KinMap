import { describe, expect, it } from 'vitest';
import { createBigTree, createDemoTree } from '../model/demo';
import type { TreeData } from '../model/types';
import { layoutArtTree } from './artTreeLayout';
import { layoutButterfly } from './butterflyLayout';
import { layoutCircle } from './fanLayout';
import { layoutAncestors, layoutDescendants, layoutFamily } from './treeLayout';
import { CARD_H, CARD_W, type ChartLayout } from './types';

// Новые виды схемы (1.3): горизонтальная, «бабочка», круговая, «Дерево».

const demo = createDemoTree('Демо');
const idOf = (tree: TreeData, name: string) => {
  const p = Object.values(tree.people).find((x) => `${x.names.given} ${x.names.surname}`.startsWith(name));
  if (!p) throw new Error(`нет человека: ${name}`);
  return p.id;
};

/** Никакие две карточки не пересекаются (проверка прямоугольников целиком) */
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

describe('горизонтальная схема', () => {
  it('потомки идут слева направо, без наложений', () => {
    const l = layoutDescendants(demo, idOf(demo, 'Пётр Демидов'), 10, true);
    expectNoOverlaps(l);
    const root = l.cards.find((c) => c.role === 'main' && demo.people[c.personId]!.names.given === 'Пётр')!;
    const child = l.cards.find((c) => demo.people[c.personId]!.names.given === 'Иван')!;
    expect(child.x).toBeGreaterThan(root.x);
    expect(l.cards.every((c) => c.dir === 'h')).toBe(true);
  });

  it('«семья»: предки слева, без наложений', () => {
    const l = layoutFamily(demo, idOf(demo, 'Алексей'), 3, 3, true);
    expectNoOverlaps(l);
    const me = l.cards.find((c) => demo.people[c.personId]!.names.given === 'Алексей')!;
    const father = l.cards.find((c) => demo.people[c.personId]!.names.given === 'Сергей')!;
    expect(father.x).toBeLessThan(me.x);
  });

  it('предки на большом древе без наложений', () => {
    const big = createBigTree(7, 4);
    const someone = Object.keys(big.people).at(-1)!;
    expectNoOverlaps(layoutAncestors(big, someone, 8, true));
  });
});

describe('«бабочка»', () => {
  const l = layoutButterfly(demo, idOf(demo, 'Сергей'), 3, 2);
  const at = (given: string) => l.cards.find((c) => demo.people[c.personId]!.names.given === given && !c.duplicate)!;

  it('муж слева, жена справа, предки мужа левее, предки жены правее', () => {
    expectNoOverlaps(l);
    expect(at('Сергей').x).toBeLessThan(at('Гульнара').x);
    expect(at('Иван').x).toBeLessThan(at('Сергей').x); // отец Сергея
    expect(at('Тимур').x).toBeGreaterThan(at('Гульнара').x); // отец Гульнары
    expect(at('Тимур').dir).toBe('hr');
  });

  it('дети пары — ниже пары', () => {
    expect(at('Алексей').y).toBeGreaterThan(at('Сергей').y);
    expect(at('Ольга').y).toBeGreaterThan(at('Сергей').y);
  });

  it('человек без супруга — одно крыло', () => {
    const solo = layoutButterfly(demo, idOf(demo, 'Артём'), 3, 2);
    expectNoOverlaps(solo);
    expect(solo.cards.length).toBeGreaterThan(3);
  });
});

describe('круговая схема потомков', () => {
  const c = layoutCircle(demo, idOf(demo, 'Пётр Демидов'), 5);

  it('полный круг, сектора детей не пересекаются и закрывают 360°', () => {
    expect(c.full).toBe(true);
    const ring1 = c.segments.filter((s) => s.gen === 1).sort((a, b) => a.start - b.start);
    expect(ring1.length).toBeGreaterThan(0);
    expect(ring1[0]!.start).toBeCloseTo(-Math.PI / 2);
    expect(ring1.at(-1)!.end).toBeCloseTo((3 * Math.PI) / 2);
    for (let i = 1; i < ring1.length; i++) expect(ring1[i]!.start).toBeCloseTo(ring1[i - 1]!.end);
  });

  it('внук лежит в секторе своего родителя', () => {
    const ivan = c.segments.find((s) => demo.people[s.personId]!.names.given === 'Иван')!;
    const sergey = c.segments.find((s) => demo.people[s.personId]!.names.given === 'Сергей')!;
    expect(sergey.gen).toBe(ivan.gen + 1);
    expect(sergey.start).toBeGreaterThanOrEqual(ivan.start - 1e-9);
    expect(sergey.end).toBeLessThanOrEqual(ivan.end + 1e-9);
  });
});

describe('«Дерево»', () => {
  it('корень внизу, все потомки выше и не налезают друг на друга', () => {
    const t = layoutArtTree(demo, idOf(demo, 'Пётр Демидов'), 6);
    const root = t.nodes[0]!;
    expect(root.gen).toBe(0);
    expect(t.nodes.slice(1).every((n) => n.y < root.y)).toBe(true);
    for (let i = 0; i < t.nodes.length; i++) {
      for (let j = i + 1; j < t.nodes.length; j++) {
        const a = t.nodes[i]!;
        const b = t.nodes[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.key} / ${b.key}`).toBeGreaterThan(a.r + b.r);
      }
    }
  });

  it('большое древо раскладывается быстро', () => {
    const big = createBigTree(7, 4);
    const t0 = performance.now();
    const t = layoutArtTree(big, big.rootPersonId!, 12);
    expect(t.nodes.length).toBeGreaterThan(100);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
