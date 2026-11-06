import { Minus, Plus } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildTimeline, directLine, HISTORY_EVENTS } from '../../model/timeline';
import { select, setFocus, useApp } from '../../state/store';
import { setView, useView } from '../../state/view';
import { lifespan, useNameOf } from '../format';
import { useTints } from '../tree/TreeChart';

// Лента времени: полоса жизни каждого человека по годам, отметки браков,
// исторические события на фоне. Щелчок — карточка человека, двойной — он в центре схемы.

const ROW_H = 26;
const BAR_H = 16;
const PAD = 16;
const HEAD_H = 60;
/** Строки подписей событий в шапке */
const EVENT_ROWS = [26, 39, 52];
const MIN_PPY = 2;
const MAX_PPY = 40;

type Filter = 'all' | 'line';

export function TimelineView() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const focusId = useApp((s) => s.session!.focusId);
  const selectedId = useApp((s) => s.session!.selectedId);
  const view = useView();
  const nameOf = useNameOf();
  const focus = focusId && tree.people[focusId] ? focusId : tree.rootPersonId;
  const [filter, setFilter] = useState<Filter>('all');
  const year = new Date().getFullYear();
  const tl = useMemo(
    () => buildTimeline(tree, year, filter === 'line' && focus ? directLine(tree, focus) : undefined),
    [tree, year, filter, focus],
  );
  const tints = useTints(tree, focus, view.color);

  // Масштаб: сколько точек на год. Сначала — чтобы весь период влез по ширине
  const scrollRef = useRef<HTMLDivElement>(null);
  const [ppy, setPpy] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (ppy !== null || !scrollRef.current) return;
    const w = scrollRef.current.clientWidth - 2 * PAD;
    setPpy(Math.min(MAX_PPY, Math.max(4, w / (tl.maxYear - tl.minYear))));
  }, [ppy, tl.maxYear, tl.minYear]);
  const k = ppy ?? 8;
  const x = (y: number) => PAD + (y - tl.minYear) * k;
  const width = x(tl.maxYear) + PAD;
  const height = tl.rows.length * ROW_H + 8;
  const tick = k >= 14 ? 5 : k >= 6 ? 10 : k >= 3 ? 20 : 50;
  const ticks: number[] = [];
  for (let y = Math.ceil(tl.minYear / tick) * tick; y <= tl.maxYear; y += tick) ticks.push(y);
  const events = view.history ? HISTORY_EVENTS.filter((e) => (e.to ?? e.from) >= tl.minYear && e.from <= tl.maxYear) : [];
  // Каждой подписи — первая строка, где она не налезет на предыдущую (ширина — на глаз, 7 px на букву).
  // Не влезла ни в одну строку — подпись не показываем (полоса события и подсказка остаются)
  const ends = EVENT_ROWS.map(() => -Infinity);
  const eventY = events.map((e) => {
    const x0 = PAD + (e.from - tl.minYear) * k + 3;
    const w = t(`timeline.ev.${e.id}`).length * 7 + 12;
    const row = ends.findIndex((end) => end <= x0);
    if (row < 0) return undefined;
    ends[row] = x0 + w;
    return EVENT_ROWS[row];
  });

  // Масштаб кнопками — с сохранением года в центре экрана
  const zoom = (factor: number) => {
    const el = scrollRef.current;
    const next = Math.min(MAX_PPY, Math.max(MIN_PPY, k * factor));
    if (el) {
      const centerYear = tl.minYear + (el.scrollLeft + el.clientWidth / 2 - PAD) / k;
      requestAnimationFrame(() => {
        el.scrollLeft = PAD + (centerYear - tl.minYear) * next - el.clientWidth / 2;
      });
    }
    setPpy(next);
  };

  return (
    <div className="timeline">
      <div className="timeline-bar">
        <label className="gen-control">
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label={t('timeline.filter')}>
            <option value="all">{t('timeline.all')}</option>
            <option value="line">{t('timeline.line', { name: focus ? nameOf(tree.people[focus]) : '' })}</option>
          </select>
        </label>
        <label className="checkbox small">
          <input type="checkbox" checked={view.history} onChange={(e) => setView({ history: e.target.checked })} />
          <span>{t('timeline.events')}</span>
        </label>
        <span className="muted small">
          {t('timeline.count', { count: tl.rows.length })}
          {tl.withoutDates > 0 && ` · ${t('timeline.noDates', { count: tl.withoutDates })}`}
        </span>
        <span className="timeline-zoom">
          <button type="button" className="icon-btn" onClick={() => zoom(0.75)} title={t('zoom.out')} aria-label={t('zoom.out')}>
            <Minus size={16} strokeWidth={1.75} />
          </button>
          <button type="button" className="icon-btn" onClick={() => zoom(1.33)} title={t('zoom.in')} aria-label={t('zoom.in')}>
            <Plus size={16} strokeWidth={1.75} />
          </button>
        </span>
      </div>

      <div className="timeline-scroll" ref={scrollRef}>
        {tl.rows.length === 0 ? (
          <p className="muted empty-small">{t('timeline.empty')}</p>
        ) : (
          <>
            {/* Шапка с годами и событиями — прилипает сверху при прокрутке */}
            <svg className="timeline-head" width={width} height={HEAD_H}>
              {events.map((e, i) =>
                eventY[i] === undefined ? null : (
                  <text key={e.id} x={x(e.from) + 3} y={eventY[i]} className="tl-event-label">
                    <title>{`${t(`timeline.ev.${e.id}`)} (${e.to ? `${e.from}–${e.to}` : e.from})`}</title>
                    {t(`timeline.ev.${e.id}`)}
                  </text>
                ),
              )}
              {ticks.map((y) => (
                <g key={y}>
                  <line x1={x(y)} x2={x(y)} y1={12} y2={HEAD_H} className="tl-tick" />
                  <text x={x(y) + 3} y={11} className="tl-year">
                    {y}
                  </text>
                </g>
              ))}
            </svg>
            <svg className="timeline-body" width={width} height={height}>
              {events.map((e) => (
                <rect key={e.id} x={x(e.from)} y={0} width={Math.max(2, ((e.to ?? e.from) - e.from + 1) * k)} height={height} className="tl-event">
                  <title>{`${t(`timeline.ev.${e.id}`)} (${e.to ? `${e.from}–${e.to}` : e.from})`}</title>
                </rect>
              ))}
              {ticks.map((y) => (
                <line key={y} x1={x(y)} x2={x(y)} y1={0} y2={height} className="tl-grid" />
              ))}
              <line x1={x(year)} x2={x(year)} y1={0} y2={height} className="tl-today" />
              {tl.rows.map((r, i) => {
                const p = tree.people[r.id]!;
                const top = i * ROW_H + (ROW_H - BAR_H) / 2;
                const x0 = x(r.from);
                const w = Math.max(4, (r.to - r.from) * k);
                const label = `${nameOf(p)}${lifespan(p) ? ` · ${lifespan(p)}` : ''}`;
                // Подпись внутри полосы, если помещается, иначе — справа от неё
                const inside = w > label.length * 6.6 + 14;
                const tint = tints?.get(r.id);
                return (
                  <g
                    key={r.id}
                    className={['tl-row', `card-${p.sex}`, `tl-${r.end}`, r.id === selectedId && 'selected'].filter(Boolean).join(' ')}
                    onClick={() => select(r.id)}
                    onDoubleClick={() => {
                      setFocus(r.id);
                      setView({ mode: 'tree' });
                    }}
                  >
                    <title>{label}</title>
                    <rect x={0} y={i * ROW_H} width={width} height={ROW_H} className="tl-hit" />
                    <rect x={x0} y={top} width={w} height={BAR_H} rx={BAR_H / 2} className="tl-bar" style={tint ? { fill: tint } : undefined} />
                    <text x={inside ? x0 + 8 : x0 + w + 6} y={top + BAR_H / 2 + 4} className={inside ? 'tl-label inside' : 'tl-label'}>
                      {label}
                    </text>
                    {r.marriages.map((m, j) => (
                      <circle key={j} cx={x(m)} cy={top + BAR_H} r={3.5} className="tl-marriage">
                        <title>{t('timeline.marriage', { year: m })}</title>
                      </circle>
                    ))}
                  </g>
                );
              })}
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
