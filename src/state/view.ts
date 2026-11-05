import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from '../lib/storage';

// Настройки вида: древо или список, тип схемы, сколько поколений показывать.
// Это настройки интерфейса (не данные древа) — хранятся в браузере, в файл не попадают.

export type ViewMode = 'tree' | 'list';
export type ChartKind = 'family' | 'ancestors' | 'descendants' | 'fan';

export interface ViewState {
  mode: ViewMode;
  chart: ChartKind;
  /** Поколений вверх (предки) */
  up: number;
  /** Поколений вниз (потомки) */
  down: number;
}

export const GEN_MIN = 1;
export const GEN_MAX = 12;
const DEFAULTS: ViewState = { mode: 'tree', chart: 'family', up: 3, down: 3 };

function load(): ViewState {
  try {
    const raw = JSON.parse(readSetting('view') ?? '{}') as Partial<ViewState>;
    const clamp = (n: unknown, d: number) =>
      typeof n === 'number' && Number.isInteger(n) ? Math.min(GEN_MAX, Math.max(GEN_MIN, n)) : d;
    return {
      mode: raw.mode === 'list' ? 'list' : 'tree',
      chart: (['family', 'ancestors', 'descendants', 'fan'] as const).find((c) => c === raw.chart) ?? DEFAULTS.chart,
      up: clamp(raw.up, DEFAULTS.up),
      down: clamp(raw.down, DEFAULTS.down),
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
