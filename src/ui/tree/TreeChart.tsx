import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FAN_CENTER_R, layoutFan, type FanSegment } from '../../layout/fanLayout';
import { layoutAncestors, layoutDescendants, layoutFamily } from '../../layout/treeLayout';
import { CARD_H, CARD_W, type Bounds, type CardBox, type ChartLayout } from '../../layout/types';
import type { Person, TreeData } from '../../model/types';
import { select, setFocus, useApp } from '../../state/store';
import { useView, type ChartKind, type ColorMode } from '../../state/view';
import { avatarGeometry } from '../../file/images';
import { computeIssues } from '../../model/checks';
import { openContextMenu, setHighlight, useUi } from '../../state/ui';
import { lineKinds, surnameColors, surnameKey, type LineKind } from '../../layout/colors';
import { lifespan } from '../format';
import { genderSurname } from '../../model/names';
import { urlFor } from '../media';
import { useAddRelative, type RelativeKind } from '../useAddRelative';
import { CardContextMenu, QuickAdd } from './CardActions';
import { PanZoom, type MinimapRect, type Viewport } from './PanZoom';
import { X } from 'lucide-react';

// Схема древа: считает раскладку для выбранного вида и рисует карточки и линии.
// Клик — выбрать человека (откроется его карточка), двойной клик — сделать центром схемы.

export function TreeChart() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const focusId = useApp((s) => s.session!.focusId);
  const selectedId = useApp((s) => s.session!.selectedId);
  const view = useView();

  const focus = focusId && tree.people[focusId] ? focusId : tree.rootPersonId;

  const layout = useMemo(
    () => (focus ? computeLayout(tree, view.chart, focus, view.up, view.down) : null),
    [tree, view.chart, focus, view.up, view.down],
  );

  const { add, dialog } = useAddRelative();
  const tints = useTints(tree, focus, view.color);
  const highlight = useUi((s) => s.highlight);

  // Мини-карта: упрощённые прямоугольники карточек (для веера не нужна — он компактный)
  const minimap = useMemo<MinimapRect[] | undefined>(
    () =>
      layout?.kind === 'cards'
        ? layout.chart.cards.map((c) => ({ x: c.x, y: c.y, w: CARD_W, h: CARD_H, color: tints?.get(c.personId) }))
        : undefined,
    [layout, tints],
  );

  if (!focus || !layout) return null;

  // Центрируем на человеке-центре при смене центра или вида (но не при каждой правке)
  // При подсветке пути — центр на середине пути, иначе на человеке-центре
  const center =
    layout.kind === 'fan'
      ? { x: 0, y: -layout.fan.radius / 2, seq: `${view.chart}:${focus}` }
      : (highlight && centerOfPath(layout.chart, highlight.ids, `${view.chart}:${focus}:${highlight.label}`)) ||
        centerOf(layout.chart, focus, `${view.chart}:${focus}`);

  return (
    <>
      <PanZoom
        bounds={layout.bounds}
        center={center}
        label={t('tree.canvasLabel')}
        onBackgroundClick={() => select(undefined)}
        minimap={minimap}
      >
        {(vp) =>
          layout.kind === 'fan' ? (
            <FanContent tree={tree} fan={layout.fan} selectedId={selectedId} tints={tints} />
          ) : (
            <CardsContent tree={tree} chart={layout.chart} vp={vp} selectedId={selectedId} focusId={focus} onQuickAdd={add} tints={tints} />
          )
        }
      </PanZoom>
      <ColorLegend tree={tree} mode={view.color} layout={layout} />
      {highlight && (
        <div className="path-chip" role="status">
          <span>{highlight.label}</span>
          <button type="button" className="icon-btn" onClick={() => setHighlight(null)} title={t('common.close')} aria-label={t('common.close')}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      )}
      {dialog}
      <CardContextMenu onAdd={add} />
    </>
  );
}

