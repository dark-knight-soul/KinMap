import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Bounds } from '../../layout/types';

// Холст с перемещением и масштабом (без внешних библиотек):
//  - тянуть мышью / пальцем — двигать схему;
//  - колесо — масштаб вокруг курсора; два пальца — щипок;
//  - клавиши: + − 0 (вписать) и стрелки, когда холст в фокусе.
// Содержимое рисуется функцией children(viewport) — ей передаётся видимая область
// в координатах схемы, чтобы рисовать только то, что видно.

export interface Viewport {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  scale: number;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

export interface CenterRequest {
  x: number;
  y: number;
  /** Меняется при каждом запросе — по нему понимаем, что нужно центрировать снова */
  seq: string;
}

const MIN_K = 0.1;
const MAX_K = 2.5;
const DRAG_THRESHOLD = 5;
/** Запас вокруг экрана, чтобы при перемещении края не «мигали» */
const CULL_MARGIN = 300;

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export function PanZoom({
  bounds,
  center,
  children,
  label,
}: {
  bounds: Bounds;
  center: CenterRequest | null;
  children: (vp: Viewport) => ReactNode;
  label: string;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  // Пока настоящий размер холста не измерен, центрировать бессмысленно
  const [measured, setMeasured] = useState(false);
  const [tf, setTf] = useState<Transform>({ x: 400, y: 300, k: 1 });

  // Размер холста
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (!el.clientWidth || !el.clientHeight) return;
      setSize({ w: el.clientWidth, h: el.clientHeight });
      setMeasured(true);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Центрирование по запросу (смена центра схемы или вида)
  const lastSeq = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!measured || !center || center.seq === lastSeq.current) return;
    const first = lastSeq.current === null;
    lastSeq.current = center.seq;
    setTf((cur) => {
      // В первый раз подбираем масштаб, чтобы влезло побольше (но не мельче 50%)
      const k = first
        ? Math.min(1, Math.max(0.5, Math.min(size.w / (bounds.maxX - bounds.minX + 80), size.h / (bounds.maxY - bounds.minY + 80))))
        : cur.k;
      return { x: size.w / 2 - center.x * k, y: size.h / 2 - center.y * k, k };
    });
  }, [center, size.w, size.h, measured, bounds]);

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setTf((cur) => {
      const k = clampK(cur.k * factor);
      const f = k / cur.k;
      return { k, x: px - (px - cur.x) * f, y: py - (py - cur.y) * f };
    });
  }, []);

  const fit = useCallback(() => {
    const bw = bounds.maxX - bounds.minX + 80;
    const bh = bounds.maxY - bounds.minY + 80;
    const k = clampK(Math.min(size.w / bw, size.h / bh, 1));
    setTf({
      k,
      x: size.w / 2 - ((bounds.minX + bounds.maxX) / 2) * k,
      y: size.h / 2 - ((bounds.minY + bounds.maxY) / 2) * k,
    });
  }, [bounds, size]);

  // Колесо: слушатель «не пассивный», иначе нельзя отменить прокрутку страницы
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      // Тачпад с зажатым Ctrl даёт мелкие шаги — масштабируем плавно
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  // Перетаскивание и щипок
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startX: number; startY: number; dragging: boolean; pinchDist?: number } | null>(null);
  const suppressClick = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: e.clientX, startY: e.clientY, dragging: false };
      suppressClick.current = false;
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startX: 0, startY: 0, dragging: true, pinchDist: Math.hypot(a!.x - b!.x, a!.y - b!.y) };
      suppressClick.current = true;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    const g = gesture.current;
    if (!prev || !g) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && g.pinchDist) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const r = ref.current!.getBoundingClientRect();
      zoomAt(dist / g.pinchDist, (a!.x + b!.x) / 2 - r.left, (a!.y + b!.y) / 2 - r.top);
      g.pinchDist = dist;
      return;
    }

    if (!g.dragging && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD) {
      g.dragging = true;
      suppressClick.current = true;
      // Захват указателя только когда точно тянем — иначе клик по карточке не дойдёт
      ref.current?.setPointerCapture(e.pointerId);
    }
    if (g.dragging) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setTf((cur) => ({ ...cur, x: cur.x + dx, y: cur.y + dy }));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) gesture.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const STEP = 80;
    const cx = size.w / 2;
    const cy = size.h / 2;
    switch (e.key) {
      case '+':
      case '=':
        zoomAt(1.25, cx, cy);
        break;
      case '-':
        zoomAt(0.8, cx, cy);
        break;
      case '0':
        fit();
        break;
      case 'ArrowLeft':
        setTf((c) => ({ ...c, x: c.x + STEP }));
        break;
      case 'ArrowRight':
        setTf((c) => ({ ...c, x: c.x - STEP }));
        break;
      case 'ArrowUp':
        setTf((c) => ({ ...c, y: c.y + STEP }));
        break;
      case 'ArrowDown':
        setTf((c) => ({ ...c, y: c.y - STEP }));
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const viewport: Viewport = {
    minX: (-tf.x - CULL_MARGIN) / tf.k,
    minY: (-tf.y - CULL_MARGIN) / tf.k,
    maxX: (size.w - tf.x + CULL_MARGIN) / tf.k,
    maxY: (size.h - tf.y + CULL_MARGIN) / tf.k,
    scale: tf.k,
  };

  return (
    <div
      ref={ref}
      className="canvas"
      tabIndex={0}
      role="application"
      aria-label={label}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(e) => {
        // После перетаскивания клик не должен выбирать карточку
        if (suppressClick.current) {
          e.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onKeyDown={onKeyDown}
    >
      <svg className="canvas-svg" width={size.w} height={size.h}>
        <g transform={`translate(${tf.x} ${tf.y}) scale(${tf.k})`}>{children(viewport)}</g>
      </svg>
      <div className="zoom-controls" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} title={t('zoom.in')} aria-label={t('zoom.in')}>
          +
        </button>
        <button type="button" className="icon-btn" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} title={t('zoom.out')} aria-label={t('zoom.out')}>
          −
        </button>
        <button type="button" className="icon-btn" onClick={fit} title={t('zoom.fit')} aria-label={t('zoom.fit')}>
          ⤢
        </button>
        <span className="zoom-level">{Math.round(tf.k * 100)}%</span>
      </div>
    </div>
  );
}
