import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { ru } from './ru';
import { en } from './en';
import { detectLanguage, type LanguageCode } from './detect';
import { readSetting, writeSetting } from '../lib/storage';

export { LANGUAGES, type LanguageCode } from './detect';

export function setLanguage(code: LanguageCode): void {
  writeSetting('language', code);
  void i18n.changeLanguage(code);
}

const initial = detectLanguage(readSetting('language'), navigator.languages ?? [navigator.language]);
document.documentElement.lang = initial;

void i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: initial,
  fallbackLng: 'en',
  // React сам экранирует текст, двойное экранирование не нужно
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
