import { randomId } from '../model/ids';
import type { PersonPhoto, PhotoCrop } from '../model/types';

// Фотографии: сжатие при добавлении и геометрия круглого аватара.
//
// Сжатие: длинная сторона до 1280 px, WebP (или JPEG, если браузер не умеет WebP) —
// обычно 100–250 КБ вместо нескольких мегабайт. Перерисовка через canvas заодно
// убирает EXIF-метаданные, в том числе GPS-координаты места съёмки — это защита приватности.

export const MAX_SIDE = 1280;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export type ImageErrorCode = 'notImage' | 'unsupported' | 'tooBig';

export class ImageError extends Error {
  constructor(public code: ImageErrorCode) {
    super(code);
    this.name = 'ImageError';
  }
}

export interface CompressedImage {
  bytes: Uint8Array;
  photo: PersonPhoto;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(file: Blob): Promise<CompressedImage> {
  if (file.type && !file.type.startsWith('image/')) throw new ImageError('notImage');
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('tooBig');

  let bitmap: ImageBitmap;
  try {
    // Поворот по EXIF (фото с телефона «на боку») учитывается здесь
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // Например, HEIC с iPhone в Chrome/Firefox не открывается
    throw new ImageError('unsupported');
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('unsupported');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', 0.82);
  // Старый Safari вместо WebP молча отдаёт PNG — тогда используем JPEG
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new ImageError('unsupported');

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    photo: { id: randomId('ph'), mime: blob.type, w, h, crop: defaultCrop(w, h) },
  };
}

/** Обрезка по умолчанию: самый большой квадрат, по ширине — по центру, по высоте — ближе к верху (там обычно лицо) */
export function defaultCrop(w: number, h: number): PhotoCrop {
  const s = Math.min(w, h);
  return { x: (w - s) / 2 / w, y: ((h - s) * 0.25) / h, size: 1 };
}

/** Поправить обрезку, чтобы квадрат не выходил за края фото */
export function clampCrop(crop: PhotoCrop, w: number, h: number): PhotoCrop {
  const size = Math.min(1, Math.max(0.05, crop.size));
  const sidePx = size * Math.min(w, h);
  const maxX = 1 - sidePx / w;
  const maxY = 1 - sidePx / h;
  return {
    size,
    x: Math.min(Math.max(0, crop.x), Math.max(0, maxX)),
    y: Math.min(Math.max(0, crop.y), Math.max(0, maxY)),
  };
}

/**
 * Где нарисовать всё фото, чтобы выбранный квадрат лёг ровно в круг диаметром d
 * (с началом в 0,0). Возвращает координаты и размер для <image>.
 */
export function avatarGeometry(photo: Pick<PersonPhoto, 'w' | 'h' | 'crop'>, d: number) {
  const crop = clampCrop(photo.crop ?? defaultCrop(photo.w, photo.h), photo.w, photo.h);
  const sidePx = crop.size * Math.min(photo.w, photo.h);
  const s = d / sidePx;
  return { x: -crop.x * photo.w * s, y: -crop.y * photo.h * s, width: photo.w * s, height: photo.h * s };
}
