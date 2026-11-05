import type { PersonId } from '../model/types';

// Размеры карточек и отступы схемы (в «единицах схемы», при масштабе 1 — пиксели).
export const CARD_W = 180;
export const CARD_H = 72;
/** Между соседними ветками */
export const H_GAP = 28;
/** Между супругами */
export const COUPLE_GAP = 20;
/** Между поколениями */
export const V_GAP = 64;
export const ROW = CARD_H + V_GAP;

export type CardRole = 'main' | 'spouse' | 'sibling' | 'halfSibling';

/** Карточка человека на схеме (x, y — левый верхний угол) */
export interface CardBox {
  key: string;
  personId: PersonId;
  x: number;
  y: number;
  role: CardRole;
  /** Человек уже нарисован в другом месте схемы — эта карточка-«ссылка» (пунктир) */
  duplicate?: boolean;
  /** Есть родители / дети, не показанные из-за ограничения поколений */
  moreAbove?: boolean;
  moreBelow?: boolean;
}

/** Линия связи — ломаная из точек */
export interface LinkLine {
  key: string;
  points: [number, number][];
  /** Пунктир: развод, приёмный ребёнок, единокровные братья/сёстры */
  dashed?: boolean;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ChartLayout {
  cards: CardBox[];
  lines: LinkLine[];
  bounds: Bounds;
}

export function boundsOf(cards: CardBox[]): Bounds {
  if (!cards.length) return { minX: 0, minY: 0, maxX: CARD_W, maxY: CARD_H };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cards) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + CARD_W);
    maxY = Math.max(maxY, c.y + CARD_H);
  }
  return { minX, minY, maxX, maxY };
}
