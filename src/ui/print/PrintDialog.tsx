import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CARD_H, CARD_W } from '../../layout/types';
import {
  MIN_READABLE_MM,
  PADDING,
  planSingle,
  planTiles,
  textHeightMm,
  type Orientation,
  type PaperName,
} from '../../print/tiling';
import { useApp } from '../../state/store';
import { useView, ROTATABLE } from '../../state/view';
import { useDateLocale } from '../format';
import { Modal } from '../Modal';
import { computeLayout, type Computed } from '../tree/TreeChart';
import { RulerPage, SchemePage, SinglePage, TilePage } from './PrintPages';

// Печать и PDF. Печатается текущая схема (вид, центр, поколения — как на экране).
// Два режима: склеиваемые листы A4/A3 и один лист (A4…A0 или «по размеру древа»).
// Печать идёт через окно браузера: там можно выбрать принтер или «Сохранить как PDF».

type Mode = 'tiles' | 'single';
const PAPERS: PaperName[] = ['A4', 'A3', 'A2', 'A1', 'A0'];

export function PrintDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useDateLocale();
  const tree = useApp((s) => s.session!.history.present);
  const focusId = useApp((s) => s.session!.focusId);
  const view = useView();
  const focus = focusId && tree.people[focusId] ? focusId : tree.rootPersonId;

  const [mode, setMode] = useState<Mode>('tiles');
  const [paper, setPaper] = useState<'A4' | 'A3'>('A4');
  const [orientation, setOrientation] = useState<Orientation | 'auto'>('auto');
  const [across, setAcross] = useState(3);
  const [singlePaper, setSinglePaper] = useState<PaperName | 'fit'>('A3');
  const [withScheme, setWithScheme] = useState(true);
  const [withRuler, setWithRuler] = useState(true);
  const [printing, setPrinting] = useState(false);

  const computed = useMemo(
    () => (focus ? computeLayout(tree, view.chart, focus, view.up, view.down, view.horizontal && ROTATABLE.includes(view.chart)) : null),
    [tree, focus, view.chart, view.up, view.down, view.horizontal],
  );
  if (!computed) return null;
  const size = { width: computed.bounds.maxX - computed.bounds.minX, height: computed.bounds.maxY - computed.bounds.minY };
  const tiles = planTiles(size, paper, orientation, across, lang);
  const single = planSingle(size, singlePaper);
  const scale = mode === 'tiles' ? tiles.scale : single.scale;
  const tooSmall = textHeightMm(scale) < MIN_READABLE_MM;
  const title = tree.name;

  return (
    <Modal
      title={t('print.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setPrinting(true)} data-autofocus>
            {t('print.print')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('print.hint', { chart: t(`chart.${view.chart}`) })}</p>

      <div className="segmented" role="tablist">
        {(['tiles', 'single'] as const).map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
            {t(`print.mode.${m}`)}
          </button>
        ))}
      </div>

      {mode === 'tiles' ? (
        <div className="form-grid">
          <label className="field">
            <span>{t('print.paper')}</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value as 'A4' | 'A3')}>
              <option value="A4">A4 (21 × 29,7 см)</option>
              <option value="A3">A3 (29,7 × 42 см)</option>
            </select>
          </label>
          <label className="field">
            <span>{t('print.orientation')}</span>
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation | 'auto')}>
              <option value="auto">{t('print.orientAuto')}</option>
              <option value="portrait">{t('print.portrait')}</option>
              <option value="landscape">{t('print.landscape')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('print.across')}</span>
            <input
              type="number"
              min={1}
              max={30}
              value={across}
              onChange={(e) => setAcross(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
        </div>
      ) : (
        <label className="field">
          <span>{t('print.paper')}</span>
          <select value={singlePaper} onChange={(e) => setSinglePaper(e.target.value as PaperName | 'fit')}>
            {PAPERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value="fit">{t('print.fit')}</option>
          </select>
        </label>
      )}

      <div className="print-summary">
        {mode === 'tiles' ? (
          <strong>
            {t('print.tilesSummary', {
              rows: tiles.rows,
              cols: tiles.cols,
              total: tiles.tiles.length,
              w: Math.round(tiles.posterW / 10),
              h: Math.round(tiles.posterH / 10),
            })}
          </strong>
        ) : (
          <strong>
            {t('print.singleSummary', { w: Math.round(single.pageW / 10), h: Math.round(single.pageH / 10) })}
          </strong>
        )}
        <span className="muted small"> · {t('print.cardSize', { mm: Math.round(CARD_W * scale) })}</span>
        {tooSmall && <p className="error-text small">{t('print.tooSmall')}</p>}
      </div>

      <PosterPreview computed={computed} mode={mode} tilesPlan={tiles} />

      {mode === 'tiles' && (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={withScheme} onChange={(e) => setWithScheme(e.target.checked)} />
            <span>{t('print.withScheme')}</span>
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={withRuler} onChange={(e) => setWithRuler(e.target.checked)} />
            <span>{t('print.withRuler')}</span>
          </label>
        </>
      )}
      <p className="muted small">{t('print.browserHint')}</p>

      {printing && (
        <PrintRoot
          pageW={mode === 'tiles' ? tiles.sheetW : single.pageW}
          pageH={mode === 'tiles' ? tiles.sheetH : single.pageH}
          onDone={() => setPrinting(false)}
        >
          {mode === 'tiles' ? (
            <>
              {withScheme && <SchemePage plan={tiles} computed={computed} title={title} />}
              {withRuler && <RulerPage w={tiles.sheetW} h={tiles.sheetH} />}
              {tiles.tiles.map((tile) => (
                <TilePage key={tile.label} tree={tree} computed={computed} plan={tiles} tile={tile} title={title} />
              ))}
            </>
          ) : (
            <SinglePage tree={tree} computed={computed} plan={single} title={title} />
          )}
        </PrintRoot>
      )}
    </Modal>
  );
}

