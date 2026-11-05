import { describe, expect, it } from 'vitest';
import { createBigTree, createDemoTree } from '../model/demo';
import { addPerson, createTree, linkChild, linkPartners } from '../model/ops';
import { fullName } from '../model/queries';
import type { TreeData } from '../model/types';
import { layoutFan } from './fanLayout';
import { layoutAncestors, layoutDescendants, layoutFamily } from './treeLayout';
import { CARD_W, ROW, type ChartLayout } from './types';

const demo = createDemoTree('Демо');
// Поиск по «Имя» или «Имя Фамилия» (отчество не учитываем)
const idOf = (tree: TreeData, name: string) => {
  const p = Object.values(tree.people).find(
    (x) => `${x.names.given} ${x.names.surname}`.startsWith(name) || fullName(x).startsWith(name),
  );
  if (!p) throw new Error(`нет человека: ${name}`);
  return p.id;
};

/** Карточки одной строки не должны налезать друг на друга */
function expectNoOverlaps(layout: ChartLayout) {
  const rows = new Map<number, number[]>();
  for (const c of layout.cards) {
    const row = rows.get(c.y) ?? [];
    row.push(c.x);
    rows.set(c.y, row);
  }
  for (const [y, xs] of rows) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect(xs[i]! - xs[i - 1]!, `наложение в строке y=${y}`).toBeGreaterThanOrEqual(CARD_W - 0.001);
    }
  }
}

describe('потомки', () => {
  const layout = layoutDescendants(demo, idOf(demo, 'Пётр Демидов'), 10);

  it('все потомки Петра на схеме, без наложений', () => {
    expectNoOverlaps(layout);
    const shown = new Set(layout.cards.map((c) => c.personId));
    for (const name of ['Иван', 'Сергей', 'Алексей', 'Артём', 'София', 'Дарья', 'Максим', 'Виктор']) {
      expect(shown.has(idOf(demo, name)), name).toBe(true);
    }
  });

  it('дети на строку ниже родителей', () => {
    const y = (name: string) => layout.cards.find((c) => c.personId === idOf(demo, name) && c.role === 'main')!.y;
    expect(y('Сергей') - y('Иван')).toBe(ROW);
    expect(y('Алексей') - y('Сергей')).toBe(ROW);
  });

  it('супруги стоят рядом, на той же строке', () => {
    const ivan = layout.cards.find((c) => c.personId === idOf(demo, 'Иван'))!;
    const spouses = layout.cards.filter((c) => c.role === 'spouse' && c.y === ivan.y && Math.abs(c.x - ivan.x) < 2 * (CARD_W + 30));
    expect(spouses).toHaveLength(2); // Валентина и Елена
  });

  it('пунктир у приёмного ребёнка и развода', () => {
    expect(layout.lines.some((l) => l.dashed)).toBe(true);
  });

  it('ограничение поколений: дальше — отметка «есть ещё»', () => {
    const short = layoutDescendants(demo, idOf(demo, 'Пётр Демидов'), 1);
    expect(short.cards.some((c) => c.moreBelow)).toBe(true);
    expect(short.cards.some((c) => c.personId === idOf(demo, 'Сергей'))).toBe(false);
  });
});

describe('предки', () => {
  const layout = layoutAncestors(demo, idOf(demo, 'Алексей'), 10);

  it('8 прадедов, без наложений, старшие выше', () => {
    expectNoOverlaps(layout);
    expect(layout.cards).toHaveLength(1 + 2 + 4 + 8);
    const y = (name: string) => layout.cards.find((c) => c.personId === idOf(demo, name))!.y;
    expect(y('Сергей')).toBe(-ROW);
    expect(y('Пётр')).toBe(-3 * ROW);
  });

  it('отец слева от матери', () => {
    const x = (name: string) => layout.cards.find((c) => c.personId === idOf(demo, name))!.x;
    expect(x('Сергей')).toBeLessThan(x('Гульнара'));
  });
});

describe('семья («песочные часы»)', () => {
  const alexey = idOf(demo, 'Алексей');
  const layout = layoutFamily(demo, alexey, 3, 2);

  it('человек один раз, есть предки, супруги, дети, братья и сёстры', () => {
    expectNoOverlaps(layout);
    expect(layout.cards.filter((c) => c.personId === alexey)).toHaveLength(1);
    const role = (name: string) => layout.cards.find((c) => c.personId === idOf(demo, name))?.role;
    expect(role('Пётр')).toBe('main'); // прадед
    expect(role('Марина')).toBe('spouse');
    expect(role('Кира')).toBe('spouse');
    expect(role('Артём')).toBe('main');
    expect(role('Ольга Лебедева')).toBe('sibling');
    expect(role('Максим')).toBe('sibling');
  });

  it('человек без родственников — одна карточка', () => {
    const r = addPerson(createTree('Т'), { names: { given: 'Один' } });
    const single = layoutFamily(r.tree, r.id, 3, 3);
    expect(single.cards).toHaveLength(1);
    expect(single.lines).toHaveLength(0);
  });
});

