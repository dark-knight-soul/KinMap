import i18n, { setLanguage } from '../i18n';
import { isLanguage } from '../i18n/detect';
import { createDemoTree } from '../model/demo';
import { openSession, select } from '../state/store';
import { setView } from '../state/view';
import { parseDeepLink, type DeepLink } from './deeplinkParse';
import { setThemeFromLink } from './theme';

// Ссылки вида KinMap.html#demo&chart=fan&lang=en — открыть пример сразу.
// Нужны для README («посмотреть пример») и для снимков экрана.
// В ссылке только настройки вида — никаких данных древа.

/** Применить настройки из адреса (до первой отрисовки) */
export function applyDeepLinkSettings(): DeepLink {
  const link = parseDeepLink(window.location.hash);
  if (link.lang && isLanguage(link.lang)) setLanguage(link.lang);
  if (link.theme) setThemeFromLink(link.theme);
  if (link.chart || link.mode) setView({ ...(link.chart && { chart: link.chart }), ...(link.mode && { mode: link.mode }) });
  return link;
}

/** Открыть пример, если в адресе #demo. Адрес очищается, чтобы перезагрузка не создавала копию */
export async function openDeepLinkDemo(link: DeepLink): Promise<void> {
  if (!link.demo) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const tree = createDemoTree(i18n.t('demo.name'));
  // Сессия появляется сразу, а запись копии в браузер идёт в фоне — карточку открываем, не дожидаясь её
  const opening = openSession({ tree, key: null, syncedWithFile: false });
  if (link.card && tree.rootPersonId) select(tree.rootPersonId);
  await opening;
}
