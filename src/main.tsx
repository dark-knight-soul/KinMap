import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './styles.css';
import { App } from './App';
import { applyDeepLinkSettings, openDeepLinkDemo } from './lib/deeplink';

const root = document.getElementById('root');
if (!root) throw new Error('Не найден элемент #root');

// Настройки из адреса (#demo&chart=fan&lang=en) — до первой отрисовки
const link = applyDeepLinkSettings();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void openDeepLinkDemo(link);
