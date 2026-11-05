import { newFamilyId, newPersonId, newTreeId } from './ids';
import { isAncestor, parentFamiliesOf, unionsOf } from './queries';
import {
  TREE_FORMAT_VERSION,
  type ChildRelation,
  type Family,
  type FamilyId,
  type Person,
  type PersonId,
  type TreeData,
  type UnionStatus,
} from './types';

// Изменения древа. Все функции «чистые»: не меняют исходный объект, а возвращают новый.
// Благодаря этому отмена (Ctrl+Z) — это просто возврат к предыдущему объекту.

export type OpErrorCode =
  | 'notFound'
  | 'self' // связь человека с самим собой
  | 'cycle' // человек стал бы своим же предком
  | 'alreadyLinked'
  | 'tooManyParents'
  | 'familyFull'
  | 'chooseFamily'; // у родителя несколько союзов — нужно указать, в какой добавить ребёнка

export class OpError extends Error {
  constructor(public code: OpErrorCode) {
    super(code);
    this.name = 'OpError';
  }
}

export function createTree(name: string, now = new Date()): TreeData {
  const iso = now.toISOString();
  return {
    format: 'kinmap',
    version: TREE_FORMAT_VERSION,
    id: newTreeId(),
    name: name.trim() || 'KinMap',
    createdAt: iso,
    updatedAt: iso,
    people: {},
    families: {},
  };
}

export function renameTree(tree: TreeData, name: string): TreeData {
  return { ...tree, name };
}

function getPerson(tree: TreeData, id: PersonId): Person {
  const p = tree.people[id];
  if (!p) throw new OpError('notFound');
  return p;
}

function getFamily(tree: TreeData, id: FamilyId): Family {
  const f = tree.families[id];
  if (!f) throw new OpError('notFound');
  return f;
}

function withFamily(tree: TreeData, family: Family): TreeData {
  return { ...tree, families: { ...tree.families, [family.id]: family } };
}

/** Убирает «пустые» семьи: меньше двух участников (пары без детей и братья без родителей остаются) */
function cleanupFamilies(tree: TreeData): TreeData {
  let families = tree.families;
  for (const f of Object.values(tree.families)) {
    if (f.partners.length + f.children.length < 2) {
      if (families === tree.families) families = { ...families };
      delete families[f.id];
    }
  }
  return families === tree.families ? tree : { ...tree, families };
}

export type NewPerson = Partial<Omit<Person, 'id'>>;

export function addPerson(tree: TreeData, data: NewPerson = {}): { tree: TreeData; id: PersonId } {
  const id = newPersonId();
  const person: Person = { ...data, id, sex: data.sex ?? 'U', names: { ...data.names } };
  const next = { ...tree, people: { ...tree.people, [id]: person } };
  if (!next.rootPersonId) next.rootPersonId = id;
  return { tree: next, id };
}

export function updatePerson(tree: TreeData, id: PersonId, update: (p: Person) => Person): TreeData {
  const updated = update(getPerson(tree, id));
  return { ...tree, people: { ...tree.people, [id]: { ...updated, id } } };
}

export function removePerson(tree: TreeData, id: PersonId): TreeData {
  getPerson(tree, id);
  const people = { ...tree.people };
  delete people[id];
  const families: Record<FamilyId, Family> = {};
  for (const f of Object.values(tree.families)) {
    families[f.id] = {
      ...f,
      partners: f.partners.filter((p) => p !== id),
      children: f.children.filter((c) => c.id !== id),
    };
  }
  const next: TreeData = { ...tree, people, families };
  if (next.rootPersonId === id) next.rootPersonId = Object.keys(people)[0];
  return cleanupFamilies(next);
}

/** Проверки перед связью «родитель → ребёнок» */
function assertCanBeParent(tree: TreeData, parentId: PersonId, childId: PersonId): void {
  getPerson(tree, parentId);
  getPerson(tree, childId);
  if (parentId === childId) throw new OpError('self');
  // Ребёнок не может быть предком своего родителя, и родитель не может уже быть его потомком
  if (isAncestor(tree, childId, parentId)) throw new OpError('cycle');
}

/** Сколько разных родителей данного типа (родные/приёмные…) уже у человека */
function parentIdsByRelation(tree: TreeData, childId: PersonId, relation: ChildRelation): Set<PersonId> {
  const ids = new Set<PersonId>();
  for (const f of parentFamiliesOf(tree, childId)) {
    if (f.children.find((c) => c.id === childId)?.relation === relation) f.partners.forEach((p) => ids.add(p));
  }
  return ids;
}

/** Найти союз ровно этих двух людей */
function findCouple(tree: TreeData, a: PersonId, b: PersonId): Family | undefined {
  return Object.values(tree.families).find(
    (f) => f.partners.length === 2 && f.partners.includes(a) && f.partners.includes(b),
  );
}

