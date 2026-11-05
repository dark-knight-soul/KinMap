import { useTranslation } from 'react-i18next';
import { approxYear, type DateLocale } from '../model/dates';
import { fullName } from '../model/queries';
import type { Person } from '../model/types';

// Помощники вывода: язык дат, «годы жизни», имя или «Без имени».

export function useDateLocale(): DateLocale {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage === 'ru' ? 'ru' : 'en';
}

export function formatDateTime(iso: string | undefined, lang: string): string {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Годы жизни: «1950–2010», «1950», «?–2010» */
export function lifespan(person: Person): string {
  const b = approxYear(person.birth?.date);
  const d = approxYear(person.death?.date);
  if (b && d) return `${b}–${d}`;
  // Умер, но дата неизвестна (в т.ч. отметка «умер» без даты из GEDCOM) — «1934–?»
  if (b) return person.death || person.living === false ? `${b}–?` : String(b);
  if (d) return `?–${d}`;
  return '';
}

export function useNameOf(): (p: Person | undefined) => string {
  const { t } = useTranslation();
  return (p) => (p ? fullName(p) || t('common.unnamed') : '');
}
