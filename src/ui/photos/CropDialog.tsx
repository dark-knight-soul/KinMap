import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clampCrop, defaultCrop } from '../../file/images';
import type { PersonPhoto, PhotoCrop } from '../../model/types';
import { Modal } from '../Modal';

const VIEW = 260;

// Выбор области для круглого аватара: перетащить фото, масштаб — ползунком.
export function CropDialog({
  photo,
  url,
  onSave,
  onClose,
}: {
  photo: PersonPhoto;
  url: string;
  onSave: (crop: PhotoCrop) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState<PhotoCrop>(() => clampCrop(photo.crop ?? defaultCrop(photo.w, photo.h), photo.w, photo.h));
  const drag = useRef<{ x: number; y: number; crop: PhotoCrop } | null>(null);

  const sidePx = crop.size * Math.min(photo.w, photo.h);
  const scale = VIEW / sidePx;

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, crop };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // Тянем фото: квадрат обрезки сдвигается в обратную сторону
    const dx = (e.clientX - d.x) / scale / photo.w;
    const dy = (e.clientY - d.y) / scale / photo.h;
    setCrop(clampCrop({ ...d.crop, x: d.crop.x - dx, y: d.crop.y - dy }, photo.w, photo.h));
  };

  const setZoom = (zoom: number) => {
    // Масштаб меняем вокруг центра квадрата
    const oldSide = crop.size * Math.min(photo.w, photo.h);
    const size = 1 / zoom;
    const newSide = size * Math.min(photo.w, photo.h);
    const cx = crop.x * photo.w + oldSide / 2;
    const cy = crop.y * photo.h + oldSide / 2;
    setCrop(clampCrop({ size, x: (cx - newSide / 2) / photo.w, y: (cy - newSide / 2) / photo.h }, photo.w, photo.h));
  };

  return (
    <Modal
      title={t('photos.cropTitle')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => onSave(crop)} data-autofocus>
            {t('common.save')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('photos.cropHint')}</p>
      <div
        className="crop-view"
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img
          src={url}
          alt=""
          draggable={false}
          style={{
            width: photo.w * scale,
            height: photo.h * scale,
            transform: `translate(${-crop.x * photo.w * scale}px, ${-crop.y * photo.h * scale}px)`,
          }}
        />
        <div className="crop-circle" />
      </div>
      <label className="field">
        <span>{t('photos.zoom')}</span>
        <input
          type="range"
          min={1}
          max={5}
          step={0.05}
          value={1 / crop.size}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
    </Modal>
  );
}
