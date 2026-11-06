import { describe, expect, it } from 'vitest';
import { parseFuzzyDate } from './dates';
import { createDemoTree } from './demo';
import { extractBranch, mergePeople } from './merge';
import { OpError, addPerson, createTree, linkChild, linkParent, linkPartners } from './ops';
import { childrenOf, parentsOf, spousesOf } from './queries';
import type { TreeData } from './types';

const add = (t: { tree: TreeData }, given: string, extra: Parameters<typeof addPerson>[1] = {}) => {
  const r = addPerson(t.tree, { ...extra, names: { given, ...extra.names } });
  t.tree = r.tree;
  return r.id;
};

describe('объединение дубликатов', () => {
  it('связи переходят к оставшемуся, пустые поля дополняются', () => {
    const t = { tree: createTree('Т') };
    const ivan1 = add(t, 'Иван', { sex: 'M', names: { surname: 'Петров' }, birth: { date: parseFuzzyDate('1950') } });
    const ivan2 = add(t, 'Иван', { names: { patronymic: 'Ильич' }, birth: { date: parseFuzzyDate('12.03.1950'), place: 'Тула' }, notes: 'Служил на флоте' });
    const father = add(t, 'Илья');
    const son = add(t, 'Сын');
    t.tree = linkParent(t.tree, ivan2, father).tree; // отец записан у второго
    t.tree = linkChild(t.tree, ivan1, son).tree; // сын — у первого

    const merged = mergePeople(t.tree, ivan1, ivan2);
    expect(merged.people[ivan2]).toBeUndefined();
    const p = merged.people[ivan1]!;
    expect(p.names).toEqual({ given: 'Иван', surname: 'Петров', patronymic: 'Ильич' });
    expect(p.sex).toBe('M');
    expect(p.birth).toEqual({ date: { date: { y: 1950, m: 3, d: 12 } }, place: 'Тула' }); // точная дата лучше «1950»
    expect(p.notes).toBe('Служил на флоте');
    expect(parentsOf(merged, ivan1).map((x) => x.person.id)).toEqual([father]);
    expect(childrenOf(merged, ivan1).map((x) => x.person.id)).toEqual([son]);
  });

  it('одна и та же пара записана дважды — союзы склеиваются, дети объединяются', () => {
    const t = { tree: createTree('Т') };
    const a = add(t, 'Муж');
    const b1 = add(t, 'Жена');
    const b2 = add(t, 'Жена (дубль)');
    const [c1, c2] = [add(t, 'Сын'), add(t, 'Дочь')];
    const f1 = linkPartners(t.tree, a, b1);
    t.tree = linkChild(f1.tree, a, c1, { familyId: f1.familyId }).tree;
    const f2 = linkPartners(t.tree, a, b2);
    t.tree = linkChild(f2.tree, a, c2, { familyId: f2.familyId }).tree;

    const merged = mergePeople(t.tree, b1, b2);
    expect(spousesOf(merged, a)).toHaveLength(1);
    expect(childrenOf(merged, a).map((c) => c.person.names.given).sort()).toEqual(['Дочь', 'Сын']);
  });

  it('статус союза берётся у того, кого оставляем (даже если союз-дубль записан раньше)', () => {
    const t = { tree: createTree('Т') };
    const a = add(t, 'Муж');
    const old = add(t, 'Жена (дубль)');
    const cur = add(t, 'Жена');
    const f1 = linkPartners(t.tree, a, old);
    t.tree = { ...f1.tree, families: { ...f1.tree.families, [f1.familyId]: { ...f1.tree.families[f1.familyId]!, status: 'divorced' } } };
    const f2 = linkPartners(t.tree, a, cur);
    t.tree = { ...f2.tree, families: { ...f2.tree.families, [f2.familyId]: { ...f2.tree.families[f2.familyId]!, status: 'married' } } };

    const merged = mergePeople(t.tree, cur, old);
    const unions = spousesOf(merged, a);
    expect(unions).toHaveLength(1);
    expect(unions[0]!.family.status).toBe('married');
  });

  it('нельзя склеить человека с его предком', () => {
    const t = { tree: createTree('Т') };
    const [p, c] = [add(t, 'Отец'), add(t, 'Сын')];
    t.tree = linkParent(t.tree, c, p).tree;
    expect(() => mergePeople(t.tree, p, c)).toThrowError(OpError);
  });

  it('главный человек переходит к оставшемуся', () => {
    const t = { tree: createTree('Т') };
    const a = add(t, 'А');
    const b = add(t, 'Б');
    expect(t.tree.rootPersonId).toBe(a);
    expect(mergePeople(t.tree, b, a).rootPersonId).toBe(b);
  });
});

describe('ветка древа', () => {
  const demo = createDemoTree('Д');
  const id = (n: string) => Object.values(demo.people).find((p) => p.names.given === n)!.id;
  const names = (t: TreeData) => Object.values(t.people).map((p) => p.names.given).sort();

  it('потомки Ивана без супругов', () => {
    const b = extractBranch(demo, id('Иван'), 'descendants', false, 'Ветка');
    expect(names(b)).toEqual(['Алексей', 'Артём', 'Виктор', 'Дарья', 'Дмитрий', 'Иван', 'Ирина', 'Максим', 'Ольга', 'Сергей', 'София', 'Татьяна'].sort());
    expect(b.id).not.toBe(demo.id);
    expect(b.rootPersonId).toBe(id('Иван'));
  });

  it('потомки с супругами — супруги есть, их родителей нет', () => {
    const b = extractBranch(demo, id('Сергей'), 'descendants', true, 'Ветка');
    expect(names(b)).toContain('Гульнара');
    expect(names(b)).toContain('Марина');
    expect(names(b)).not.toContain('Тимур');
  });

  it('предки Алексея — 15 человек, без братьев и детей', () => {
    const b = extractBranch(demo, id('Алексей'), 'ancestors', false, 'Предки');
    expect(Object.keys(b.people)).toHaveLength(15);
    expect(names(b)).not.toContain('Артём');
    expect(names(b)).not.toContain('Максим');
    expect(parentsOf(b, id('Алексей'))).toHaveLength(2);
  });
});
