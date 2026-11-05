import { useEffect, useState } from 'react';
import { readSetting, writeSetting } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

const isTheme = (v: string | null): v is ThemeChoice => v === 'system' || v === 'light' || v === 'dark';

// Тема: выбор пользователя хранится в настройках, «system» следует за ОС.
// На <html> ставится data-theme, по нему CSS переключает цвета.
export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState<ThemeChoice>(() => {
    const saved = readSetting('theme');
    return isTheme(saved) ? saved : 'system';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    writeSetting('theme', theme);
  }, [theme]);

  return [theme, setTheme];
}
