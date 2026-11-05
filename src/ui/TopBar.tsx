import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SettingsMenu } from './SettingsMenu';

// Верхняя полоса: логотип, (необязательно) панель древа посередине и кнопка настроек ⚙.
export function TopBar({ children, compact }: { children?: ReactNode; compact?: boolean }) {
  const { t } = useTranslation();
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
      <SettingsMenu />
    </header>
  );
}

export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="7" r="4" />
      <circle cx="7" cy="24" r="4" />
      <circle cx="25" cy="24" r="4" />
      <path d="M16 11v6M7 20v-3h18v3" />
    </svg>
  );
}