/** Правая кнопка мыши и долгое нажатие пальцем — меню действий с человеком */
function contextMenuHandlers(personId: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number } | null = null;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      openContextMenu({ personId, x: e.clientX, y: e.clientY });
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      start = { x: e.clientX, y: e.clientY };
      const { clientX, clientY } = e;
      timer = setTimeout(() => openContextMenu({ personId, x: clientX, y: clientY }), 550);
    },
    onPointerMove: (e: React.PointerEvent) => {
      // Палец сдвинулся — это перетаскивание схемы, а не долгое нажатие
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
  };
}

/** Цвет линии (отцовская, материнская, своя) — переменные темы */
const LINE_COLOR: Record<LineKind, string> = {
  paternal: 'var(--line-paternal)',
  maternal: 'var(--line-maternal)',
  own: 'var(--line-own)',
};

/** Цвета карточек для выбранного режима окраски; undefined — по полу (как раньше, через CSS) */
export function useTints(tree: TreeData, focusId: string | undefined, mode: ColorMode): Map<string, string> | undefined {
  return useMemo(() => {
    if (mode === 'sex' || !focusId) return undefined;
    const out = new Map<string, string>();
    // Кто не попал ни в одну группу (супруги, люди без фамилии) — нейтральный серый,
    // чтобы цвет пола не путался с цветами линий
    for (const id of Object.keys(tree.people)) out.set(id, 'var(--sex-u)');
    if (mode === 'line') {
      for (const [id, kind] of lineKinds(tree, focusId)) out.set(id, LINE_COLOR[kind]);
    } else {
      const palette = surnameColors(tree);
      for (const p of Object.values(tree.people)) {
        const c = palette.get(surnameKey(p.names.surname) ?? '');
        if (c) out.set(p.id, c);
      }
    }
    return out;
  }, [tree, focusId, mode]);
}

