import { describe, expect, it } from 'vitest';
import { GLUE, MARGIN, PADDING, planSingle, planTiles, rowLabel, textHeightMm } from './tiling';

const chart = { width: 3000, height: 1200 };

describe('склеиваемые листы', () => {
  it('A4 альбомная, 4 листа в ширину: размеры, шаг, перекрытие', () => {
    const p = planTiles(chart, 'A4', 'landscape', 4);
    expect([p.sheetW, p.sheetH]).toEqual([297, 210]);
    expect(p.contentW).toBe(297 - 2 * MARGIN);
    expect(p.stepX).toBe(p.contentW - GLUE);
    expect(p.cols).toBe(4);
    // Плакат по ширине = 3 шага + полный последний лист
    expect(p.posterW).toBeCloseTo(3 * p.stepX + p.contentW);
    expect(p.scale).toBeCloseTo(p.posterW / (chart.width + 2 * PADDING));
    expect(p.tiles).toHaveLength(p.cols * p.rows);
  });

  it('плакат целиком покрывает схему, лишнего ряда нет', () => {
    for (const across of [1, 2, 3, 5, 8]) {
      const p = planTiles(chart, 'A3', 'portrait', across);
      const need = (chart.height + 2 * PADDING) * p.scale;
      expect(p.posterH).toBeGreaterThanOrEqual(need - 1e-6);
      if (p.rows > 1) expect(p.posterH - p.stepY).toBeLessThan(need);
    }
  });

  it('соседние листы перекрываются ровно на полосу склейки', () => {
    const p = planTiles(chart, 'A4', 'portrait', 3);
    const a = p.tiles.find((t) => t.row === 0 && t.col === 0)!;
    const b = p.tiles.find((t) => t.row === 0 && t.col === 1)!;
    expect(a.x + p.contentW - b.x).toBeCloseTo(GLUE);
    expect(a.glueRight && !a.cutLeft).toBe(true);
    expect(b.cutLeft).toBe(true);
    const last = p.tiles[p.tiles.length - 1]!;
    expect(last.glueRight || last.glueBottom).toBe(false);
  });

  it('«авто» выбирает ориентацию, где листов меньше', () => {
    const wide = { width: 4000, height: 600 };
    const auto = planTiles(wide, 'A4', 'auto', 4);
    const p = planTiles(wide, 'A4', 'portrait', 4);
    const l = planTiles(wide, 'A4', 'landscape', 4);
    expect(auto.tiles.length).toBe(Math.min(p.tiles.length, l.tiles.length));
  });

  it('подписи листов: А-1, Б-3; после Я — АА', () => {
    const p = planTiles({ width: 3000, height: 4000 }, 'A4', 'portrait', 3);
    expect(p.tiles[0]!.label).toBe('А-1');
    expect(p.tiles.find((t) => t.row === 1 && t.col === 2)!.label).toBe('Б-3');
    expect(rowLabel(27, 'ru')).toBe('АА');
    expect(rowLabel(1, 'en')).toBe('B');
  });
});

describe('один лист', () => {
  it('A3: схема вписывается, по центру, ориентация по форме', () => {
    const p = planSingle(chart, 'A3');
    expect([p.pageW, p.pageH]).toEqual([420, 297]);
    const w = (chart.width + 2 * PADDING) * p.scale;
    const h = (chart.height + 2 * PADDING) * p.scale;
    expect(w).toBeLessThanOrEqual(420 - 2 * MARGIN + 1e-6);
    expect(h).toBeLessThanOrEqual(297 - 2 * MARGIN + 1e-6);
    expect(p.offsetX * 2 + w).toBeCloseTo(420);
  });

  it('«по размеру древа»: карточка около 45 мм', () => {
    const p = planSingle(chart, 'fit');
    expect(180 * p.scale).toBeCloseTo(45);
  });

  it('предупреждение о мелком тексте', () => {
    expect(textHeightMm(0.1)).toBeLessThan(1.8);
    expect(textHeightMm(0.25)).toBeGreaterThan(1.8);
  });
});
