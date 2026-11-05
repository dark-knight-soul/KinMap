import { useTranslation } from 'react-i18next';
import { CARD_H, CARD_W, type Bounds } from '../../layout/types';
import type { TreeData } from '../../model/types';
import { GLUE, MARGIN, PADDING, type SinglePlan, type Tile, type TilePlan } from '../../print/tiling';
import { CardsContent, FanContent, type Computed } from '../tree/TreeChart';

// Страницы для печати. Каждая — SVG размером с лист в миллиметрах (viewBox в мм),
// внутри — та же схема, что на экране (векторная: текст остаётся текстом).

/** Схема, сдвинутая так, что её левый верхний угол (с отступом) — в точке 0,0 */
function ChartGroup({
  tree,
  computed,
  region,
}: {
  tree: TreeData;
  computed: Computed;
  /** Видимая часть схемы в её единицах — рисуем только её (для больших древ) */
  region: Bounds;
}) {
  const b = computed.bounds;
  return (
    <g transform={`translate(${PADDING - b.minX} ${PADDING - b.minY})`}>
      {computed.kind === 'fan' ? (
        <FanContent tree={tree} fan={computed.fan} />
      ) : (
        <CardsContent tree={tree} chart={computed.chart} vp={{ ...region, scale: 1 }} focusId="" print />
      )}
    </g>
  );
}

function Page({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <section className="print-page" style={{ width: `${w}mm`, height: `${h}mm` }}>
      <svg width={`${w}mm`} height={`${h}mm`} viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg">
        {children}
      </svg>
    </section>
  );
}

