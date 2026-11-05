import { Check, Keyboard, Monitor, Settings } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage } from '../i18n';
import { THEMES, THEME_SWATCH, useTheme } from '../lib/theme';
import { closeHelp, openHelp, useUi } from '../state/ui';
import { HelpDialog } from './HelpDialog';

// Кнопка ⚙: язык, тема (с образцами цветов) и справка по клавишам.
export function SettingsMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const helpOpen = useUi((s) => s.helpOpen);
  const ref = useRef<HTMLDivElement>(null);

  // Закрытие по клику мимо и по Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="settings" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={t('settings.title')}
        title={t('settings.title')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Settings size={20} strokeWidth={1.75} />
      </button>
      {open && (
        <div className="popover settings-popover" role="dialog" aria-label={t('settings.title')}>
          <div className="popover-section">
            <div className="popover-label">{t('header.language')}</div>
            <div className="segmented segmented-full">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  className={i18n.resolvedLanguage === l.code ? 'active' : ''}
                  onClick={() => setLanguage(l.code)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
          <div className="popover-section">
            <div className="popover-label">{t('header.theme')}</div>
            <div className="theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th}
                  type="button"
                  className={theme === th ? 'theme-option active' : 'theme-option'}
                  onClick={() => setTheme(th)}
                  aria-pressed={theme === th}
                >
                  <span className="swatch" aria-hidden="true">
                    {th === 'system' ? (
                      <Monitor size={18} strokeWidth={1.75} />
                    ) : (
                      <>
                        <span style={{ background: THEME_SWATCH[th][0] }} />
                        <span style={{ background: THEME_SWATCH[th][1] }} />
                        <span style={{ background: THEME_SWATCH[th][2] }} />
                      </>
                    )}
                    {theme === th && <Check className="swatch-check" size={14} strokeWidth={3} />}
                  </span>
                  <span className="small">{t(`themes.${th}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              openHelp();
            }}
          >
            <Keyboard size={16} strokeWidth={1.75} /> {t('help.title')}
          </button>
        </div>
      )}
      {helpOpen && <HelpDialog onClose={closeHelp} />}
    </div>
  );
}
