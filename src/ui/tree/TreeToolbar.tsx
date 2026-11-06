import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  ChevronsDown,
  ChevronsUp,
  Fan,
  Orbit,
  Palette,
  RotateCw,
  Search,
  TreeDeciduous,
  Users,
  type LucideProps,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesQuery, sortKey } from '../../model/queries';
import { setFocus, useApp } from '../../state/store';
import { CHART_KINDS, GEN_MAX, GEN_MIN, ROTATABLE, setView, useView, type ChartKind, type ColorMode } from '../../state/view';
import { lifespan, useNameOf } from '../format';
import { Avatar } from '../media';

/** Значок «бабочки» (в наборе Lucide такого нет) — в том же стиле: контур 24×24 */
function ButterflyIcon({ size = 24, strokeWidth = 2 }: LucideProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 8v10" />
      <path d="M12 9C10 5 4 3 3 6c-1 3 2 6 6 6-3 1-4 5-1 6 2 .5 4-2 4-5" />
      <path d="M12 9c2-4 8-6 9-3 1 3-2 6-6 6 3 1 4 5 1 6-2 .5-4-2-4-5" />
    </svg>
  );
}

const CHARTS = CHART_KINDS;
const CHART_ICON: Record<ChartKind, (p: LucideProps) => React.ReactNode> = {
  family: Users,
  ancestors: ArrowUpFromLine,
  descendants: ArrowDownFromLine,
  butterfly: ButterflyIcon,
  fan: Fan,
  circle: Orbit,
  tree: TreeDeciduous,
};
/** Каким видам нужны поколения вверх / вниз */
const USES_UP: ChartKind[] = ['family', 'ancestors', 'butterfly', 'fan'];
const USES_DOWN: ChartKind[] = ['family', 'descendants', 'butterfly', 'circle', 'tree'];
const COLORS: ColorMode[] = ['sex', 'line', 'surname'];
const GENS = Array.from({ length: GEN_MAX - GEN_MIN + 1 }, (_, i) => GEN_MIN + i);

// Панель над схемой: вид схемы, сколько поколений, поиск человека.
export function TreeToolbar() {
  const { t } = useTranslation();
  const view = useView();
  const showUp = USES_UP.includes(view.chart);
  const showDown = USES_DOWN.includes(view.chart);
  const rotatable = ROTATABLE.includes(view.chart);

  return (
    <div className="tree-toolbar">
      <div className="segmented chart-seg" role="tablist" aria-label={t('chart.kind')}>
        {CHARTS.map((c) => {
          const Icon = CHART_ICON[c];
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={view.chart === c}
              className={view.chart === c ? 'active' : ''}
              onClick={() => setView({ chart: c })}
              title={t(`chart.${c}`)}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span className="seg-label">{t(`chart.${c}`)}</span>
            </button>
          );
        })}
      </div>
      {rotatable && (
        <button
          type="button"
          className={view.horizontal ? 'icon-btn rotate-btn active' : 'icon-btn rotate-btn'}
          onClick={() => setView({ horizontal: !view.horizontal })}
          aria-pressed={view.horizontal}
          title={t('chart.rotate')}
          aria-label={t('chart.rotate')}
        >
          <RotateCw size={16} strokeWidth={1.75} />
        </button>
      )}
      {showUp && (
        <label className="gen-control" title={t('chart.up')}>
          <ChevronsUp size={16} strokeWidth={1.75} aria-hidden="true" />
          <select value={view.up} aria-label={t('chart.up')} onChange={(e) => setView({ up: Number(e.target.value) })}>
            {GENS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
      {showDown && (
        <label className="gen-control" title={t('chart.downFull')}>
          <ChevronsDown size={16} strokeWidth={1.75} aria-hidden="true" />
          <select value={view.down} aria-label={t('chart.downFull')} onChange={(e) => setView({ down: Number(e.target.value) })}>
            {GENS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="gen-control" title={t('colors.title')}>
        <Palette size={16} strokeWidth={1.75} aria-hidden="true" />
        <select value={view.color} aria-label={t('colors.title')} onChange={(e) => setView({ color: e.target.value as ColorMode })}>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {t(`colors.by_${c}`)}
            </option>
          ))}
        </select>
      </label>
      <PersonSearch />
    </div>
  );
}

/** Поиск: выбор человека из подсказок делает его центром схемы */
function PersonSearch() {
  const { t } = useTranslation();
  const people = useApp((s) => s.session!.history.present.people);
  const nameOf = useNameOf();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const results = useMemo(
    () =>
      query.trim()
        ? Object.values(people)
            .filter((p) => matchesQuery(p, query))
            .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
            .slice(0, 12)
        : [],
    [people, query],
  );

  const pick = (id: string) => {
    setFocus(id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="tree-search">
      <Search className="search-icon" size={16} strokeWidth={1.75} aria-hidden="true" />
      <input
        type="search"
        value={query}
        placeholder={t('tree.searchPlaceholder')}
        aria-label={t('tree.searchPlaceholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) pick(results[0].id);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && query.trim() && (
        <ul className="search-results" role="listbox">
          {results.length === 0 && <li className="muted empty-small">{t('people.notFound')}</li>}
          {results.map((p) => (
            <li key={p.id}>
              <button type="button" className="person-row" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p.id)}>
                <Avatar person={p} size={24} />
                <span className="person-row-name">{nameOf(p)}</span>
                <span className="muted small">{lifespan(p)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
