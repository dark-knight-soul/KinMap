import { useSyncExternalStore } from 'react';

// Мелкое общее состояние интерфейса: открыта ли справка, меню у карточки и т.п.
// Отдельно от данных древа — не попадает в историю отмены и в файл.

export interface ContextMenuState {
  personId: string;
  /** Координаты на экране */
  x: number;
  y: number;
}

interface UiState {
  helpOpen: boolean;
  contextMenu: ContextMenuState | null;
}

let ui: UiState = { helpOpen: false, contextMenu: null };
const listeners = new Set<() => void>();

function set(patch: Partial<UiState>): void {
  ui = { ...ui, ...patch };
  listeners.forEach((l) => l());
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(ui),
  );
}

export const openHelp = () => set({ helpOpen: true });
export const closeHelp = () => set({ helpOpen: false });
export const openContextMenu = (m: ContextMenuState) => set({ contextMenu: m });
export const closeContextMenu = () => set({ contextMenu: null });
