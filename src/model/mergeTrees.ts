import { approxYear } from './dates';
import { newFamilyId, newPersonId } from './ids';
import { mergePersonData } from './merge';
import { genderSurname } from './names';
import { cleanupFamilies } from './ops';
import type { Family, FamilyChild, PersonId, Person, TreeData } from './types';

// Объединение двух древ: своё (base) и чужое (incoming) — например, древо родственника.
//
// 1. findMatches — ищет, кто из второго древа уже есть в первом. Имя должно совпасть;
//    очки дают фамилия (Иванов = Иванова), годы рождения и смерти, место рождения
//    и совпавшие родственники. Противоречия (разные отчества, годы далеко, разный пол)
//    исключают пару. Пары подбираются один-к-одному, сначала самые уверенные.
// 2. mergeTrees — совпавшие люди сливаются (данные первого древа главнее, пустые поля
//    дополняются), остальные добавляются с новыми id. Одинаковые союзы склеиваются.
//    Связи, которые сделали бы человека своим предком или дали бы ребёнку третьего
//    родителя, пропускаются и считаются в отчёте.

export type MatchReason = 'surname' | 'patronymic' | 'birthYear' | 'birthDate' | 'birthPlace' | 'deathYear' | 'relatives';

export interface MatchCandidate {
  incomingId: PersonId;
  baseId: PersonId;
  score: number;
  reasons: MatchReason[];
}

/** Порог уверенности: например, имя + фамилия + год рождения */
export const MATCH_THRESHOLD = 5;

const norm = (s: string | undefined) => (s ?? '').trim().toLocaleLowerCase().replace(/ё/g, 'е');
const surnameKey = (s: string | undefined) => norm(s ? genderSurname(s.trim(), 'M') : undefined);
const placeKey = (s: string | undefined) => norm(s?.split(',')[0]);

/** Оценка пары без учёта родственников; null — точно разные люди */
function personScore(a: Person, b: Person): { score: number; reasons: MatchReason[] } | null {
  if (!norm(a.names.given) || norm(a.names.given) !== norm(b.names.given)) return null;
  if (a.sex !== 'U' && b.sex !== 'U' && a.sex !== b.sex) return null;
  let score = 1;
  const reasons: MatchReason[] = [];

  // Фамилия: совпадает (с учётом рода) или совпадает с фамилией при рождении
  const sa = [surnameKey(a.names.surname), surnameKey(a.names.birthSurname)].filter(Boolean);
  const sb = [surnameKey(b.names.surname), surnameKey(b.names.birthSurname)].filter(Boolean);
  if (sa.length && sb.length) {
    if (sa[0] === sb[0]) score += 3;
    else if (sa.some((x) => sb.includes(x))) score += 2;
    else return null;
    reasons.push('surname');
  }
  const pa = norm(a.names.patronymic);
  const pb = norm(b.names.patronymic);
  if (pa && pb) {
    if (pa !== pb) return null;
    score += 1;
    reasons.push('patronymic');
  }

  const ya = approxYear(a.birth?.date);
  const yb = approxYear(b.birth?.date);
  if (ya !== undefined && yb !== undefined) {
    const diff = Math.abs(ya - yb);
    const fuzzy = !!a.birth?.date?.q || !!b.birth?.date?.q;
    if (diff > (fuzzy ? 6 : 3)) return null;
    if (diff === 0) {
      score += 3;
      const da = a.birth?.date?.date;
      const db = b.birth?.date?.date;
      if (da?.d && db?.d && da.m === db.m && da.d === db.d) {
        score += 2;
        reasons.push('birthDate');
      } else reasons.push('birthYear');
    } else if (diff <= 2) {
      score += 1;
      reasons.push('birthYear');
    }
  }
  const da = approxYear(a.death?.date);
  const db = approxYear(b.death?.date);
  if (da !== undefined && db !== undefined) {
    if (Math.abs(da - db) > 3) return null;
    if (da === db) {
      score += 2;
      reasons.push('deathYear');
    }
  }
  if (placeKey(a.birth?.place) && placeKey(a.birth?.place) === placeKey(b.birth?.place)) {
    score += 1;
    reasons.push('birthPlace');
  }
  return { score, reasons };
}

