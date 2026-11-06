import { CHART_KINDS, VIEW_MODES, type ChartKind, type ViewMode } from '../state/viewKinds';

// Разбор адреса «#demo&chart=fan&lang=en» — отдельно, без обращений к браузеру (для тестов).

const CHARTS = CHART_KINDS;
const MODES = VIEW_MODES;

export interface DeepLink {
  demo: boolean;
  chart?: ChartKind;
  mode?: ViewMode;
  lang?: string;
  theme?: 'light' | 'dark' | 'parchment' | 'azure' | 'midnight';
  /** Открыть карточку главного человека */
  card: boolean;
}

export function parseDeepLink(hash: string): DeepLink {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const theme = params.get('theme');
  return {
    demo: params.has('demo'),
    chart: CHARTS.find((c) => c === params.get('chart')),
    mode: MODES.find((m) => m === params.get('mode')),
    lang: params.get('lang') ?? undefined,
    theme: (['light', 'dark', 'parchment', 'azure', 'midnight'] as const).find((x) => x === theme),
    card: params.has('card'),
  };
}
