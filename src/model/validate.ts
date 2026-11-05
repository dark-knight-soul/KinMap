import { TREE_FORMAT_VERSION, type ChildRelation, type DatePart, type Family, type FuzzyDate, type LifeEvent, type Person, type Sex, type TreeData, type UnionStatus } from './types';

// Проверка и «починка» данных при открытии файла. Файл мог быть повреждён,
// отредактирован руками или создан другой версией программы — приложение не должно
// падать, а должно открыть всё, что можно, и сообщить о проблемах.

export type LoadErrorCode = 'notKinmap' | 'tooNew' | 'corrupt' | 'needsPassword' | 'wrongPassword';

export class LoadError extends Error {
  constructor(public code: LoadErrorCode) {
    super(code);
    this.name = 'LoadError';
  }
}

/** Что пришлось исправить при открытии */
export type LoadWarning = 'brokenLinks' | 'tooManyPartners' | 'badValues' | 'emptyFamilies';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

const SEXES: Sex[] = ['M', 'F', 'U'];
const RELATIONS: ChildRelation[] = ['birth', 'adopted', 'foster', 'unknown'];
const STATUSES: UnionStatus[] = ['married', 'partners', 'divorced', 'widowed', 'unknown'];
const QUALIFIERS = ['about', 'before', 'after', 'between'] as const;

function cleanPart(v: unknown): DatePart | undefined {
  if (!isObj(v) || !Number.isInteger(v.y)) return undefined;
  const part: DatePart = { y: v.y as number };
  if (Number.isInteger(v.m) && (v.m as number) >= 1 && (v.m as number) <= 12) {
    part.m = v.m as number;
    if (Number.isInteger(v.d) && (v.d as number) >= 1 && (v.d as number) <= 31) part.d = v.d as number;
  }
  return part;
}

function cleanDate(v: unknown): FuzzyDate | undefined {
  if (!isObj(v)) return undefined;
  const out: FuzzyDate = {};
  const date = cleanPart(v.date);
  if (date) out.date = date;
  const q = QUALIFIERS.find((x) => x === v.q);
  if (q && date) out.q = q;
  const date2 = cleanPart(v.date2);
  if (q === 'between' && date2) out.date2 = date2;
  const text = str(v.text);
  if (text) out.text = text;
  return out.date || out.text ? out : undefined;
}

function cleanEvent(v: unknown): LifeEvent | undefined {
  if (!isObj(v)) return undefined;
  const out: LifeEvent = {};
  const date = cleanDate(v.date);
  if (date) out.date = date;
  const place = str(v.place);
  if (place) out.place = place;
  return out.date || out.place ? out : undefined;
}

export function normalizeTree(raw: unknown): { tree: TreeData; warnings: LoadWarning[] } {
  if (!isObj(raw) || raw.format !== 'kinmap') throw new LoadError('notKinmap');
  if (typeof raw.version !== 'number') throw new LoadError('corrupt');
  if (raw.version > TREE_FORMAT_VERSION) throw new LoadError('tooNew');
  // Здесь будут миграции со старых версий формата: if (raw.version < 2) raw = migrate1to2(raw) …

  const warnings = new Set<LoadWarning>();
  const now = new Date().toISOString();

  const people: Record<string, Person> = {};
  if (isObj(raw.people)) {
    for (const [key, value] of Object.entries(raw.people)) {
      if (!isObj(value)) {
        warnings.add('badValues');
        continue;
      }
      const names = isObj(value.names) ? value.names : {};
      const person: Person = {
        id: key,
        sex: SEXES.find((s) => s === value.sex) ?? 'U',
        names: {},
      };
      for (const field of ['given', 'patronymic', 'surname', 'birthSurname'] as const) {
        const s = str(names[field]);
        if (s) person.names[field] = s;
      }
      const birth = cleanEvent(value.birth);
      if (birth) person.birth = birth;
      const death = cleanEvent(value.death);
      if (death) person.death = death;
      if (typeof value.living === 'boolean') person.living = value.living;
      const notes = str(value.notes);
      if (notes) person.notes = notes;
      people[key] = person;
    }
  }

  const families: Record<string, Family> = {};
  if (isObj(raw.families)) {
    for (const [key, value] of Object.entries(raw.families)) {
      if (!isObj(value)) {
        warnings.add('badValues');
        continue;
      }
      const rawPartners = Array.isArray(value.partners) ? value.partners : [];
      let partners = [...new Set(rawPartners.filter((p): p is string => typeof p === 'string'))];
      if (partners.some((p) => !people[p])) warnings.add('brokenLinks');
      partners = partners.filter((p) => people[p]);
      if (partners.length > 2) {
        warnings.add('tooManyPartners');
        partners = partners.slice(0, 2);
      }

      const seen = new Set<string>();
      const children: Family['children'] = [];
      for (const c of Array.isArray(value.children) ? value.children : []) {
        if (!isObj(c) || typeof c.id !== 'string' || !people[c.id]) {
          warnings.add('brokenLinks');
          continue;
        }
        if (seen.has(c.id) || partners.includes(c.id)) continue;
        seen.add(c.id);
        children.push({ id: c.id, relation: RELATIONS.find((r) => r === c.relation) ?? 'unknown' });
      }

      if (partners.length + children.length < 2) {
        warnings.add('emptyFamilies');
        continue;
      }
      const family: Family = {
        id: key,
        partners,
        status: STATUSES.find((s) => s === value.status) ?? 'unknown',
        children,
      };
      const marriage = cleanEvent(value.marriage);
      if (marriage) family.marriage = marriage;
      const divorce = cleanEvent(value.divorce);
      if (divorce) family.divorce = divorce;
      families[key] = family;
    }
  }

  const tree: TreeData = {
    format: 'kinmap',
    version: TREE_FORMAT_VERSION,
    id: str(raw.id) ?? `T${Date.now().toString(36)}`,
    name: str(raw.name) ?? 'KinMap',
    createdAt: str(raw.createdAt) ?? now,
    updatedAt: str(raw.updatedAt) ?? now,
    people,
    families,
  };
  const root = str(raw.rootPersonId);
  tree.rootPersonId = root && people[root] ? root : Object.keys(people)[0];
  if (!tree.rootPersonId) delete tree.rootPersonId;

  return { tree, warnings: [...warnings] };
}
