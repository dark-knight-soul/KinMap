import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from './i18n';
import { useTheme, type ThemeChoice } from './lib/theme';

// Стартовый экран. На этапе 1 — только каркас: шапка, переключатели языка и темы,
// приветствие. Кнопки создания и открытия древа заработают на этапе 2.
export function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useTheme();

  const features = [
    ['privateTitle', 'privateText'],
    ['printTitle', 'printText'],
    ['kinshipTitle', 'kinshipText'],
    ['gedcomTitle', 'gedcomText'],
  ] as const;

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <Logo />
          <div>
            <div className="brand-name">KinMap</div>
            <div className="brand-tagline">{t('app.tagline')}</div>
          </div>
        </div>

        <div className="header-controls">
          <label className="control">
            <span className="control-label">{t('header.language')}</span>
            <select
              value={i18n.resolvedLanguage}
              onChange={(e) => setLanguage(e.target.value as LanguageCode)}
            >
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

      <main className="main">
        <section className="welcome">
          <h1>{t('welcome.title')}</h1>
          <p className="welcome-text">{t('welcome.text')}</p>
          <div className="actions">
            <button type="button" className="btn btn-primary" disabled title={t('welcome.soon')}>
              {t('welcome.create')}
            </button>
            <button type="button" className="btn" disabled title={t('welcome.soon')}>
              {t('welcome.open')}
            </button>
          </div>
          <p className="hint">{t('welcome.soon')}</p>
        </section>

        <ul className="features">
          {features.map(([title, text]) => (
            <li key={title} className="feature">
              <h2>{t(`features.${title}`)}</h2>
              <p>{t(`features.${text}`)}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="footer">
        <span>{t('footer.version', { version: __APP_VERSION__ })}</span>
        <span>{t('footer.license')}</span>
      </footer>
    </div>
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
