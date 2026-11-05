import { describe, expect, it } from 'vitest';
import {
  OpError,
  addPartnerToFamily,
  addPerson,
  createTree,
  linkChild,
  linkParent,
  linkPartners,
  removePerson,
  unlinkChild,
  unlinkParent,
  updatePerson,
} from './ops';
import { childrenOf, isAncestor, isLiving, matchesQuery, parentsOf, siblingsOf, spousesOf } from './queries';
import type { TreeData } from './types';

// Помощник: добавить людей по именам и вернуть их id
function people(tree: TreeData, ...names: string[]) {
  const ids: Record<string, string> = {};
  for (const name of names) {
    const r = addPerson(tree, { names: { given: name } });
    tree = r.tree;
    ids[name] = r.id;
  }
  return { tree, ids };
}

const expectOpError = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    expect((e as OpError).code).toBe(code);
    return;
  }
  throw new Error(`ожидалась ошибка ${code}`);
};

describe('операции с древом', () => {
  it('исходное древо не меняется (нужно для отмены)', () => {
    const t0 = createTree('Тест');
    const snapshot = JSON.stringify(t0);
    addPerson(t0, { names: { given: 'Иван' } });
    expect(JSON.stringify(t0)).toBe(snapshot);
  });

  it('первый человек становится корнем древа', () => {
    const { tree, ids } = people(createTree('Т'), 'Иван', 'Пётр');
    expect(tree.rootPersonId).toBe(ids['Иван']);
  });

  it('отец и мать попадают в одну семью', () => {
    let { tree, ids } = people(createTree('Т'), 'Сын', 'Отец', 'Мать');
    tree = linkParent(tree, ids.Сын!, ids.Отец!).tree;
    tree = linkParent(tree, ids.Сын!, ids.Мать!).tree;
    expect(Object.keys(tree.families)).toHaveLength(1);
    expect(parentsOf(tree, ids.Сын!).map((p) => p.person.names.given).sort()).toEqual(['Мать', 'Отец']);
  });

  it('третий родной родитель — ошибка, а приёмный — можно', () => {
    let { tree, ids } = people(createTree('Т'), 'Сын', 'Отец', 'Мать', 'Отчим');
    tree = linkParent(tree, ids.Сын!, ids.Отец!).tree;
    tree = linkParent(tree, ids.Сын!, ids.Мать!).tree;
    expectOpError(() => linkParent(tree, ids.Сын!, ids.Отчим!), 'tooManyParents');
    tree = linkParent(tree, ids.Сын!, ids.Отчим!, 'adopted').tree;
    expect(parentsOf(tree, ids.Сын!)).toHaveLength(3);
  });

  it('нельзя стать своим же предком', () => {
    let { tree, ids } = people(createTree('Т'), 'Дед', 'Отец', 'Внук');
    tree = linkParent(tree, ids.Отец!, ids.Дед!).tree;
    tree = linkParent(tree, ids.Внук!, ids.Отец!).tree;
    expect(isAncestor(tree, ids.Дед!, ids.Внук!)).toBe(true);
    expectOpError(() => linkParent(tree, ids.Дед!, ids.Внук!), 'cycle');
    expectOpError(() => linkChild(tree, ids.Внук!, ids.Дед!), 'cycle');
    expectOpError(() => linkParent(tree, ids.Дед!, ids.Дед!), 'self');
  });

  it('если родители уже пара — ребёнок переносится в их союз', () => {
    let { tree, ids } = people(createTree('Т'), 'Сын', 'Отец', 'Мать');
    const couple = linkPartners(tree, ids.Отец!, ids.Мать!);
    tree = couple.tree;
    tree = linkParent(tree, ids.Сын!, ids.Мать!).tree; // пока отдельная семья «мать + сын»
    const r = linkParent(tree, ids.Сын!, ids.Отец!);
    expect(r.familyId).toBe(couple.familyId);
    expect(Object.keys(r.tree.families)).toHaveLength(1);
  });

  it('повторный брак: дети в разных союзах, сводные братья определяются', () => {
    let { tree, ids } = people(createTree('Т'), 'Отец', 'Жена1', 'Жена2', 'Сын1', 'Дочь1', 'Сын2');
    const f1 = linkPartners(tree, ids.Отец!, ids.Жена1!);
    tree = f1.tree;
    const f2 = linkPartners(tree, ids.Отец!, ids.Жена2!, 'married');
    tree = f2.tree;
    expectOpError(() => linkChild(tree, ids.Отец!, ids.Сын1!), 'chooseFamily');
    tree = linkChild(tree, ids.Отец!, ids.Сын1!, { familyId: f1.familyId }).tree;
    tree = linkChild(tree, ids.Отец!, ids.Дочь1!, { familyId: f1.familyId }).tree;
    tree = linkChild(tree, ids.Отец!, ids.Сын2!, { familyId: f2.familyId }).tree;

    expect(spousesOf(tree, ids.Отец!)).toHaveLength(2);
    expect(childrenOf(tree, ids.Отец!)).toHaveLength(3);
    const sib = siblingsOf(tree, ids.Сын1!);
    expect(sib.full.map((p) => p.names.given)).toEqual(['Дочь1']);
    expect(sib.half.map((p) => p.names.given)).toEqual(['Сын2']);
  });

  it('пару нельзя создать дважды', () => {
    let { tree, ids } = people(createTree('Т'), 'А', 'Б');
    tree = linkPartners(tree, ids.А!, ids.Б!).tree;
    expectOpError(() => linkPartners(tree, ids.Б!, ids.А!), 'alreadyLinked');
  });

  it('удаление человека убирает его из семей и чистит пустые семьи', () => {
    let { tree, ids } = people(createTree('Т'), 'Сын', 'Отец');
    tree = linkParent(tree, ids.Сын!, ids.Отец!).tree;
    tree = removePerson(tree, ids.Отец!);
    expect(tree.people[ids.Отец!]).toBeUndefined();
    expect(Object.keys(tree.families)).toHaveLength(0);
    expect(tree.rootPersonId).toBe(ids.Сын);
  });

  it('отвязка ребёнка не удаляет пару', () => {
    let { tree, ids } = people(createTree('Т'), 'А', 'Б', 'В');
    const f = linkPartners(tree, ids.А!, ids.Б!);
    tree = linkChild(f.tree, ids.А!, ids.В!).tree;
    tree = unlinkChild(tree, f.familyId, ids.В!);
    expect(tree.families[f.familyId]?.partners).toHaveLength(2);
    expect(childrenOf(tree, ids.А!)).toHaveLength(0);
  });

  it('второй родитель для детей: добавляется в семью, а если уже пара — дети переезжают', () => {
    let { tree, ids } = people(createTree('Т'), 'Мать', 'Отец', 'Дочь', 'Отчим');
    const single = linkChild(tree, ids.Мать!, ids.Дочь!);
    tree = addPartnerToFamily(single.tree, single.familyId, ids.Отец!);
    expect(parentsOf(tree, ids.Дочь!).map((p) => p.person.names.given).sort()).toEqual(['Мать', 'Отец']);
    expectOpError(() => addPartnerToFamily(tree, single.familyId, ids.Отчим!), 'familyFull');

    // Вариант «уже пара»: мать и отец — супруги, дочь записана только к матери
    const t2 = people(createTree('Т'), 'Мать', 'Отец', 'Дочь');
    const couple = linkPartners(t2.tree, t2.ids.Мать!, t2.ids.Отец!);
    const lone = linkParent(couple.tree, t2.ids.Дочь!, t2.ids.Мать!);
    expect(lone.familyId).not.toBe(couple.familyId);
    const merged = addPartnerToFamily(lone.tree, lone.familyId, t2.ids.Отец!);
    expect(Object.keys(merged.families)).toEqual([couple.familyId]);
    expect(merged.families[couple.familyId]?.children.map((c) => c.id)).toEqual([t2.ids.Дочь]);
  });

  it('второй родитель не может быть потомком ребёнка', () => {
    let { tree, ids } = people(createTree('Т'), 'Мать', 'Сын', 'Внук');
    const f = linkChild(tree, ids.Мать!, ids.Сын!);
    tree = linkParent(f.tree, ids.Внук!, ids.Сын!).tree;
    expectOpError(() => addPartnerToFamily(tree, f.familyId, ids.Внук!), 'cycle');
    expectOpError(() => addPartnerToFamily(tree, f.familyId, ids.Сын!), 'self');
  });

  it('отвязка одного родителя не трогает братьев и второго родителя', () => {
    let { tree, ids } = people(createTree('Т'), 'Отец', 'Мать', 'Сын', 'Дочь');
    const f = linkPartners(tree, ids.Отец!, ids.Мать!);
    tree = linkChild(f.tree, ids.Отец!, ids.Сын!).tree;
    tree = linkChild(tree, ids.Отец!, ids.Дочь!).tree;
    tree = unlinkParent(tree, ids.Сын!, ids.Отец!);
    expect(parentsOf(tree, ids.Сын!).map((p) => p.person.names.given)).toEqual(['Мать']);
    expect(parentsOf(tree, ids.Дочь!).map((p) => p.person.names.given).sort()).toEqual(['Мать', 'Отец']);
    // Сын и дочь теперь единоутробные
    expect(siblingsOf(tree, ids.Сын!).half.map((p) => p.names.given)).toEqual(['Дочь']);
    // Убираем и мать — у сына родителей нет, лишних семей не остаётся
    tree = unlinkParent(tree, ids.Сын!, ids.Мать!);
    expect(parentsOf(tree, ids.Сын!)).toEqual([]);
    expect(Object.keys(tree.families)).toEqual([f.familyId]);
  });

  it('updatePerson не даёт поменять id', () => {
    const { tree, ids } = people(createTree('Т'), 'А');
    const next = updatePerson(tree, ids.А!, (p) => ({ ...p, id: 'взлом', sex: 'M' }));
    expect(next.people[ids.А!]?.sex).toBe('M');
    expect(next.people['взлом']).toBeUndefined();
  });
});

describe('isLiving', () => {
  const base = { id: 'P1', sex: 'U' as const, names: {} };
  it('правила', () => {
    expect(isLiving({ ...base }, 2026)).toBe(true);
    expect(isLiving({ ...base, birth: { date: { date: { y: 1990 } } } }, 2026)).toBe(true);
    expect(isLiving({ ...base, birth: { date: { date: { y: 1900 } } } }, 2026)).toBe(false);
    expect(isLiving({ ...base, death: { place: 'Ташкент' } }, 2026)).toBe(false);
    expect(isLiving({ ...base, birth: { date: { date: { y: 1900 } } }, living: true }, 2026)).toBe(true);
  });
});

describe('поиск', () => {
  it('по частям имени, без учёта регистра и ё', () => {
    const p = { id: 'P', sex: 'F' as const, names: { given: 'Алёна', surname: 'Петрова', birthSurname: 'Иванова' } };
    expect(matchesQuery(p, 'алена')).toBe(true);
    expect(matchesQuery(p, 'петр ал')).toBe(true);
    expect(matchesQuery(p, 'иванова')).toBe(true);
    expect(matchesQuery(p, 'сидорова')).toBe(false);
  });
});