/** Легенда цветов в углу схемы */
function ColorLegend({ tree, mode, layout }: { tree: TreeData; mode: ColorMode; layout: Computed }) {
  const { t } = useTranslation();
  const surnames = useMemo(() => {
    if (mode !== 'surname') return [];
    // Самые частые фамилии среди тех, кто сейчас на схеме (мужская и женская форма — одна запись)
    const ids =
      layout.kind === 'fan'
        ? [layout.fan.rootId, ...layout.fan.segments.map((s) => s.personId)]
        : layout.chart.cards.map((c) => c.personId);
    const palette = surnameColors(tree);
    const count = new Map<string, { label: string; color: string; n: number }>();
    for (const id of new Set(ids)) {
      const sn = tree.people[id]?.names.surname?.trim();
      const key = surnameKey(sn);
      const color = key && palette.get(key);
      if (!sn || !key || !color) continue;
      const cur = count.get(key);
      if (cur) cur.n++;
      else count.set(key, { label: genderSurname(sn, 'M'), color, n: 1 });
    }
    return [...count.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [tree, mode, layout]);
  if (mode === 'sex') return null;
  const items =
    mode === 'line'
      ? (['paternal', 'maternal', 'own'] as const).map((k) => ({ label: t(`colors.${k}`), color: LINE_COLOR[k] }))
      : surnames;
  if (items.length === 0) return null;
  return (
    <ul className="color-legend" aria-label={t('colors.legend')}>
      {items.map((i) => (
        <li key={i.label}>
          <span className="legend-dot" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export type Computed =
  | { kind: 'cards'; chart: ChartLayout; bounds: Bounds }
  | { kind: 'fan'; fan: ReturnType<typeof layoutFan>; bounds: Bounds };

export function computeLayout(tree: TreeData, chart: ChartKind, focus: string, up: number, down: number): Computed {
  if (chart === 'fan') {
    const fan = layoutFan(tree, focus, up);
    const r = Math.max(fan.radius, FAN_CENTER_R);
    return { kind: 'fan', fan, bounds: { minX: -r, minY: -r, maxX: r, maxY: FAN_CENTER_R } };
  }
  const layout =
    chart === 'ancestors'
      ? layoutAncestors(tree, focus, up)
      : chart === 'descendants'
        ? layoutDescendants(tree, focus, down)
        : layoutFamily(tree, focus, up, down);
  return { kind: 'cards', chart: layout, bounds: layout.bounds };
}

/** Середина прямоугольника, охватывающего всех людей пути */
function centerOfPath(chart: ChartLayout, ids: string[], seq: string) {
  const set = new Set(ids);
  const cards = chart.cards.filter((c) => set.has(c.personId) && !c.duplicate);
  if (!cards.length) return null;
  const xs = cards.map((c) => c.x);
  const ys = cards.map((c) => c.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs) + CARD_W) / 2,
    y: (Math.min(...ys) + Math.max(...ys) + CARD_H) / 2,
    seq,
  };
}

function centerOf(chart: ChartLayout, focus: string, seq: string) {
  const c = chart.cards.find((x) => x.personId === focus && !x.duplicate) ?? chart.cards[0];
  return c ? { x: c.x + CARD_W / 2, y: c.y + CARD_H / 2, seq } : null;
}

// ─── Карточки и линии ───────────────────────────────────────────────────────

export function CardsContent({
  tree,
  chart,
  vp,
  selectedId,
  focusId,
  print = false,
  onQuickAdd,
  tints,
}: {
  tree: TreeData;
  chart: ChartLayout;
  vp: Viewport;
  selectedId?: string;
  focusId: string;
  /** Для печати: без выделения, значков замечаний и упрощения */
  print?: boolean;
  /** Кнопки «+» вокруг выбранной карточки */
  onQuickAdd?: (personId: string, kind: RelativeKind) => void;
  /** Цвета карточек (по линиям или фамилиям) */
  tints?: Map<string, string>;
}) {
  const highlight = useUi((s) => s.highlight);
  const pathIds = useMemo(() => (highlight && !print ? new Set(highlight.ids) : null), [highlight, print]);
  // Рисуем только то, что попадает в видимую область
  const lines = chart.lines.filter((l) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of l.points) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    return maxX >= vp.minX && minX <= vp.maxX && maxY >= vp.minY && minY <= vp.maxY;
  });
  const cards = chart.cards.filter(
    (c) => c.x + CARD_W >= vp.minX && c.x <= vp.maxX && c.y + CARD_H >= vp.minY && c.y <= vp.maxY,
  );
  const media = useApp((s) => s.session!.media);
  // Значок «!» — у того, о ком замечание проверки
  const issueIds = useMemo(() => new Set(computeIssues(tree).map((i) => i.personIds[0]!)), [tree]);
  // При сильном отдалении текст не читается — рисуем упрощённые карточки
  const simple = !print && vp.scale < 0.35;
  // Карточка выбранного человека (основная, не «ссылка») — вокруг неё кнопки «+»
  const selectedBox = selectedId ? cards.find((c) => c.personId === selectedId && !c.duplicate) : undefined;

  return (
    <>
      <defs>
        <clipPath id="km-avatar">
          <circle cx={AV / 2} cy={AV / 2} r={AV / 2} />
        </clipPath>
      </defs>
      <g className={pathIds ? 'links dimmed' : 'links'}>
        {lines.map((l) => (
          <polyline key={l.key} points={l.points.map((p) => p.join(',')).join(' ')} className={l.dashed ? 'link dashed' : 'link'} />
        ))}
      </g>
      {cards.map((c) => {
        const person = tree.people[c.personId];
        if (!person) return null;
        const photo = person.photos?.[0];
        const bytes = photo ? media[photo.id] : undefined;
        return (
          <Card
            key={c.key}
            box={c}
            person={person}
            selected={c.personId === selectedId}
            focus={c.personId === focusId && !c.duplicate}
            simple={simple}
            photoUrl={bytes && photo ? urlFor(bytes, photo.mime) : undefined}
            hasIssue={!print && issueIds.has(c.personId)}
            tint={tints?.get(c.personId)}
            path={pathIds ? (pathIds.has(c.personId) ? 'in' : 'out') : undefined}
          />
        );
      })}
      {!print && onQuickAdd && selectedBox && <QuickAdd box={selectedBox} tree={tree} onAdd={onQuickAdd} scale={vp.scale} />}
    </>
  );
}

const MAX_CHARS = 21;
const MAX_CHARS_PHOTO = 14;
/** Диаметр аватара на карточке */
const AV = 44;
const cut = (s: string, n = MAX_CHARS) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const Card = memo(function Card({
  box,
  person,
  selected,
  focus,
  simple,
  photoUrl,
  hasIssue,
  tint,
  path,
}: {
  box: CardBox;
  person: Person;
  selected: boolean;
  focus: boolean;
  simple: boolean;
  photoUrl?: string;
  hasIssue: boolean;
  /** Цвет полоски и лёгкая заливка (режимы «по линиям» / «по фамилиям») */
  tint?: string;
  /** Подсветка пути: in — на пути, out — приглушить */
  path?: 'in' | 'out';
}) {
  const { t } = useTranslation();
  const n = person.names;
  const line1 = [n.given, n.patronymic].filter(Boolean).join(' ') || t('common.unnamed');
  const line2 = n.surname ?? '';
  const years = lifespan(person);
  const cls = ['card', `card-${person.sex}`, selected && 'selected', focus && 'focus', box.duplicate && 'duplicate', path === 'in' && 'in-path', path === 'out' && 'dimmed']
    .filter(Boolean)
    .join(' ');
  const title = [n.given, n.patronymic, n.surname].filter(Boolean).join(' ') + (years ? ` (${years})` : '');
  const photo = person.photos?.[0];
  const withPhoto = !!(photo && photoUrl);
  const textX = withPhoto ? 14 + AV + 10 : 16;
  const maxChars = withPhoto ? MAX_CHARS_PHOTO : MAX_CHARS;

  return (
    <g
      className={cls}
      transform={`translate(${box.x} ${box.y})`}
      onClick={() => select(person.id)}
      onDoubleClick={() => setFocus(person.id)}
      {...contextMenuHandlers(person.id)}
      role="button"
      aria-label={title || t('common.unnamed')}
    >
      <title>{box.duplicate ? `${title}\n${t('tree.duplicateHint')}` : title}</title>
      <rect
        className="card-bg"
        width={CARD_W}
        height={CARD_H}
        rx={12}
        style={tint && !focus ? { fill: `color-mix(in srgb, ${tint} 10%, var(--surface))` } : undefined}
      />
      <rect
        className="card-stripe"
        x={0}
        y={12}
        width={tint ? 6 : 4}
        height={CARD_H - 24}
        rx={2}
        style={tint ? { fill: tint } : undefined}
      />
      {!simple && (
        <>
          {photo && photoUrl && (
            // Вложенный svg: внутри него координаты 0..AV, и одна общая маска-круг подходит всем карточкам
            <svg x={14} y={(CARD_H - AV) / 2} width={AV} height={AV} overflow="hidden">
              <image href={photoUrl} {...avatarGeometry(photo, AV)} clipPath="url(#km-avatar)" preserveAspectRatio="none" />
            </svg>
          )}
          <text x={textX} y={24} className="card-name">
            {cut(line1, maxChars)}
          </text>
          <text x={textX} y={42} className="card-surname">
            {cut(line2, maxChars)}
          </text>
          <text x={textX} y={61} className="card-years">
            {box.duplicate ? `↪ ${years}` : years}
          </text>
        </>
      )}
      {hasIssue && (
        <g className="card-issue">
          <title>{t('checks.cardHint')}</title>
          <circle cx={CARD_W - 12} cy={12} r={8} />
          <text x={CARD_W - 12} y={16} textAnchor="middle">
            !
          </text>
        </g>
      )}
      {box.moreAbove && (
        <g className="more" onClick={(e) => (e.stopPropagation(), setFocus(person.id))}>
          <title>{t('tree.moreAbove')}</title>
          <circle cx={CARD_W / 2} cy={0} r={9} />
          <text x={CARD_W / 2} y={4} textAnchor="middle">
            ▲
          </text>
        </g>
      )}
      {box.moreBelow && (
        <g className="more" onClick={(e) => (e.stopPropagation(), setFocus(person.id))}>
          <title>{t('tree.moreBelow')}</title>
          <circle cx={CARD_W / 2} cy={CARD_H} r={9} />
          <text x={CARD_W / 2} y={CARD_H + 4} textAnchor="middle">
            ▼
          </text>
        </g>
      )}
    </g>
  );
});

// ─── Веер ───────────────────────────────────────────────────────────────────

function arcPath(s: FanSegment): string {
  const p = (r: number, a: number) => `${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  const large = s.end - s.start > Math.PI ? 1 : 0;
  return [
    `M ${p(s.inner, s.start)}`,
    `L ${p(s.outer, s.start)}`,
    `A ${s.outer} ${s.outer} 0 ${large} 1 ${p(s.outer, s.end)}`,
    `L ${p(s.inner, s.end)}`,
    `A ${s.inner} ${s.inner} 0 ${large} 0 ${p(s.inner, s.start)}`,
    'Z',
  ].join(' ');
}

export function FanContent({
  tree,
  fan,
  selectedId,
  tints,
}: {
  tree: TreeData;
  fan: ReturnType<typeof layoutFan>;
  selectedId?: string;
  tints?: Map<string, string>;
}) {
  const tintStyle = (id: string) => {
    const c = tints?.get(id);
    return c ? { fill: `color-mix(in srgb, ${c} 22%, var(--surface))` } : undefined;
  };
  const { t } = useTranslation();
  const root = tree.people[fan.rootId];
  return (
    <>
      {fan.segments.map((s) => {
        const person = tree.people[s.personId];
        if (!person) return null;
        const mid = (s.start + s.end) / 2;
        const rMid = (s.inner + s.outer) / 2;
        const arcLen = rMid * (s.end - s.start);
        // Узкие доли — текст вдоль радиуса, широкие — поперёк
        const radial = arcLen < 110;
        const deg = (mid * 180) / Math.PI;
        const rotate = radial ? (deg > 270 ? deg : deg + 180) : deg + 90;
        const maxChars = Math.max(3, Math.floor((radial ? s.outer - s.inner - 8 : arcLen - 10) / 7));
        const cls = ['fan-seg', `card-${person.sex}`, person.id === selectedId && 'selected', s.duplicate && 'duplicate']
          .filter(Boolean)
          .join(' ');
        return (
          <g key={s.key} className={cls} onClick={() => select(person.id)} onDoubleClick={() => setFocus(person.id)} {...contextMenuHandlers(person.id)}>
            <title>{[person.names.given, person.names.patronymic, person.names.surname, lifespan(person)].filter(Boolean).join(' ')}</title>
            <path d={arcPath(s)} className="fan-bg" style={tintStyle(person.id)} />
            <g transform={`translate(${rMid * Math.cos(mid)} ${rMid * Math.sin(mid)}) rotate(${rotate})`}>
              <text textAnchor="middle" y={radial ? 4 : -4} className="fan-name">
                {cut(person.names.given ?? t('common.unnamed'), maxChars)}
              </text>
              {!radial && (
                <text textAnchor="middle" y={12} className="fan-years">
                  {cut(person.names.surname ?? '', maxChars)}
                </text>
              )}
            </g>
          </g>
        );
      })}
      {root && (
        <g className={['fan-root', `card-${root.sex}`, root.id === selectedId && 'selected'].filter(Boolean).join(' ')} onClick={() => select(root.id)}>
          <circle r={FAN_CENTER_R} className="fan-bg" style={tintStyle(root.id)} />
          <text textAnchor="middle" y={-6} className="fan-name">
            {cut(root.names.given ?? t('common.unnamed'), 14)}
          </text>
          <text textAnchor="middle" y={12} className="fan-years">
            {cut(root.names.surname ?? '', 14)}
          </text>
          <text textAnchor="middle" y={30} className="fan-years">
            {lifespan(root)}
          </text>
        </g>
      )}
    </>
  );
}
