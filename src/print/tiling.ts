import type { DateLocale } from '../model/dates';
// Геометрия печати (всё в миллиметрах).
//
// Склеиваемые листы. Принтер не печатает у самого края, поэтому у каждого листа
// поле MARGIN. Соседние листы перекрываются на полосу GLUE: правая (нижняя) полоса
// листа повторяет начало следующего. При сборке у следующего листа отрезают поле
// по пунктиру и кладут его на полосу «клей» предыдущего, совмещая метки «+».
//
//   лист 1: | поле | ......содержимое...... [клей] | поле |
//   лист 2:                          | поле | [то же] ......содержимое...... |
//
// Шаг между листами = ширина содержимого − полоса склейки.

export type PaperName = 'A4' | 'A3' | 'A2' | 'A1' | 'A0';
export type Orientation = 'portrait' | 'landscape';

export const PAPER: Record<PaperName, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

/** Поле, которое принтеры обычно не пропечатывают */
export const MARGIN = 10;
/** Полоса для склейки */
export const GLUE = 15;
/** Отступ вокруг схемы, в единицах схемы */
export const PADDING = 24;

export interface ChartSize {
  /** Размер схемы в её единицах (карточка — 180) */
  width: number;
  height: number;
}

export function paperSize(paper: PaperName, orientation: Orientation): [number, number] {
  const [w, h] = PAPER[paper];
  return orientation === 'portrait' ? [w, h] : [h, w];
}

// Буквы рядов: «А-1», «Б-3»… (без Ё, Й, Ъ, Ы, Ь — их легко спутать)
const ROW_LETTERS: Record<DateLocale, string> = {
  ru: 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЭЮЯ',
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  uz: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
};

export function rowLabel(row: number, lang: DateLocale): string {
  const letters = ROW_LETTERS[lang];
  let s = '';
  let n = row;
  do {
    s = letters[n % letters.length] + s;
    n = Math.floor(n / letters.length) - 1;
  } while (n >= 0);
  return s;
}

export interface Tile {
  row: number;
  col: number;
  label: string;
  /** Где на «плакате» начинается содержимое этого листа (мм) */
  x: number;
  y: number;
  /** Есть ли сосед справа / снизу (тогда у листа полоса для клея) */
  glueRight: boolean;
  glueBottom: boolean;
  /** Есть ли сосед слева / сверху (тогда поле этого листа отрезается) */
  cutLeft: boolean;
  cutTop: boolean;
}

export interface TilePlan {
  sheetW: number;
  sheetH: number;
  orientation: Orientation;
  /** Размер области печати на листе */
  contentW: number;
  contentH: number;
  stepX: number;
  stepY: number;
  cols: number;
  rows: number;
  /** мм на единицу схемы */
  scale: number;
  /** Размер собранного плаката (мм) */
  posterW: number;
  posterH: number;
  tiles: Tile[];
}

function planFor(chart: ChartSize, paper: PaperName, orientation: Orientation, sheetsAcross: number, lang: DateLocale): TilePlan {
  const [sheetW, sheetH] = paperSize(paper, orientation);
  const contentW = sheetW - 2 * MARGIN;
  const contentH = sheetH - 2 * MARGIN;
  const stepX = contentW - GLUE;
  const stepY = contentH - GLUE;
  const cols = Math.max(1, Math.round(sheetsAcross));
  const fullW = chart.width + 2 * PADDING;
  const fullH = chart.height + 2 * PADDING;
  // Ширина плаката: (cols − 1) шагов + последний лист целиком
  const posterW = (cols - 1) * stepX + contentW;
  const scale = posterW / fullW;
  const needH = fullH * scale;
  const rows = Math.max(1, Math.ceil((needH - contentH) / stepY - 1e-9) + 1);
  const posterH = (rows - 1) * stepY + contentH;

  const tiles: Tile[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tiles.push({
        row: r,
        col: c,
        label: `${rowLabel(r, lang)}-${c + 1}`,
        x: c * stepX,
        y: r * stepY,
        glueRight: c < cols - 1,
        glueBottom: r < rows - 1,
        cutLeft: c > 0,
        cutTop: r > 0,
      });
    }
  }
  return { sheetW, sheetH, orientation, contentW, contentH, stepX, stepY, cols, rows, scale, posterW, posterH, tiles };
}

/**
 * План склейки: бумага, ориентация (или «авто» — где листов меньше), сколько листов в ширину.
 */
export function planTiles(
  chart: ChartSize,
  paper: PaperName,
  orientation: Orientation | 'auto',
  sheetsAcross: number,
  lang: DateLocale = 'ru',
): TilePlan {
  if (orientation !== 'auto') return planFor(chart, paper, orientation, sheetsAcross, lang);
  const p = planFor(chart, paper, 'portrait', sheetsAcross, lang);
  const l = planFor(chart, paper, 'landscape', sheetsAcross, lang);
  // Меньше листов; при равенстве — крупнее масштаб
  const sheets = (x: TilePlan) => x.tiles.length;
  if (sheets(p) !== sheets(l)) return sheets(p) < sheets(l) ? p : l;
  return p.scale >= l.scale ? p : l;
}

export interface SinglePlan {
  pageW: number;
  pageH: number;
  scale: number;
  /** Смещение схемы на листе, чтобы она стояла по центру */
  offsetX: number;
  offsetY: number;
}

/** Масштаб «плаката по размеру древа»: карточка ≈ 45 мм */
export const NATURAL_SCALE = 0.25;

/**
 * Один лист: заданного формата (схема вписывается, ориентация — по форме схемы)
 * или «по размеру древа» (лист любого размера, масштаб NATURAL_SCALE).
 */
export function planSingle(chart: ChartSize, paper: PaperName | 'fit'): SinglePlan {
  const fullW = chart.width + 2 * PADDING;
  const fullH = chart.height + 2 * PADDING;
  if (paper === 'fit') {
    const pageW = fullW * NATURAL_SCALE + 2 * MARGIN;
    const pageH = fullH * NATURAL_SCALE + 2 * MARGIN;
    return { pageW, pageH, scale: NATURAL_SCALE, offsetX: MARGIN, offsetY: MARGIN };
  }
  const landscape = fullW > fullH;
  const [pageW, pageH] = paperSize(paper, landscape ? 'landscape' : 'portrait');
  const scale = Math.min((pageW - 2 * MARGIN) / fullW, (pageH - 2 * MARGIN) / fullH);
  return {
    pageW,
    pageH,
    scale,
    offsetX: (pageW - fullW * scale) / 2,
    offsetY: (pageH - fullH * scale) / 2,
  };
}

/** Высота текста имени на бумаге (мм) — чтобы предупредить, если будет нечитаемо */
export const NAME_FONT_UNITS = 14;
export const textHeightMm = (scale: number) => NAME_FONT_UNITS * scale * 0.7;
export const MIN_READABLE_MM = 1.8;