/**
 * Добавить ребёнку родителя.
 * - Если у ребёнка есть семья этого типа с одним родителем — второй родитель добавляется туда
 *   (а если эти двое уже пара — ребёнок переносится в их союз).
 * - Если семьи нет — создаётся новая.
 */
export function linkParent(
  tree: TreeData,
  childId: PersonId,
  parentId: PersonId,
  relation: ChildRelation = 'birth',
): { tree: TreeData; familyId: FamilyId } {
  assertCanBeParent(tree, parentId, childId);
  const existing = parentIdsByRelation(tree, childId, relation);
  if (existing.has(parentId)) throw new OpError('alreadyLinked');
  if (existing.size >= 2) throw new OpError('tooManyParents');

  const own = parentFamiliesOf(tree, childId).filter(
    (f) => f.children.find((c) => c.id === childId)?.relation === relation,
  );
  const single = own.find((f) => f.partners.length === 1);

  if (single) {
    const otherParent = single.partners[0]!;
    const couple = findCouple(tree, otherParent, parentId);
    if (couple) {
      // Эти двое уже пара — переносим ребёнка в их союз
      let next = withFamily(tree, { ...single, children: single.children.filter((c) => c.id !== childId) });
      next = withFamily(next, { ...couple, children: [...couple.children, { id: childId, relation }] });
      return { tree: cleanupFamilies(next), familyId: couple.id };
    }
    return { tree: withFamily(tree, { ...single, partners: [...single.partners, parentId] }), familyId: single.id };
  }

  const noParents = own.find((f) => f.partners.length === 0);
  if (noParents) {
    return { tree: withFamily(tree, { ...noParents, partners: [parentId] }), familyId: noParents.id };
  }

  const family: Family = {
    id: newFamilyId(),
    partners: [parentId],
    status: 'unknown',
    children: [{ id: childId, relation }],
  };
  return { tree: withFamily(tree, family), familyId: family.id };
}

/** Создать союз двух людей (брак или партнёрство) */
export function linkPartners(
  tree: TreeData,
  a: PersonId,
  b: PersonId,
  status: UnionStatus = 'married',
): { tree: TreeData; familyId: FamilyId } {
  getPerson(tree, a);
  getPerson(tree, b);
  if (a === b) throw new OpError('self');
  if (findCouple(tree, a, b)) throw new OpError('alreadyLinked');
  const family: Family = { id: newFamilyId(), partners: [a, b], status, children: [] };
  return { tree: withFamily(tree, family), familyId: family.id };
}

/**
 * Добавить человеку ребёнка.
 * familyId — в какой союз (обязателен, если у родителя их несколько).
 */
export function linkChild(
  tree: TreeData,
  parentId: PersonId,
  childId: PersonId,
  options: { familyId?: FamilyId; relation?: ChildRelation } = {},
): { tree: TreeData; familyId: FamilyId } {
  const relation = options.relation ?? 'birth';
  assertCanBeParent(tree, parentId, childId);

  const unions = unionsOf(tree, parentId);
  let family: Family | undefined;
  if (options.familyId) {
    family = getFamily(tree, options.familyId);
    if (!family.partners.includes(parentId)) throw new OpError('notFound');
  } else if (unions.length === 0) {
    return linkParent(tree, childId, parentId, relation);
  } else if (unions.length === 1) {
    family = unions[0]!;
  } else {
    throw new OpError('chooseFamily');
  }

  if (family.children.some((c) => c.id === childId)) throw new OpError('alreadyLinked');
  // Проверяем, что у ребёнка не станет больше двух родителей одного типа
  const ids = parentIdsByRelation(tree, childId, relation);
  family.partners.forEach((p) => ids.add(p));
  if (ids.size > 2) throw new OpError('tooManyParents');
  for (const p of family.partners) if (isAncestor(tree, childId, p)) throw new OpError('cycle');

  // Если ребёнок был в семье только с одним из этих родителей — убираем его оттуда
  let next = tree;
  for (const f of parentFamiliesOf(tree, childId)) {
    const rel = f.children.find((c) => c.id === childId)?.relation;
    if (rel === relation && f.partners.every((p) => family.partners.includes(p))) {
      next = withFamily(next, { ...f, children: f.children.filter((c) => c.id !== childId) });
    }
  }
  const target = next.families[family.id]!;
  next = withFamily(next, { ...target, children: [...target.children, { id: childId, relation }] });
  return { tree: cleanupFamilies(next), familyId: family.id };
}

/**
 * Указать второго партнёра в семье, где известен только один (например, второй родитель детей).
 * Если эти двое уже пара — дети переносятся в их союз.
 */