/** Родственники человека: родители, супруги, дети */
function relativesIndex(tree: TreeData): Map<PersonId, Set<PersonId>> {
  const m = new Map<PersonId, Set<PersonId>>();
  const link = (a: PersonId, b: PersonId) => {
    if (!m.has(a)) m.set(a, new Set());
    m.get(a)!.add(b);
  };
  for (const f of Object.values(tree.families)) {
    for (const p of f.partners) {
      for (const q of f.partners) if (p !== q) link(p, q);
      for (const c of f.children) {
        link(p, c.id);
        link(c.id, p);
      }
    }
  }
  return m;
}

export function findMatches(base: TreeData, incoming: TreeData): MatchCandidate[] {
  // Кандидаты — только с тем же именем (индекс по имени — быстро и на больших древах)
  const byGiven = new Map<string, Person[]>();
  for (const p of Object.values(base.people)) {
    const k = norm(p.names.given);
    if (k) byGiven.set(k, [...(byGiven.get(k) ?? []), p]);
  }
  const pairs: MatchCandidate[] = [];
  for (const p of Object.values(incoming.people)) {
    for (const q of byGiven.get(norm(p.names.given)) ?? []) {
      const s = personScore(p, q);
      if (s) pairs.push({ incomingId: p.id, baseId: q.id, score: s.score, reasons: s.reasons });
    }
  }

  // Совпавшие родственники добавляют уверенности: два прохода, каждый раз — по лучшим парам
  const relIn = relativesIndex(incoming);
  const relBase = relativesIndex(base);
  const own = pairs.map((p) => p.score);
  for (let pass = 0; pass < 2; pass++) {
    const best = new Map<PersonId, PersonId>();
    for (const p of [...pairs].sort((a, b) => b.score - a.score)) if (!best.has(p.incomingId) && p.score >= MATCH_THRESHOLD) best.set(p.incomingId, p.baseId);
    pairs.forEach((p, i) => {
      let shared = 0;
      for (const r of relIn.get(p.incomingId) ?? []) {
        const mapped = best.get(r);
        if (mapped && relBase.get(p.baseId)?.has(mapped)) shared++;
      }
      p.score = own[i]! + Math.min(shared, 3) * 2;
      if (shared && !p.reasons.includes('relatives')) p.reasons.push('relatives');
      if (!shared) p.reasons = p.reasons.filter((r) => r !== 'relatives');
    });
  }

  // Один к одному: сначала самые уверенные
  const usedIn = new Set<PersonId>();
  const usedBase = new Set<PersonId>();
  const out: MatchCandidate[] = [];
  for (const p of pairs.sort((a, b) => b.score - a.score)) {
    if (p.score < MATCH_THRESHOLD || usedIn.has(p.incomingId) || usedBase.has(p.baseId)) continue;
    usedIn.add(p.incomingId);
    usedBase.add(p.baseId);
    out.push(p);
  }
  return out;
}

export interface MergeTreesResult {
  tree: TreeData;
  /** Сколько людей добавлено как новые */
  added: number;
  /** Сколько людей слито с уже имеющимися */
  merged: number;
  /** Сколько связей пропущено из-за противоречий */
  conflicts: number;
}

/**
 * Влить incoming в base. mapping: id во втором древе → id в первом (совпавшие люди).
 * Остальные люди второго древа добавляются с новыми id.
 */
