import { mainParentFamily } from './treeLayout';
import { genderSurname } from '../model/names';
import { unionsOf } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';

// Окраска карточек по «линиям» и фамилиям.
//  line    — относительно человека в центре: предки по отцу, предки по матери,
//            «свои» (он сам, братья и сёстры, потомки), остальные (супруги) — нейтрально;
//  surname — у каждой фамилии свой цвет (Иванов и Иванова — один); самые частые
//            фамилии древа получают первые, самые различимые цвета палитры.

export type LineKind = 'paternal' | 'maternal' | 'own';

/** Палитра для фамилий: различимые и спокойные цвета, хорошо смотрятся и в тёмной теме.
 *  Серого нет — серым показываются люди без фамилии */
export const SURNAME_PALETTE = ['#4a7fc1', '#d9822b', '#2f9e6f', '#c45a86', '#8a63c9', '#c9a227', '#2aa3b5', '#b5523b', '#6b8e23'];

function ancestorsVia(tree: TreeData, startId: PersonId | undefined): Set<PersonId> {
  const out = new Set<PersonId>();
  const queue = startId ? [startId] : [];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id)) continue;
    out.add(id);
    const pf = mainParentFamily(tree, id);
    pf?.family.partners.forEach((p) => queue.push(p));
  }
  return out;
}

/** Все потомки (через индекс связей — быстро и на тысячах людей, без рекурсии) */
function descendantsOf(tree: TreeData, id: PersonId, out = new Set<PersonId>()): Set<PersonId> {
  const queue = [id];
  while (queue.length) {
    const cur = queue.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    for (const f of unionsOf(tree, cur)) for (const c of f.children) queue.push(c.id);
  }
  return out;
}

/** К какой линии относится каждый человек (относительно `focusId`) */
export function lineKinds(tree: TreeData, focusId: PersonId): Map<PersonId, LineKind> {
  const result = new Map<PersonId, LineKind>();
  const pf = mainParentFamily(tree, focusId);
  const partners = pf?.family.partners ?? [];
  const father = partners.find((p) => tree.people[p]?.sex === 'M') ?? partners[0];
  const mother = partners.find((p) => p !== father);
  for (const id of ancestorsVia(tree, father)) result.set(id, 'paternal');
  for (const id of ancestorsVia(tree, mother)) if (!result.has(id)) result.set(id, 'maternal');
  // Свои: сам человек, братья и сёстры и все их потомки
  const own = descendantsOf(tree, focusId);
  for (const c of pf?.family.children ?? []) descendantsOf(tree, c.id, own);
  for (const id of own) result.set(id, 'own');
  return result;
}

/** Ключ фамилии: мужская форма в нижнем регистре (Иванова → иванов) */
export function surnameKey(surname: string | undefined): string | undefined {
  const sn = surname?.trim();
  return sn ? genderSurname(sn, 'M').toLocaleLowerCase() : undefined;
}

/** Цвет каждой фамилии древа: по убыванию частоты — по порядку палитры (дальше цвета повторяются) */
export function surnameColors(tree: TreeData): Map<string, string> {
  const count = new Map<string, number>();
  for (const p of Object.values(tree.people)) {
    const k = surnameKey(p.names.surname);
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  }
  const order = [...count.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return new Map(order.map(([k], i) => [k, SURNAME_PALETTE[i % SURNAME_PALETTE.length]!]));
}
