import { describe, expect, it } from 'vitest';
import { avatarGeometry, clampCrop, defaultCrop } from './images';

describe('обрезка фото для аватара', () => {
  it('по умолчанию: квадрат по меньшей стороне, по центру', () => {
    expect(defaultCrop(200, 100)).toEqual({ x: 0.25, y: 0, size: 1 });
    // Портрет: квадрат ближе к верху
    const c = defaultCrop(100, 200);
    expect(c.x).toBe(0);
    expect(c.y).toBeCloseTo(0.125);
  });

  it('квадрат не выходит за края', () => {
    expect(clampCrop({ x: 0.9, y: -1, size: 0.5 }, 200, 100)).toEqual({ x: 0.75, y: 0, size: 0.5 });
    expect(clampCrop({ x: 0, y: 0, size: 3 }, 100, 100).size).toBe(1);
  });

  it('выбранный квадрат ложится ровно в круг', () => {
    // Фото 200×100, квадрат 100×100 справа → в круге 50 px
    const g = avatarGeometry({ w: 200, h: 100, crop: { x: 0.5, y: 0, size: 1 } }, 50);
    expect(g).toEqual({ x: -50, y: -0, width: 100, height: 50 });
  });
});
