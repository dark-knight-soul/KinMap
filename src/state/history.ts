// История изменений для отмены (Ctrl+Z) и повтора (Ctrl+Y).
// Хранит прошлые и «отменённые» состояния древа. Состояния неизменяемые,
// общие части переиспользуются — поэтому 200 шагов почти не занимают память.
//
// «Склейка»: пока человек печатает в одном поле, каждое нажатие клавиши — изменение,
// но отменять их по одной букве неудобно. Изменения с одинаковым ключом,
// идущие чаще чем раз в COALESCE_MS, становятся одним шагом отмены.

export const HISTORY_LIMIT = 200;
export const COALESCE_MS = 1500;

export interface History<T> {
  present: T;
  past: T[];
  future: T[];
  lastKey?: string;
  lastAt: number;
}

export function initHistory<T>(present: T): History<T> {
  return { present, past: [], future: [], lastAt: 0 };
}

export function pushHistory<T>(h: History<T>, next: T, coalesceKey?: string, now = Date.now()): History<T> {
  const coalesce = coalesceKey !== undefined && coalesceKey === h.lastKey && now - h.lastAt < COALESCE_MS;
  const past = coalesce ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
  return { present: next, past, future: [], lastKey: coalesceKey, lastAt: now };
}

export function undoHistory<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { present: prev, past: h.past.slice(0, -1), future: [h.present, ...h.future], lastAt: 0 };
}

export function redoHistory<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { present: next, past: [...h.past, h.present], future: rest, lastAt: 0 };
}
