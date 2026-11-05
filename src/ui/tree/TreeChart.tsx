import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FAN_CENTER_R, layoutFan, type FanSegment } from '../../layout/fanLayout';
import { layoutAncestors, layoutDescendants, layoutFamily } from '../../layout/treeLayout';
import { CARD_H, CARD_W, type Bounds, type CardBox, type ChartLayout } from '../../layout/types';
import type { Person, TreeData } from '../../model/types';
import { select, setFocus, useApp } from '../../state/store';
import { useView, type ChartKind } from '../../state/view';
import { avatarGeometry } from '../../file/images';
import { computeIssues } from '../../model/checks';
import { lifespan } from '../format';
import { urlFor } from '../media';
import { PanZoom, type Viewport } from './PanZoom';

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

  if (!focus || !layout) return null;

  // Центрируем на человеке-центре при смене центра или вида (но не при каждой правке)
  const center =
    layout.kind === 'fan'
      ? { x: 0, y: -layout.fan.radius / 2, seq: `${view.chart}:${focus}` }
      : centerOf(layout.chart, focus, `${view.chart}:${focus}`);

  return (
    <PanZoom bounds={layout.bounds} center={center} label={t('tree.canvasLabel')}>
      {(vp) =>
        layout.kind === 'fan' ? (
          <FanContent tree={tree} fan={layout.fan} selectedId={selectedId} />
        ) : (
          <CardsContent tree={tree} chart={layout.chart} vp={vp} selectedId={selectedId} focusId={focus} />
        )
      }
    </PanZoom>
  );
}

type Computed =
  | { kind: 'cards'; chart: ChartLayout; bounds: Bounds }
  | { kind: 'fan'; fan: ReturnType<typeof layoutFan>; bounds: Bounds };

function computeLayout(tree: TreeData, chart: ChartKind, focus: string, up: number, down: number): Computed {
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

function centerOf(chart: ChartLayout, focus: string, seq: string) {
  const c = chart.cards.find((x) => x.personId === focus && !x.duplicate) ?? chart.cards[0];
  return c ? { x: c.x + CARD_W / 2, y: c.y + CARD_H / 2, seq } : null;
}

// ─── Карточки и линии ───────────────────────────────────────────────────────

function CardsContent({
  tree,
  chart,
  vp,
  selectedId,
  focusId,
}: {
  tree: TreeData;
  chart: ChartLayout;
  vp: Viewport;
  selectedId?: string;
  focusId: string;
}) {
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
  const simple = vp.scale < 0.35;

  return (
    <>
      <defs>
        <clipPath id="km-avatar">
          <circle cx={AV / 2} cy={AV / 2} r={AV / 2} />
        </clipPath>
      </defs>
      <g className="links">
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
            hasIssue={issueIds.has(c.personId)}
          />
        );
      })}
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
}: {
  box: CardBox;
  person: Person;
  selected: boolean;
  focus: boolean;
  simple: boolean;
  photoUrl?: string;
  hasIssue: boolean;
}) {
  const { t } = useTranslation();
  const n = person.names;
  const line1 = [n.given, n.patronymic].filter(Boolean).join(' ') || t('common.unnamed');
  const line2 = n.surname ?? '';
  const years = lifespan(person);
  const cls = ['card', `card-${person.sex}`, selected && 'selected', focus && 'focus', box.duplicate && 'duplicate']
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
      role="button"
      aria-label={title || t('common.unnamed')}
    >
      <title>{box.duplicate ? `${title}\n${t('tree.duplicateHint')}` : title}</title>
      <rect className="card-bg" width={CARD_W} height={CARD_H} rx={10} />
      <rect className="card-stripe" width={6} height={CARD_H} rx={3} />
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

function FanContent({ tree, fan, selectedId }: { tree: TreeData; fan: ReturnType<typeof layoutFan>; selectedId?: string }) {
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
          <g key={s.key} className={cls} onClick={() => select(person.id)} onDoubleClick={() => setFocus(person.id)}>
            <title>{[person.names.given, person.names.patronymic, person.names.surname, lifespan(person)].filter(Boolean).join(' ')}</title>
            <path d={arcPath(s)} className="fan-bg" />
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
          <circle r={FAN_CENTER_R} className="fan-bg" />
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