describe('повторяющиеся люди и битые данные', () => {
  it('брак троюродных: общие предки рисуются один раз, второй раз — ссылкой', () => {
    let tree = createTree('Т');
    const add = (given: string) => {
      const r = addPerson(tree, { names: { given } });
      tree = r.tree;
      return r.id;
    };
    const [a, b, c1, c2, g1, g2] = ['Дед', 'Бабушка', 'Сын', 'Дочь', 'Внук', 'Внучка'].map(add);
    const f = linkPartners(tree, a!, b!);
    tree = linkChild(f.tree, a!, c1!, { familyId: f.familyId }).tree;
    tree = linkChild(tree, a!, c2!, { familyId: f.familyId }).tree;
    tree = linkChild(tree, c1!, g1!).tree;
    tree = linkChild(tree, c2!, g2!).tree;
    const m = linkPartners(tree, g1!, g2!);
    tree = m.tree;
    const child = add('Правнук');
    tree = linkChild(tree, g1!, child, { familyId: m.familyId }).tree;

    const anc = layoutAncestors(tree, child, 10);
    expectNoOverlaps(anc);
    expect(anc.cards.filter((c) => c.personId === a && !c.duplicate)).toHaveLength(1);
    expect(anc.cards.some((c) => c.personId === a && c.duplicate)).toBe(true);

    const desc = layoutDescendants(tree, a!, 10);
    expectNoOverlaps(desc);
    expect(desc.cards.filter((c) => c.personId === child && !c.duplicate)).toHaveLength(1);
  });

  it('зацикленные данные (из повреждённого файла) не вешают раскладку', () => {
    const tree: TreeData = {
      ...createTree('Т'),
      people: { A: { id: 'A', sex: 'M', names: {} }, B: { id: 'B', sex: 'M', names: {} } },
      families: {
        F1: { id: 'F1', partners: ['A'], status: 'unknown', children: [{ id: 'B', relation: 'birth' }] },
        F2: { id: 'F2', partners: ['B'], status: 'unknown', children: [{ id: 'A', relation: 'birth' }] },
      },
    };
    expect(layoutDescendants(tree, 'A', 50).cards.length).toBeLessThan(5);
    expect(layoutAncestors(tree, 'A', 50).cards.length).toBeLessThan(5);
    expect(layoutFamily(tree, 'A', 50, 50).cards.length).toBeLessThan(6);
    expect(layoutFan(tree, 'A', 50).segments.length).toBeLessThan(3);
  });
});

describe('веер', () => {
  const fan = layoutFan(demo, idOf(demo, 'Алексей'), 6);

  it('14 предков в трёх кольцах, доли не пересекаются', () => {
    expect(fan.segments).toHaveLength(2 + 4 + 8);
    for (const gen of [1, 2, 3]) {
      const segs = fan.segments.filter((s) => s.gen === gen).sort((a, b) => a.start - b.start);
      for (const s of segs) {
        expect(s.start).toBeGreaterThanOrEqual(Math.PI - 1e-9);
        expect(s.end).toBeLessThanOrEqual(2 * Math.PI + 1e-9);
      }
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBeGreaterThanOrEqual(segs[i - 1]!.end - 1e-9);
    }
  });

  it('отец в левой половине', () => {
    const sergey = fan.segments.find((s) => s.personId === idOf(demo, 'Сергей'))!;
    expect(sergey.end).toBeLessThanOrEqual(1.5 * Math.PI + 1e-9);
  });
});

describe('скорость', () => {
  it('≈6500 человек раскладываются быстро и без наложений', () => {
    const big = createBigTree(7, 4);
    const count = Object.keys(big.people).length;
    expect(count).toBeGreaterThan(5000);
    const root = big.rootPersonId!;
    const t0 = performance.now();
    const layout = layoutDescendants(big, root, 20);
    const ms = performance.now() - t0;
    expect(layout.cards.length).toBe(count);
    expectNoOverlaps(layout);
    expect(ms, `раскладка заняла ${ms.toFixed(0)} мс`).toBeLessThan(1000);
  });
});