export function mergeTrees(base: TreeData, incoming: TreeData, mapping: ReadonlyMap<PersonId, PersonId>): MergeTreesResult {
  const people: Record<PersonId, Person> = { ...base.people };
  const families: Record<string, Family> = { ...base.families };
  const idMap = new Map<PersonId, PersonId>();
  let added = 0;
  let merged = 0;
  let conflicts = 0;

  for (const p of Object.values(incoming.people)) {
    const target = mapping.get(p.id);
    if (target && people[target]) {
      idMap.set(p.id, target);
      people[target] = mergePersonData(people[target]!, { ...p, id: target });
      merged++;
    } else {
      // Всегда новый id: то же древо могли открыть дважды — id совпали бы
      let id = newPersonId();
      while (people[id]) id = newPersonId();
      idMap.set(p.id, id);
      people[id] = { ...p, id };
      added++;
    }
  }

  // Родители каждого человека — чтобы не допустить «сам себе предок» и третьего родителя
  const parentsOf = new Map<PersonId, Set<PersonId>>();
  const birthFamilies = new Map<PersonId, Set<string>>();
  const indexFamily = (f: Family) => {
    for (const c of f.children) {
      const set = parentsOf.get(c.id) ?? new Set();
      f.partners.forEach((p) => set.add(p));
      parentsOf.set(c.id, set);
      if (c.relation === 'birth') birthFamilies.set(c.id, (birthFamilies.get(c.id) ?? new Set()).add(f.id));
    }
  };
  Object.values(families).forEach(indexFamily);
  const isAncestor = (anc: PersonId, of: PersonId) => {
    const seen = new Set<PersonId>();
    const stack = [of];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const p of parentsOf.get(cur) ?? []) {
        if (p === anc) return true;
        if (!seen.has(p)) {
          seen.add(p);
          stack.push(p);
        }
      }
    }
    return false;
  };

  for (const f of Object.values(incoming.families)) {
    const partners = [...new Set(f.partners.map((p) => idMap.get(p)!).filter(Boolean))];
    const kids = f.children.map((c) => ({ ...c, id: idMap.get(c.id)! })).filter((c) => c.id);
    // Тот же союз уже есть? Пара — по составу; один родитель — союз этого родителя без второго
    const key = [...partners].sort().join('|');
    let target = Object.values(families).find((x) =>
      partners.length === 2 ? [...x.partners].sort().join('|') === key : partners.length === 1 && x.partners.length === 1 && x.partners[0] === partners[0],
    );
    if (!target) {
      if (partners.length === 0 && kids.length < 2) continue;
      let id = newFamilyId();
      while (families[id]) id = newFamilyId();
      target = { ...f, id, partners: [...partners], children: [] };
    } else {
      // Союз уже есть: статус и даты первого древа главнее, пустое — дополняем
      target = {
        ...target,
        status: target.status === 'unknown' ? f.status : target.status,
        ...(!target.marriage && f.marriage && { marriage: f.marriage }),
        ...(!target.divorce && f.divorce && { divorce: f.divorce }),
      };
    }
    const children: FamilyChild[] = [...target.children];
    for (const c of kids) {
      if (children.some((x) => x.id === c.id)) continue;
      // Ребёнок не может быть предком своего родителя (и самим родителем)
      if (target.partners.some((p) => p === c.id || isAncestor(c.id, p))) {
        conflicts++;
        continue;
      }
      // У ребёнка уже есть родная семья с другими родителями — второй родной не будет
      const otherBirth = [...(birthFamilies.get(c.id) ?? [])].filter((fid) => fid !== target!.id);
      if (c.relation === 'birth' && otherBirth.length) {
        conflicts++;
        continue;
      }
      children.push(c);
    }
    target = { ...target, children };
    families[target.id] = target;
    indexFamily(target);
  }

  // Записи GEDCOM верхнего уровня (источники и т.п.) — если их идентификаторы не заняты
  const usedXref = new Set((base.gedcomRecords ?? []).map((r) => r.xref).filter(Boolean));
  const extraRecords = (incoming.gedcomRecords ?? []).filter((r) => !r.xref || !usedXref.has(r.xref));
  const gedcomRecords = [...(base.gedcomRecords ?? []), ...extraRecords];

  const tree = cleanupFamilies({
    ...base,
    people,
    families,
    ...(gedcomRecords.length && { gedcomRecords }),
    rootPersonId: base.rootPersonId ?? idMap.get(incoming.rootPersonId ?? ''),
  });
  return { tree, added, merged, conflicts };
}
