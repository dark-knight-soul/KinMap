import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from '../lib/storage';

// Настройки вида: древо или список, тип схемы, сколько поколений показывать.
// Это настройки интерфейса (не данные древа) — хранятся в браузере, в файл не попадают.

export type ViewMode = 'tree' | 'list' | 'calendar';
export type ChartKind = 'family' | 'ancestors' | 'descendants' | 'fan';
/** Чем окрашивать карточки: пол, линии (отцовская/материнская), фамилии */
export type ColorMode = 'sex' | 'line' | 'surname';

export interface ViewState {
  mode: ViewMode;
  chart: ChartKind;
  /** Поколений вверх (предки) */
  up: number;
  /** Поколений вниз (потомки) */
  down: number;
  color: ColorMode;
  /** Мини-карта в углу схемы */
  minimap: boolean;
}

export const GEN_MIN = 1;
export const GEN_MAX = 12;
const DEFAULTS: ViewState = { mode: 'tree', chart: 'family', up: 3, down: 3, color: 'sex', minimap: true };

function load(): ViewState {
  try {
    const raw = JSON.parse(readSetting('view') ?? '{}') as Partial<ViewState>;
    const clamp = (n: unknown, d: number) =>
      typeof n === 'number' && Number.isInteger(n) ? Math.min(GEN_MAX, Math.max(GEN_MIN, n)) : d;
    return {
      mode: raw.mode === 'list' || raw.mode === 'calendar' ? raw.mode : 'tree',
      chart: (['family', 'ancestors', 'descendants', 'fan'] as const).find((c) => c === raw.chart) ?? DEFAULTS.chart,
      up: clamp(raw.up, DEFAULTS.up),
      down: clamp(raw.down, DEFAULTS.down),
      color: (['sex', 'line', 'surname'] as const).find((c) => c === raw.color) ?? DEFAULTS.color,
      minimap: typeof raw.minimap === 'boolean' ? raw.minimap : DEFAULTS.minimap,
    };
  } catch {
    return DEFAULTS;
  }
}

let view = load();
const listeners = new Set<() => void>();

export function setView(patch: Partial<ViewState>): void {
  view = { ...view, ...patch };
  writeSetting('view', JSON.stringify(view));
  listeners.forEach((l) => l());
}

export function getView(): ViewState {
  return view;
}

export function useView(): ViewState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );
}