/** Мини-плакат: силуэт схемы и сетка листов */
function PosterPreview({ computed, mode, tilesPlan }: { computed: Computed; mode: Mode; tilesPlan: ReturnType<typeof planTiles> }) {
  const b = computed.bounds;
  const w = b.maxX - b.minX + 2 * PADDING;
  const h = b.maxY - b.minY + 2 * PADDING;
  const s = tilesPlan.scale;
  return (
    <svg className="poster-preview" viewBox={`0 0 ${mode === 'tiles' ? tilesPlan.posterW / s : w} ${mode === 'tiles' ? tilesPlan.posterH / s : h}`}>
      <g transform={`translate(${PADDING - b.minX} ${PADDING - b.minY})`}>
        {computed.kind === 'cards' ? (
          computed.chart.cards.map((c) => <rect key={c.key} x={c.x} y={c.y} width={CARD_W} height={CARD_H} rx={10} className="scheme-card" />)
        ) : computed.kind === 'art' ? (
          computed.art.nodes.map((n) => <circle key={n.key} cx={n.x} cy={n.y} r={n.r} className="scheme-card" />)
        ) : computed.fan.full ? (
          <circle r={computed.fan.radius} className="scheme-card" />
        ) : (
          <path d={`M ${-computed.fan.radius} 0 A ${computed.fan.radius} ${computed.fan.radius} 0 0 1 ${computed.fan.radius} 0 Z`} className="scheme-card" />
        )}
      </g>
      {mode === 'tiles' &&
        tilesPlan.tiles.map((tile) => (
          <g key={tile.label}>
            <rect x={tile.x / s} y={tile.y / s} width={tilesPlan.contentW / s} height={tilesPlan.contentH / s} className="scheme-tile" />
            <text x={(tile.x + tilesPlan.contentW / 2) / s} y={(tile.y + tilesPlan.contentH / 2) / s} className="scheme-label" style={{ fontSize: Math.min(tilesPlan.contentW, tilesPlan.contentH) / s / 5 }}>
              {tile.label}
            </text>
          </g>
        ))}
    </svg>
  );
}

/**
 * Страницы для печати выводятся вне приложения (в конце body) и видны только при печати.
 * Размер листа задаётся правилом @page; после печати всё убирается.
 */
export function PrintRoot({
  pageW,
  pageH,
  margin = 0,
  pageCss = '',
  onDone,
  children,
}: {
  pageW: number;
  pageH: number;
  /** Поля страницы, мм (для схемы — 0: поля нарисованы внутри листа) */
  margin?: number;
  /** Дополнительные правила для печати (например, номера страниц) */
  pageCss?: string;
  onDone: () => void;
  children: React.ReactNode;
}) {
  const [host] = useState(() => {
    const el = document.createElement('div');
    el.id = 'km-print';
    return el;
  });
  // onDone в ссылке: иначе новая функция при каждой перерисовке перезапускала бы печать
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    document.body.append(host);
    const style = document.createElement('style');
    style.id = 'km-print-page';
    style.textContent = `@page { size: ${pageW.toFixed(1)}mm ${pageH.toFixed(1)}mm; margin: ${margin}mm; } ${pageCss}`;
    document.head.append(style);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      doneRef.current();
    };
    window.addEventListener('afterprint', finish);
    // Даём браузеру дорисовать страницы и загрузить фото, затем открываем окно печати
    const timer = setTimeout(() => {
      window.print();
      // В Chrome print() ждёт закрытия окна; в других браузерах сработает afterprint
      setTimeout(finish, 500);
    }, 400);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
      style.remove();
      host.remove();
    };
  }, [host, pageW, pageH, margin, pageCss]);

  return createPortal(children, host);
}
