// Список языков и выбор языка при первом запуске. Без обращений к браузеру —
// чтобы функцию можно было проверять тестами.

export const LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'uz', label: 'Oʻzbekcha' },
  { code: 'en', label: 'English' },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]['code'];

export const isLanguage = (value: string | null | undefined): value is LanguageCode =>
  LANGUAGES.some((l) => l.code === value);

// Языки, носителям которых русский интерфейс обычно понятнее английского
// (узбекский теперь свой — в списке его нет)
const PREFER_RUSSIAN = ['ru', 'kk', 'ky', 'tg', 'be', 'uk', 'az', 'hy', 'ka', 'tk'];

// Сохранённый выбор → язык браузера → английский
export function detectLanguage(saved: string | null, browserLanguages: readonly string[]): LanguageCode {
  if (isLanguage(saved)) return saved;
  for (const lang of browserLanguages) {
    const base = lang.toLowerCase().split('-')[0] ?? '';
    if (PREFER_RUSSIAN.includes(base)) return 'ru';
    if (isLanguage(base)) return base;
  }
  return 'en';
}
