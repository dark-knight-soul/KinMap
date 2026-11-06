import { newTreeId } from './ids';
import { OpError, cleanupFamilies } from './ops';
import { isAncestor, parentFamiliesOf, unionsOf } from './queries';
import type { Family, FamilyChild, LifeEvent, Person, PersonId, TreeData, PersonEvent } from './types';

// Объединение двух записей об одном человеке и вырезание ветки древа.

/** Насколько точна дата: день > месяц > год > «около/до/после» > текст > ничего */
function precision(ev?: LifeEvent): number {
  const d = ev?.date;
  if (!d) return 0;
  if (!d.date) return 1;
  if (d.q) return 2;
  return d.date.d !== undefined ? 5 : d.date.m !== undefined ? 4 : 3;
}

/** Лучшее из двух событий: более точная дата важнее, место берём, если его нет */
function mergeEvent(a?: LifeEvent, b?: LifeEvent): LifeEvent | undefined {
  if (!a) return b;
  if (!b) return a;
  const out: LifeEvent = { ...a };
  if (precision(b) > precision(a)) out.date = b.date;
  if (!a.place && b.place) out.place = b.place;
  return out;
}

/** Данные двух записей: у `keep` приоритет, пустое дополняется из `drop` */
export function mergePersonData(keep: Person, drop: Person): Person {
  const names = { ...drop.names, ...Object.fromEntries(Object.entries(keep.names).filter(([, v]) => v)) };
  const merged: Person = {
    ...keep,
    sex: keep.sex !== 'U' ? keep.sex : drop.sex,
    names,
  };
  const birth = mergeEvent(keep.birth, drop.birth);
  if (birth) merged.birth = birth;
  const death = mergeEvent(keep.death, drop.death);
  if (death) merged.death = death;
  if (merged.living === undefined && drop.living !== undefined) merged.living = drop.living;
  if (!merged.occupation && drop.occupation) merged.occupation = drop.occupation;
  if (drop.notes && drop.notes !== keep.notes) merged.notes = keep.notes ? `${keep.notes}\n\n${drop.notes}` : drop.notes;
  const photos = [...(keep.photos ?? []), ...(drop.photos ?? []).filter((p) => !keep.photos?.some((k) => k.id === p.id))];
  if (photos.length) merged.photos = photos;
  const sameEvent = (a: PersonEvent, b: PersonEvent) =>
    a.type === b.type && JSON.stringify(a.date ?? null) === JSON.stringify(b.date ?? null) && (a.place ?? '') === (b.place ?? '') && (a.title ?? '') === (b.title ?? '');
  const events = [...(keep.events ?? []), ...(drop.events ?? []).filter((e) => !keep.events?.some((k) => sameEvent(k, e)))];
  if (events.length) merged.events = events;
  const ignored = [...new Set([...(keep.ignoredChecks ?? []), ...(drop.ignoredChecks ?? [])])];
  if (ignored.length) merged.ignoredChecks = ignored;
  if (drop.gedcom?.extra?.length) {
    merged.gedcom = { ...keep.gedcom, extra: [...(keep.gedcom?.extra ?? []), ...drop.gedcom.extra] };
  }
  return merged;
}

/**
 * Объединить двух людей в одного: `drop` исчезает, все его связи переходят к `keep`.
 * Одинаковые союзы (та же пара) склеиваются, дети в них объединяются.
 */