export function addPartnerToFamily(tree: TreeData, familyId: FamilyId, personId: PersonId): TreeData {
  const f = getFamily(tree, familyId);
  getPerson(tree, personId);
  if (f.partners.includes(personId)) throw new OpError('alreadyLinked');
  if (f.partners.length >= 2) throw new OpError('familyFull');
  for (const c of f.children) {
    if (c.id === personId) throw new OpError('self');
    if (isAncestor(tree, c.id, personId)) throw new OpError('cycle');
  }

  const other = f.partners[0];
  const couple = other ? findCouple(tree, other, personId) : undefined;
  if (couple) {
    const known = new Set(couple.children.map((c) => c.id));
    let next = withFamily(tree, {
      ...couple,
      children: [...couple.children, ...f.children.filter((c) => !known.has(c.id))],
    });
    const families = { ...next.families };
    delete families[f.id];
    next = { ...next, families };
    return next;
  }
  return withFamily(tree, { ...f, partners: [...f.partners, personId] });
}

/**
 * Добавить брата или сестру: ребёнок той же семьи родителей.
 * Если родители не указаны — создаётся «семья» без родителей, только из детей
 * (родителей потом можно добавить — они станут общими).
 */
export function linkSibling(tree: TreeData, personId: PersonId, siblingId: PersonId): { tree: TreeData; familyId: FamilyId } {
  getPerson(tree, personId);
  getPerson(tree, siblingId);
  if (personId === siblingId) throw new OpError('self');
  const own = parentFamiliesOf(tree, personId);
  const family = own.find((f) => f.children.find((c) => c.id === personId)?.relation === 'birth') ?? own[0];

  if (family) {
    if (family.children.some((c) => c.id === siblingId)) throw new OpError('alreadyLinked');
    // У брата не должно стать больше двух родных родителей и он не может быть предком родителей
    const ids = parentIdsByRelation(tree, siblingId, 'birth');
    family.partners.forEach((p) => ids.add(p));
    if (ids.size > 2) throw new OpError('tooManyParents');
    for (const p of family.partners) if (p === siblingId || isAncestor(tree, siblingId, p)) throw new OpError('cycle');
    const next = withFamily(tree, { ...family, children: [...family.children, { id: siblingId, relation: 'birth' }] });
    return { tree: next, familyId: family.id };
  }

  const created: Family = {
    id: newFamilyId(),
    partners: [],
    status: 'unknown',
    children: [
      { id: personId, relation: 'birth' },
      { id: siblingId, relation: 'birth' },
    ],
  };
  return { tree: withFamily(tree, created), familyId: created.id };
}

/** Убрать ребёнка из семьи (сам человек остаётся в древе) */
export function unlinkChild(tree: TreeData, familyId: FamilyId, childId: PersonId): TreeData {
  const f = getFamily(tree, familyId);
  return cleanupFamilies(withFamily(tree, { ...f, children: f.children.filter((c) => c.id !== childId) }));
}

/**
 * Убрать у ребёнка одного родителя. Братья и сёстры не затрагиваются:
 * ребёнок переходит в семью только со вторым родителем (если он был).
 */
export function unlinkParent(tree: TreeData, childId: PersonId, parentId: PersonId): TreeData {
  const f = parentFamiliesOf(tree, childId).find((x) => x.partners.includes(parentId));
  if (!f) throw new OpError('notFound');
  const child = f.children.find((c) => c.id === childId)!;
  const remaining = f.partners.filter((p) => p !== parentId);

  let next = withFamily(tree, { ...f, children: f.children.filter((c) => c.id !== childId) });
  if (remaining.length > 0) {
    const other = remaining[0]!;
    const single = Object.values(next.families).find(
      (x) => x.id !== f.id && x.partners.length === 1 && x.partners[0] === other,
    );
    if (single) {
      next = withFamily(next, { ...single, children: [...single.children, child] });
    } else {
      next = withFamily(next, { id: newFamilyId(), partners: [other], status: 'unknown', children: [child] });
    }
  }
  return cleanupFamilies(next);
}

/** Убрать человека из союза: для пары — разорвать связь, для родителя — отвязать от детей */
export function unlinkPartner(tree: TreeData, familyId: FamilyId, personId: PersonId): TreeData {
  const f = getFamily(tree, familyId);
  return cleanupFamilies(withFamily(tree, { ...f, partners: f.partners.filter((p) => p !== personId) }));
}

export function updateFamily(tree: TreeData, familyId: FamilyId, update: (f: Family) => Family): TreeData {
  const f = getFamily(tree, familyId);
  return withFamily(tree, { ...update(f), id: familyId });
}

export function setChildRelation(
  tree: TreeData,
  familyId: FamilyId,
  childId: PersonId,
  relation: ChildRelation,
): TreeData {
  return updateFamily(tree, familyId, (f) => ({
    ...f,
    children: f.children.map((c) => (c.id === childId ? { ...c, relation } : c)),
  }));
}

export function setRootPerson(tree: TreeData, id: PersonId): TreeData {
  getPerson(tree, id);
  return { ...tree, rootPersonId: id };
}
