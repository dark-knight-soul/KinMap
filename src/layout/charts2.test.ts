import { describe, expect, it } from 'vitest';
import { createBigTree, createDemoTree } from '../model/demo';
import { addPerson, createTree, linkParent } from '../model/ops';
import type { TreeData } from '../model/types';
import { ROOTS_ANCHOR, ROOTS_TOP, artTreeRoot, layoutArtAncestors, layoutArtClan, layoutArtFull, layoutArtTree } from './artTreeLayout';
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

describe('«Дерево» от родоначальника', () => {
  it('у человека без детей дерево растёт от старшего предка по отцу, и он сам на ветке', () => {
    const sofia = idOf(demo, 'София');
    const { root, depth } = artTreeRoot(demo, sofia);
    expect(demo.people[root]!.names.given).toBe('Пётр');
    expect(depth).toBe(4);
    const t = layoutArtTree(demo, root, depth);
    expect(t.nodes.some((n) => n.personId === sofia)).toBe(true);
  });

  it('у человека с детьми — от него самого', () => {
    const sergey = idOf(demo, 'Сергей');
    expect(artTreeRoot(demo, sergey)).toEqual({ root: sergey, depth: 0 });
  });
});

describe('родословное «Дерево» (предки)', () => {
  it('род отца слева, род матери справа', () => {
    const alexey = idOf(demo, 'Алексей');
    const t = layoutArtAncestors(demo, alexey, 7);
    const node = (name: string) => t.nodes.find((n) => n.personId === idOf(demo, name))!;
    expect(node('Алексей').gen).toBe(0);
    expect(node('Сергей').x).toBeLessThan(0); // отец
    expect(node('Гульнара').x).toBeGreaterThan(0); // мать
    expect(node('Иван').x).toBeLessThan(0); // дед по отцу
  });

  it('неизвестные родители — пустые места «+», в печати их нет', () => {
    const { tree, id } = addPerson(createTree('Т'), { sex: 'M', names: { given: 'Один' } });
    const t = layoutArtAncestors(tree, id, 7);
    expect(t.ghosts.map((g) => g.kind)).toEqual(['father', 'mother']);
    expect(t.ghosts.every((g) => g.childId === id)).toBe(true);
    expect(layoutArtAncestors(tree, id, 7, false).ghosts).toHaveLength(0);
  });

  it('не дальше заданного числа поколений', () => {
    const artem = idOf(demo, 'Артём');
    const t = layoutArtAncestors(demo, artem, 2);
    expect(Math.max(...t.nodes.map((n) => n.gen))).toBe(2);
    expect(t.nodes.some((n) => n.more)).toBe(true);
  });
});

describe('«Дерево»: полный и весь род', () => {
  it('полный: предки в кроне (выше ствола), потомки в корнях (ниже земли)', () => {
    const sergey = idOf(demo, 'Сергей');
    const t = layoutArtFull(demo, sergey, 7);
    expect(t.mode).toBe('full');
    const up = t.nodes.find((n) => n.personId === idOf(demo, 'Иван'))!;
    expect(up.y).toBeLessThan(0);
    const child = t.under.find((n) => n.personId === idOf(demo, 'Алексей'))!;
    expect(child.y).toBeGreaterThan(ROOTS_TOP);
    expect(child.parentKey).toBe(ROOTS_ANCHOR);
    // Внуки висят на своих родителях, а не на основании
    const grand = t.under.find((n) => n.personId === idOf(demo, 'Артём'))!;
    expect(grand.parentKey).toBe(child.key);
    expect(grand.y).toBeGreaterThan(child.y);
  });

  it('весь род: от старшего предка по отцу, выбранный человек на ветке', () => {
    const t = layoutArtClan(demo, idOf(demo, 'София'));
    expect(demo.people[t.rootId]!.names.given).toBe('Пётр');
    expect(t.nodes.some((n) => n.personId === idOf(demo, 'София'))).toBe(true);
  });

  it('весь род: у жены из другой семьи — её родители', () => {
    const t = layoutArtClan(demo, idOf(demo, 'Алексей'));
    const ivan = t.nodes.find((n) => n.personId === idOf(demo, 'Иван'))!;
    const elena = idOf(demo, 'Елена');
    expect(ivan.spouseParents?.[elena]?.map((id) => demo.people[id]!.names.given).sort()).toEqual(['Григорий', 'Мария']);
  });
});

describe('родословное «Дерево»: стороны не смешиваются', () => {
  it('даже если по матери известно гораздо больше предков, они остаются справа', () => {
    let t = createTree('Т');
    const add = (sex: 'M' | 'F', given: string) => {
      const r = addPerson(t, { sex, names: { given } });
      t = r.tree;
      return r.id;
    };
    const me = add('M', 'Я');
    const father = add('M', 'Отец');
    const mother = add('F', 'Мать');
    t = linkParent(t, me, father).tree;
    t = linkParent(t, me, mother).tree;
    // По матери — три поколения, по отцу — никого
    let cur = mother;
    for (let i = 0; i < 3; i++) {
      const f = add('M', `Дед${i}`);
      const m = add('F', `Бабушка${i}`);
      t = linkParent(t, cur, f).tree;
      t = linkParent(t, cur, m).tree;
      cur = f;
    }
    const l = layoutArtAncestors(t, me, 7, false);
    const motherSide = l.nodes.filter((n) => n.gen > 0 && t.people[n.personId]!.names.given !== 'Отец');
    expect(l.nodes.find((n) => n.personId === father)!.x).toBeLessThan(0);
    for (const n of motherSide) expect(n.x, t.people[n.personId]!.names.given).toBeGreaterThan(0);
  });
});

describe('«Весь род»: род отца и род матери', () => {
  it('две ветви от ствола: род отца слева, род матери справа', () => {
    const alexey = idOf(demo, 'Алексей');
    const t = layoutArtClan(demo, alexey);
    expect(t.rootId).toBe('');
    const gen1 = t.nodes.filter((n) => n.gen === 1).map((n) => ({ name: demo.people[n.personId]!.names.given, x: n.x }));
    expect(gen1.find((n) => n.name === 'Пётр')!.x).toBeLessThan(0);
    expect(gen1.find((n) => n.name === 'Фёдор')!.x).toBeGreaterThan(0);
  });

  it('мать — пунктир в роду матери, её дети не повторяются', () => {
    const t = layoutArtClan(demo, idOf(demo, 'Алексей'));
    const solid = (name: string) => t.nodes.filter((n) => n.personId === idOf(demo, name) && !n.duplicate).length;
    expect(solid('Алексей')).toBe(1);
    const gulnara = t.nodes.filter((n) => n.personId === idOf(demo, 'Гульнара'));
    expect(gulnara.every((n) => n.duplicate)).toBe(true);
  });
});

describe('«Дерево»: люди не налезают друг на друга', () => {
  const expectApart = (nodes: { x: number; y: number; key: string }[]) => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.hypot(nodes[i]!.x - nodes[j]!.x, nodes[i]!.y - nodes[j]!.y);
        expect(d, `${nodes[i]!.key} и ${nodes[j]!.key}`).toBeGreaterThan(80);
      }
    }
  };
  it('весь род, предки, потомки — на демо и на большом древе', () => {
    expectApart(layoutArtClan(demo, idOf(demo, 'Алексей')).nodes);
    expectApart(layoutArtAncestors(demo, idOf(demo, 'Артём'), 7).nodes);
    const big = createBigTree(4, 3);
    expectApart(layoutArtTree(big, big.rootPersonId!, 12).nodes);
  });
});
