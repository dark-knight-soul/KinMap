import { approxYear } from './dates';
import type { FuzzyDate, GedNode, PersonEvent, PersonEventType } from './types';

// События жизни человека (кроме рождения и смерти — они отдельными полями):
// учёба, служба, работа, переезды, награды… У каждого типа — свой тег GEDCOM,
// чтобы события переносились в другие программы и обратно.

export const EVENT_TYPES: PersonEventType[] = [
  'education',
  'graduation',
  'military',
  'work',
  'residence',
  'award',
  'baptism',
  'burial',
  'emigration',
  'immigration',
  'retirement',
  'other',
];

/** Тег GEDCOM для типа; у EVEN — ещё подполе TYPE с этим текстом */
export const GEDCOM_TAG: Record<PersonEventType, { tag: string; type?: string }> = {
  education: { tag: 'EDUC' },
  graduation: { tag: 'GRAD' },
  military: { tag: 'EVEN', type: 'Military Service' },
  work: { tag: 'OCCU' },
  residence: { tag: 'RESI' },
  award: { tag: 'EVEN', type: 'Award' },
  baptism: { tag: 'BAPM' },
  burial: { tag: 'BURI' },
  emigration: { tag: 'EMIG' },
  immigration: { tag: 'IMMI' },
  retirement: { tag: 'RETI' },
  other: { tag: 'EVEN' },
};

/** Тип события по тегу GEDCOM (и TYPE у EVEN). undefined — тег не про событие жизни */
export function eventTypeFromGedcom(tag: string, typeText?: string): PersonEventType | undefined {
  switch (tag) {
    case 'EDUC':
      return 'education';
    case 'GRAD':
      return 'graduation';
    case 'OCCU':
      return 'work';
    case 'RESI':
      return 'residence';
    case 'BAPM':
    case 'CHR':
      return 'baptism';
    case 'BURI':
    case 'CREM':
      return 'burial';
    case 'EMIG':
      return 'emigration';
    case 'IMMI':
      return 'immigration';
    case 'RETI':
      return 'retirement';
    case '_MILT':
    case '_MILI':
    case '_MILITARY':
    case 'MILI':
      return 'military';
    case 'EVEN': {
      const t = typeText ?? '';
      if (/milit|army|armed|воен|арми|служб/i.test(t)) return 'military';
      if (/award|medal|decorat|награ|медал|орден/i.test(t)) return 'award';
      return 'other';
    }
    default:
      return undefined;
  }
}

let seq = 0;
export function newEventId(): string {
  return `e${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Год события для сортировки (без даты — в конец) */
export const eventYear = (e: { date?: FuzzyDate }) => approxYear(e.date);

/** События по порядку: по году, без даты — в конце, в исходном порядке */
export function sortEvents<T extends { date?: FuzzyDate }>(events: readonly T[]): T[] {
  return events
    .map((e, i) => ({ e, i, y: eventYear(e) ?? Infinity }))
    .sort((a, b) => a.y - b.y || a.i - b.i)
    .map((x) => x.e);
}

/** Пустое событие (нет ни даты, ни места, ни описания, ни заметки) — не храним */
export function isEmptyEvent(e: PersonEvent): boolean {
  return !e.date && !e.place?.trim() && !e.title?.trim() && !e.note?.trim() && !e.gedcom?.length;
}

/** Узлы GEDCOM, которые разбираем в событии сами */
export const KNOWN_EVENT_SUBTAGS = new Set(['DATE', 'PLAC', 'TYPE', 'NOTE']);

/** Событие → узел GEDCOM (узел DATE собирается снаружи — формат зависит от версии GEDCOM) */
export function eventToGedcom(e: PersonEvent, dateNode: GedNode | undefined): GedNode {
  const map = GEDCOM_TAG[e.type];
  const children: GedNode[] = [];
  const type = e.type === 'other' ? e.title?.trim() || 'Event' : map.type;
  if (map.tag === 'EVEN' && type) children.push({ tag: 'TYPE', value: type });
  if (dateNode) children.push(dateNode);
  if (e.place) children.push({ tag: 'PLAC', value: e.place });
  if (e.note) children.push({ tag: 'NOTE', value: e.note });
  if (e.gedcom) children.push(...e.gedcom);
  // Описание: у «другого» оно уже в TYPE; у остальных — значением тега (школа, должность, награда…)
  const value = e.type === 'other' ? undefined : e.title?.trim() || undefined;
  const node: GedNode = { tag: map.tag, children };
  if (value) node.value = value;
  // «1 BURI Y» и т.п.: событие без подробностей тоже должно сохраниться
  if (!value && !children.length) node.value = 'Y';
  return node;
}
