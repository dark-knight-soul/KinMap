import type { ChartKind, ViewMode } from '../state/view';

// Разбор адреса «#demo&chart=fan&lang=en» — отдельно, без обращений к браузеру (для тестов).

const CHARTS: ChartKind[] = ['family', 'ancestors', 'descendants', 'fan'];
const MODES: ViewMode[] = ['tree', 'list', 'calendar'];

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
