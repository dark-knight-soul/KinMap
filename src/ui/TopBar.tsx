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

/**
 * Логотип: семейное дерево — родоначальник внизу, ветви к детям и внукам, листок.
 * Тот же рисунок, что docs/brand/logo.svg, но цвета берутся из темы (плашка — цвет акцента)
 */
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 128 128" aria-hidden="true">
      <rect className="logo-plate" width="128" height="128" rx="30" />
      <g className="logo-branches">
        <path d="M64 98 V78" />
        <path d="M64 78 C64 66 50 64 40 58" />
        <path d="M64 78 C64 66 78 64 88 58" />
        <path d="M40 58 C34 50 30 44 28 36" strokeWidth="4.5" />
        <path d="M40 58 C44 50 48 44 52 34" strokeWidth="4.5" />
        <path d="M88 58 C84 50 80 44 76 34" strokeWidth="4.5" />
        <path d="M88 58 C94 50 98 44 100 36" strokeWidth="4.5" />
      </g>
      <g className="logo-people">
        <circle cx="64" cy="100" r="11" />
        <circle cx="40" cy="58" r="9" />
        <circle cx="88" cy="58" r="9" />
        <circle cx="28" cy="32" r="7" />
        <circle cx="52" cy="30" r="7" />
        <circle cx="76" cy="30" r="7" />
        <circle cx="100" cy="32" r="7" />
      </g>
      <path className="logo-leaf" d="M100 32 c8 -10 18 -10 20 -8 c-2 10 -10 14 -20 8 z" />
    </svg>
  );
}