export function mergePeople(tree: TreeData, keepId: PersonId, dropId: PersonId): TreeData {
  const keep = tree.people[keepId];
  const drop = tree.people[dropId];
  if (!keep || !drop) throw new OpError('notFound');
  if (keepId === dropId) throw new OpError('self');
  // Нельзя склеить человека с его предком или потомком — получился бы «сам себе предок»
  if (isAncestor(tree, keepId, dropId) || isAncestor(tree, dropId, keepId)) throw new OpError('cycle');

  const swap = (id: PersonId) => (id === dropId ? keepId : id);
  let families: Record<string, Family> = {};
  for (const f of Object.values(tree.families)) {
    const partners = [...new Set(f.partners.map(swap))];
    const seen = new Set<PersonId>();
    const children: FamilyChild[] = [];
    for (const c of f.children) {
      const id = swap(c.id);
      if (seen.has(id) || partners.includes(id)) continue;
      seen.add(id);
      children.push({ ...c, id });
    }
    families[f.id] = { ...f, partners, children };
  }

  // Одинаковые пары после замены — один союз. Главным считается союз того, кого оставляем:
  // его статус и даты важнее (например, нынешний брак, а не развод из союза-дубля)
  const keepOwned = new Set(Object.values(tree.families).filter((f) => f.partners.includes(keepId)).map((f) => f.id));
  const byCouple = new Map<string, Family>();
  for (const cur of Object.values(families)) {
    if (cur.partners.length !== 2) continue;
    const key = [...cur.partners].sort().join('|');
    const prev = byCouple.get(key);
    if (!prev) {
      byCouple.set(key, cur);
      continue;
    }
    const curFirst = keepOwned.has(cur.id) && !keepOwned.has(prev.id);
    const first = curFirst ? cur : prev;
    const f = curFirst ? prev : cur;
    const known = new Set(first.children.map((c) => c.id));
    const mergedFamily: Family = {
      ...first,
      status: first.status === 'unknown' ? f.status : first.status,
      marriage: mergeEvent(first.marriage, f.marriage),
      divorce: mergeEvent(first.divorce, f.divorce),
      children: [...first.children, ...f.children.filter((c) => !known.has(c.id))],
    };
    if (!mergedFamily.marriage) delete mergedFamily.marriage;
    if (!mergedFamily.divorce) delete mergedFamily.divorce;
    byCouple.set(key, mergedFamily);
    families = { ...families, [first.id]: mergedFamily };
    delete families[f.id];
  }

  const people = { ...tree.people, [keepId]: mergePersonData(keep, drop) };
  delete people[dropId];
  const next: TreeData = {
    ...tree,
    people,
    families,
    rootPersonId: tree.rootPersonId === dropId ? keepId : tree.rootPersonId,
  };
  return cleanupFamilies(next);
}

export type BranchMode = 'descendants' | 'ancestors';

/**
 * Ветка древа: потомки (с супругами или без) или предки человека — отдельное новое древо.
 * Удобно отправить родственникам только их часть.
 */
export function extractBranch(tree: TreeData, rootId: PersonId, mode: BranchMode, withSpouses: boolean, name: string): TreeData {
  if (!tree.people[rootId]) throw new OpError('notFound');
  const ids = new Set<PersonId>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (mode === 'descendants') {
      for (const f of unionsOf(tree, id)) {
        if (withSpouses) f.partners.forEach((p) => ids.add(p));
        for (const c of f.children) {
          if (!ids.has(c.id)) {
            ids.add(c.id);
            queue.push(c.id);
          }
        }
      }
    } else {
      for (const f of parentFamiliesOf(tree, id)) {
        for (const p of f.partners) {
          if (!ids.has(p)) {
            ids.add(p);
            queue.push(p);
          }
        }
      }
    }
  }

  const people = Object.fromEntries([...ids].map((id) => [id, tree.people[id]!]));
  const families: Record<string, Family> = {};
  for (const f of Object.values(tree.families)) {
    const partners = f.partners.filter((p) => ids.has(p));
    const children = f.children.filter((c) => ids.has(c.id));
    if (partners.length + children.length >= 2) families[f.id] = { ...f, partners, children };
  }
  const now = new Date().toISOString();
  return cleanupFamilies({
    ...tree,
    id: newTreeId(),
    name,
    createdAt: now,
    updatedAt: now,
    people,
    families,
    rootPersonId: rootId,
  });
}
