import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n';
import { useTheme, type ThemeChoice } from '../lib/theme';

// Верхняя полоса: логотип, (необязательно) что-то посередине, язык и тема.
export function TopBar({ children, compact }: { children?: ReactNode; compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useTheme();

  return (
    <header className={compact ? 'header header-compact' : 'header'}>
      <div className="brand">
        <Logo />
        <div>
          <div className="brand-name">KinMap</div>
          {!compact && <div className="brand-tagline">{t('app.tagline')}</div>}
        </div>
      </div>

      {children}

      <div className="header-controls">
        <label className="control">
          <span className="control-label">{t('header.language')}</span>
          <select value={i18n.resolvedLanguage} onChange={(e) => setLanguage(e.target.value as LanguageCode)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="control">
          <span className="control-label">{t('header.theme')}</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeChoice)}>
            <option value="system">{t('header.themeSystem')}</option>
            <option value="light">{t('header.themeLight')}</option>
            <option value="dark">{t('header.themeDark')}</option>
          </select>
        </label>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="7" r="4" />
      <circle cx="7" cy="24" r="4" />
      <circle cx="25" cy="24" r="4" />
      <path d="M16 11v6M7 20v-3h18v3" />
    </svg>
  );
}
