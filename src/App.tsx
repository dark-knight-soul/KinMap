import { useTranslation } from 'react-i18next';
import { useApp } from './state/store';
import { NoticeToast } from './ui/NoticeToast';
import { StartScreen } from './ui/StartScreen';
import { TopBar } from './ui/TopBar';
import { Workspace } from './ui/Workspace';

// Корень приложения: стартовый экран или открытое древо.
export function App() {
  const { t } = useTranslation();
  const hasSession = useApp((s) => s.session !== null);

  return (
    <div className="app">
      {hasSession ? (
        <Workspace />
      ) : (
        <>
          <TopBar />
          <StartScreen />
          <footer className="footer">
            <span>{t('footer.version', { version: __APP_VERSION__ })}</span>
            <span>{t('footer.license')}</span>
          </footer>
        </>
      )}
      <NoticeToast />
    </div>
  );
}
