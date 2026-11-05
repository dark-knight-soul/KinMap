import { useEffect, useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage';

// Тема оформления. Выбор хранится в настройках браузера; «system» — светлая или тёмная
// по настройке ОС. На <html> ставится data-theme, по нему themes.css переключает цвета.

export const THEMES = ['system', 'light', 'dark', 'parchment', 'azure', 'midnight'] as const;
export type ThemeChoice = (typeof THEMES)[number];

/** Цвета для образца темы в настройках: фон, поверхность, акцент */
export const THEME_SWATCH: Record<Exclude<ThemeChoice, 'system'>, [string, string, string]> = {
  light: ['#f6f5f1', '#ffffff', '#2f7d5b'],
  dark: ['#121513', '#1b1f1d', '#5fbf92'],
  parchment: ['#efe6d2', '#fbf6ea', '#8a5a2b'],
  azure: ['#f1f5fa', '#ffffff', '#2563c9'],
  midnight: ['#0e1424', '#161e33', '#e2b55a'],
};

const isTheme = (v: string | null): v is ThemeChoice => THEMES.some((t) => t === v);

let current: ThemeChoice = (() => {
  const saved = readSetting('theme');
  return isTheme(saved) ? saved : 'system';
})();
const listeners = new Set<() => void>();

function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

export function setTheme(theme: ThemeChoice): void {
  current = theme;
  writeSetting('theme', theme);
  applyTheme(theme);
  listeners.forEach((l) => l());
}

/** Текущая тема (общая для всех компонентов) */
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const theme = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  useEffect(() => applyTheme(theme), [theme]);
  return [theme, setTheme];
}

/** Для ссылок вида #theme=dark — до первой отрисовки */
export function setThemeFromLink(theme: string): void {
  if (isTheme(theme)) setTheme(theme);
}
