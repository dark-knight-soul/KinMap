import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from '../lib/storage';

// Настройки вида: древо или список, тип схемы, сколько поколений показывать.
// Это настройки интерфейса (не данные древа) — хранятся в браузере, в файл не попадают.

import { CHART_KINDS, VIEW_MODES, type ChartKind, type ViewMode } from './viewKinds';

export { CHART_KINDS, ROTATABLE, VIEW_MODES, type ChartKind, type ViewMode } from './viewKinds';
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
  /** Горизонтальная схема: предки слева, потомки справа */
  horizontal: boolean;
  /** Лента времени: показывать исторические события */
  history: boolean;
  /** «Дерево»: предки (родословное, по умолчанию), потомки, полный (предки + потомки), весь род */
  artMode: ArtViewMode;
  /** «Дерево» предков: сколько поколений (по традиции — семь) */
  artUp: number;
  /** «Потомки»: от кого растить — запоминается для конкретного человека в центре */
  artDescRoot?: { focus: string; root: string };
  /** Что показывать в подписях */
  show: ShowOptions;
}

export type ArtViewMode = 'ancestors' | 'descendants' | 'full' | 'clan';

/** Что показывать в подписях людей на схеме (карточки и «Дерево») */
export interface ShowOptions {
  patronymic: boolean;
  surname: boolean;
  years: boolean;
  /** Супруг(а) маленьким кружком рядом и его имя в подписи */
  spouse: boolean;
  photo: boolean;
}
export const SHOW_KEYS: (keyof ShowOptions)[] = ['patronymic', 'surname', 'years', 'spouse', 'photo'];
const SHOW_DEFAULTS: ShowOptions = { patronymic: true, surname: true, years: true, spouse: true, photo: true };
export const ART_MODES: ArtViewMode[] = ['ancestors', 'descendants', 'full', 'clan'];

export const GEN_MIN = 1;
export const GEN_MAX = 12;
const DEFAULTS: ViewState = {
  mode: 'tree',
  chart: 'family',
  up: 3,
  down: 3,
  color: 'sex',
  minimap: true,
  horizontal: false,
  history: true,
  artMode: 'ancestors',
  artUp: 7,
  show: SHOW_DEFAULTS,
};

function load(): ViewState {
  try {
    const raw = JSON.parse(readSetting('view') ?? '{}') as Partial<ViewState>;
    const clamp = (n: unknown, d: number) =>
      typeof n === 'number' && Number.isInteger(n) ? Math.min(GEN_MAX, Math.max(GEN_MIN, n)) : d;
    return {
      mode: VIEW_MODES.find((m) => m === raw.mode) ?? DEFAULTS.mode,
      chart: CHART_KINDS.find((c) => c === raw.chart) ?? DEFAULTS.chart,
      up: clamp(raw.up, DEFAULTS.up),
      down: clamp(raw.down, DEFAULTS.down),
      color: (['sex', 'line', 'surname'] as const).find((c) => c === raw.color) ?? DEFAULTS.color,
      minimap: typeof raw.minimap === 'boolean' ? raw.minimap : DEFAULTS.minimap,
      horizontal: typeof raw.horizontal === 'boolean' ? raw.horizontal : DEFAULTS.horizontal,
      history: typeof raw.history === 'boolean' ? raw.history : DEFAULTS.history,
      artMode: ART_MODES.find((m) => m === raw.artMode) ?? DEFAULTS.artMode,
      artUp: clamp(raw.artUp, DEFAULTS.artUp),
      artDescRoot:
        raw.artDescRoot && typeof raw.artDescRoot.focus === 'string' && typeof raw.artDescRoot.root === 'string'
          ? { focus: raw.artDescRoot.focus, root: raw.artDescRoot.root }
          : undefined,
      show: Object.fromEntries(
        SHOW_KEYS.map((k) => [k, typeof raw.show?.[k] === 'boolean' ? raw.show[k] : SHOW_DEFAULTS[k]]),
      ) as unknown as ShowOptions,
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
