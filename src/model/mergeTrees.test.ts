import { describe, expect, it } from 'vitest';
import { parseFuzzyDate } from './dates';
import { createDemoTree } from './demo';
import { newFamilyId, newPersonId } from './ids';
import { extractBranch } from './merge';
import { findMatches, mergeTrees } from './mergeTrees';
import { addPerson, createTree, linkChild, linkParent } from './ops';
import { parentsOf } from './queries';
import type { TreeData } from './types';

// Объединение двух древ: «своё» — демо-семья, «чужое» — древо родственника.

/** Как будто древо сделано в другой копии программы: все id другие */
function reId(tree: TreeData): TreeData {
  const pm = new Map(Object.keys(tree.people).map((id) => [id, newPersonId()]));
  const people = Object.fromEntries(Object.values(tree.people).map((p) => [pm.get(p.id)!, { ...p, id: pm.get(p.id)! }]));
  const families = Object.fromEntries(
    Object.values(tree.families).map((f) => {
      const id = newFamilyId();
      return [id, { ...f, id, partners: f.partners.map((p) => pm.get(p)!), children: f.children.map((c) => ({ ...c, id: pm.get(c.id)! })) }];
    }),
  );
  return { ...tree, people, families, rootPersonId: tree.rootPersonId && pm.get(tree.rootPersonId) };
}

const demo = createDemoTree('Д');
const byName = (tree: TreeData, n: string) => Object.values(tree.people).filter((p) => `${p.names.given} ${p.names.surname}`.startsWith(n));
const one = (tree: TreeData, n: string) => byName(tree, n)[0]!;

describe('объединение древ', () => {
  // Древо родственника: ветка Сергея (с супругами) + новый человек — второй ребёнок Ольги
  let theirs = reId(extractBranch(demo, one(demo, 'Сергей').id, 'descendants', true, 'Ветка'));
  const added = addPerson(theirs, { sex: 'M', names: { given: 'Пётр', surname: 'Лебедев', patronymic: 'Павлович' }, birth: { date: parseFuzzyDate('2018') } });
  theirs = linkChild(added.tree, one(added.tree, 'Ольга').id, added.id).tree;

  it('находит всех общих людей и не путает тёзок', () => {
    const matches = findMatches(demo, theirs);
    // Все люди ветки, кроме нового Петра Лебедева
    expect(matches).toHaveLength(Object.keys(theirs.people).length - 1);
    for (const m of matches) {
      const a = theirs.people[m.incomingId]!;
      const b = demo.people[m.baseId]!;
      expect(`${a.names.given} ${a.names.surname} ${a.birth?.date?.date?.y}`).toBe(`${b.names.given} ${b.names.surname} ${b.birth?.date?.date?.y}`);
    }
    // Новый Пётр Лебедев (2018) — не Пётр Демидов (1900)
    expect(matches.some((m) => theirs.people[m.incomingId]!.names.surname === 'Лебедев' && theirs.people[m.incomingId]!.names.given === 'Пётр')).toBe(false);
  });

  it('после объединения: один новый человек, без дублей союзов, у новичка правильные родители', () => {
    const matches = findMatches(demo, theirs);
    const r = mergeTrees(demo, theirs, new Map(matches.map((m) => [m.incomingId, m.baseId])));
    expect(r.added).toBe(1);
    expect(r.conflicts).toBe(0);
    expect(Object.keys(r.tree.people)).toHaveLength(Object.keys(demo.people).length + 1);
    expect(Object.keys(r.tree.families)).toHaveLength(Object.keys(demo.families).length);
    const petr = one(r.tree, 'Пётр Лебедев');
    expect(parentsOf(r.tree, petr.id).map((x) => x.person.names.given).sort()).toEqual(['Ольга', 'Павел']);
    expect(r.tree.rootPersonId).toBe(demo.rootPersonId);
  });

  it('пустые поля дополняются из второго древа', () => {
    const p = one(theirs, 'Максим');
    const enriched = { ...theirs, people: { ...theirs.people, [p.id]: { ...p, occupation: 'Врач' } } };
    const r = mergeTrees(demo, enriched, new Map(findMatches(demo, enriched).map((m) => [m.incomingId, m.baseId])));
    expect(one(r.tree, 'Максим').occupation).toBe('Врач');
  });

  it('противоречия: третий родитель и «сам себе предок» не добавляются', () => {
    // Во втором древе ошибка: сын Алексея (Артём) записан его отцом, а матерью — посторонняя.
    // Само по себе второе древо без петли — петля появилась бы только после объединения
    const copy = (n: string) => {
      const { id: _id, ...rest } = one(demo, n);
      return rest;
    };
    let t = createTree('X');
    const a = addPerson(t, copy('Алексей'));
    const b = addPerson(a.tree, copy('Артём'));
    const c = addPerson(b.tree, { sex: 'F', names: { given: 'Кто-то', surname: 'Чужая' } });
    t = linkParent(c.tree, a.id, b.id).tree;
    t = linkParent(t, a.id, c.id).tree;
    const r = mergeTrees(demo, t, new Map(findMatches(demo, t).map((m) => [m.incomingId, m.baseId])));
    expect(r.conflicts).toBeGreaterThanOrEqual(1);
    const alexey = one(r.tree, 'Алексей');
    const parents = parentsOf(r.tree, alexey.id).map((x) => x.person.names.given);
    expect(parents).not.toContain('Артём');
    expect(parents.filter((g) => g === 'Сергей' || g === 'Гульнара')).toHaveLength(2);
  });

  it('то же самое древо (те же id) — никого нового', () => {
    const r = mergeTrees(demo, demo, new Map(findMatches(demo, demo).map((m) => [m.incomingId, m.baseId])));
    expect(r.added).toBe(0);
    expect(Object.keys(r.tree.people)).toHaveLength(Object.keys(demo.people).length);
    expect(Object.keys(r.tree.families)).toHaveLength(Object.keys(demo.families).length);
  });
});
