import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import { approxYear, type DateLocale } from '../model/dates';
import { namesIn } from '../model/nameVariants';
import { joinName } from '../model/queries';
import type { Person, PersonNames } from '../model/types';

// Помощники вывода: язык дат, «годы жизни», имя или «Без имени».

export function useDateLocale(): DateLocale {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage;
  return lang === 'ru' || lang === 'uz' ? lang : 'en';
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

/** Имя для показа: если у человека есть вариант на языке интерфейса — он, иначе основное */
export function shownNames(p: Person): PersonNames {
  return namesIn(p, i18n.resolvedLanguage);
}

export function useNameOf(): (p: Person | undefined) => string {
  const { t } = useTranslation();
  return (p) => (p ? joinName(shownNames(p)) || t('common.unnamed') : '');
}