/** Один лист склейки */
export function TilePage({ tree, computed, plan, tile, title }: { tree: TreeData; computed: Computed; plan: TilePlan; tile: Tile; title: string }) {
  const { t } = useTranslation();
  const { sheetW: W, sheetH: H, contentW: cw, contentH: ch, scale: s } = plan;
  const b = computed.bounds;
  // Какая часть схемы попадает на этот лист (в единицах схемы, с запасом)
  const region: Bounds = {
    minX: b.minX - PADDING + tile.x / s - CARD_W,
    minY: b.minY - PADDING + tile.y / s - CARD_H,
    maxX: b.minX - PADDING + (tile.x + cw) / s + CARD_W,
    maxY: b.minY - PADDING + (tile.y + ch) / s + CARD_H,
  };
  const clipId = `km-clip-${tile.row}-${tile.col}`;
  const mark = (x: number, y: number, key: string) => (
    <g key={key} className="reg-mark">
      <line x1={x - 4} y1={y} x2={x + 4} y2={y} />
      <line x1={x} y1={y - 4} x2={x} y2={y + 4} />
      <circle cx={x} cy={y} r={1.6} />
    </g>
  );
  const glueX = MARGIN + cw - GLUE;
  const glueY = MARGIN + ch - GLUE;

  return (
    <Page w={W} h={H}>
      <clipPath id={clipId}>
        <rect x={MARGIN} y={MARGIN} width={cw} height={ch} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${MARGIN - tile.x} ${MARGIN - tile.y}) scale(${s})`}>
          <ChartGroup tree={tree} computed={computed} region={region} />
        </g>
      </g>

      {/* Полосы для клея — их закроет соседний лист */}
      {tile.glueRight && (
        <g className="glue">
          <rect x={glueX} y={MARGIN} width={GLUE} height={ch} />
          <text x={glueX + GLUE / 2} y={MARGIN + ch / 2} transform={`rotate(90 ${glueX + GLUE / 2} ${MARGIN + ch / 2})`}>
            {t('print.glue')} · {tile.label}
          </text>
        </g>
      )}
      {tile.glueBottom && (
        <g className="glue">
          <rect x={MARGIN} y={glueY} width={cw} height={GLUE} />
          <text x={MARGIN + cw / 2} y={glueY + GLUE / 2 + 1.5}>
            {t('print.glue')} · {tile.label}
          </text>
        </g>
      )}

      {/* Линии отреза: поле этого листа отрезается, и лист кладётся на клей соседа */}
      {tile.cutLeft && <line className="cut-line" x1={MARGIN} y1={0} x2={MARGIN} y2={H} />}
      {tile.cutTop && <line className="cut-line" x1={0} y1={MARGIN} x2={W} y2={MARGIN} />}
      {tile.cutLeft && (
        <text className="cut-text" x={MARGIN - 1.5} y={MARGIN + 18} transform={`rotate(-90 ${MARGIN - 1.5} ${MARGIN + 18})`}>
          ✂
        </text>
      )}

      {/* Метки совмещения: «+» на начале клея совпадает с «+» на линии отреза соседа */}
      {tile.glueRight && [mark(glueX, MARGIN + 12, 'r1'), mark(glueX, MARGIN + ch - 12, 'r2')]}
      {tile.cutLeft && [mark(MARGIN, MARGIN + 12, 'l1'), mark(MARGIN, MARGIN + ch - 12, 'l2')]}
      {tile.glueBottom && [mark(MARGIN + 12, glueY, 'b1'), mark(MARGIN + cw - 12, glueY, 'b2')]}
      {tile.cutTop && [mark(MARGIN + 12, MARGIN, 't1'), mark(MARGIN + cw - 12, MARGIN, 't2')]}

      {/* Подпись листа — в верхнем поле */}
      <text className="sheet-label" x={MARGIN} y={MARGIN - 3.5}>
        {tile.label}
      </text>
      <text className="sheet-meta" x={W - MARGIN} y={MARGIN - 3.5} textAnchor="end">
        {title} · {t('print.sheetOf', { n: plan.tiles.indexOf(tile) + 1, total: plan.tiles.length })}
      </text>
    </Page>
  );
}

/** Вся схема на одном листе */
export function SinglePage({ tree, computed, plan, title }: { tree: TreeData; computed: Computed; plan: SinglePlan; title: string }) {
  const b = computed.bounds;
  const region: Bounds = { minX: b.minX - PADDING, minY: b.minY - PADDING, maxX: b.maxX + PADDING, maxY: b.maxY + PADDING };
  return (
    <Page w={plan.pageW} h={plan.pageH}>
      <g transform={`translate(${plan.offsetX} ${plan.offsetY}) scale(${plan.scale})`}>
        <ChartGroup tree={tree} computed={computed} region={region} />
      </g>
      <text className="sheet-meta" x={plan.pageW - MARGIN} y={plan.pageH - 4} textAnchor="end">
        {title}
      </text>
    </Page>
  );
}

/** Первая страница: схема сборки и инструкция */
export function SchemePage({ plan, computed, title }: { plan: TilePlan; computed: Computed; title: string }) {
  const { t } = useTranslation();
  const { sheetW: W, sheetH: H } = plan;
  // Мини-плакат: сетка листов поверх силуэта схемы
  const boxW = W - 2 * MARGIN;
  const boxH = H * 0.55;
  const k = Math.min(boxW / plan.posterW, boxH / plan.posterH);
  const ox = MARGIN + (boxW - plan.posterW * k) / 2;
  const oy = MARGIN + 34;
  const b = computed.bounds;
  const cards = computed.kind === 'cards' ? computed.chart.cards : [];
  const steps = [t('print.step1'), t('print.step2'), t('print.step3'), t('print.step4')];

  return (
    <Page w={W} h={H}>
      <text className="scheme-title" x={MARGIN} y={MARGIN + 8}>
        {title}
      </text>
      <text className="scheme-sub" x={MARGIN} y={MARGIN + 16}>
        {t('print.schemeSummary', {
          rows: plan.rows,
          cols: plan.cols,
          total: plan.tiles.length,
          w: Math.round(plan.posterW / 10),
          h: Math.round(plan.posterH / 10),
        })}
      </text>
      <g transform={`translate(${ox} ${oy}) scale(${k})`}>
        <g transform={`scale(${plan.scale}) translate(${PADDING - b.minX} ${PADDING - b.minY})`}>
          {cards.map((c) => (
            <rect key={c.key} x={c.x} y={c.y} width={CARD_W} height={CARD_H} className="scheme-card" />
          ))}
        </g>
        {plan.tiles.map((tile) => (
          <g key={tile.label}>
            <rect x={tile.x} y={tile.y} width={plan.contentW} height={plan.contentH} className="scheme-tile" />
            <text x={tile.x + plan.contentW / 2} y={tile.y + plan.contentH / 2} className="scheme-label" style={{ fontSize: Math.min(plan.contentW, plan.contentH) / 4 }}>
              {tile.label}
            </text>
          </g>
        ))}
      </g>
      <g transform={`translate(${MARGIN} ${oy + plan.posterH * k + 12})`}>
        <text className="scheme-sub" x={0} y={0}>
          {t('print.howTo')}
        </text>
        {steps.map((s, i) => (
          <text key={i} className="scheme-step" x={0} y={8 + i * 7}>
            {i + 1}. {s}
          </text>
        ))}
      </g>
    </Page>
  );
}

/** Тестовая страница: линейки 10 см — проверка, что принтер не изменил масштаб */
export function RulerPage({ w, h }: { w: number; h: number }) {
  const { t } = useTranslation();
  const x0 = MARGIN + 10;
  const y0 = MARGIN + 40;
  const ticks = Array.from({ length: 101 }, (_, i) => i);
  return (
    <Page w={w} h={h}>
      <text className="scheme-title" x={MARGIN} y={MARGIN + 8}>
        {t('print.rulerTitle')}
      </text>
      <text className="scheme-step" x={MARGIN} y={MARGIN + 17}>
        {t('print.rulerHint1')}
      </text>
      <text className="scheme-step" x={MARGIN} y={MARGIN + 24}>
        {t('print.rulerHint2')}
      </text>
      <g className="ruler">
        <line x1={x0} y1={y0} x2={x0 + 100} y2={y0} />
        {ticks.map((i) => (
          <line key={`h${i}`} x1={x0 + i} y1={y0} x2={x0 + i} y2={y0 + (i % 10 === 0 ? 6 : i % 5 === 0 ? 4 : 2)} />
        ))}
        {ticks.filter((i) => i % 10 === 0).map((i) => (
          <text key={`ht${i}`} x={x0 + i} y={y0 + 11}>
            {i / 10}
          </text>
        ))}
        <line x1={x0} y1={y0 + 20} x2={x0} y2={y0 + 120} />
        {ticks.map((i) => (
          <line key={`v${i}`} x1={x0} y1={y0 + 20 + i} x2={x0 + (i % 10 === 0 ? 6 : i % 5 === 0 ? 4 : 2)} y2={y0 + 20 + i} />
        ))}
        {ticks.filter((i) => i % 10 === 0).map((i) => (
          <text key={`vt${i}`} x={x0 + 9} y={y0 + 21.5 + i}>
            {i / 10}
          </text>
        ))}
      </g>
    </Page>
  );
}
