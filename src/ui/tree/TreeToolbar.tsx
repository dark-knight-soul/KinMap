import {
  ArrowDownFromLine,
  ArrowUpFromLine,
  ChevronsDown,
  ChevronsUp,
  ChevronDown,
  Eye,
  ChevronsUpDown,
  Fan,
  Network,
  Orbit,
  Palette,
  RotateCw,
  Search,
  TreeDeciduous,
  Users,
  type LucideProps,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { descendantRoots, type DescendantRoot } from '../../model/generations';
import { matchesQuery, sortKey } from '../../model/queries';
import { setFocus, useApp } from '../../state/store';
import {
  ART_MODES,
  CHART_KINDS,
  SHOW_KEYS,
  GEN_MAX,
  GEN_MIN,
  ROTATABLE,
  setView,
  useView,
  type ArtViewMode,
  type ChartKind,
  type ColorMode,
} from '../../state/view';
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
  all: Network,
};
/** Каким видам нужны поколения вверх / вниз */
const USES_UP: ChartKind[] = ['family', 'ancestors', 'butterfly', 'fan'];
const USES_DOWN: ChartKind[] = ['family', 'descendants', 'butterfly', 'circle', 'tree'];
const COLORS: ColorMode[] = ['sex', 'line', 'surname'];
/** Режимы «Дерева»: значок, подпись, подсказка */
const ART_ICON: Record<ArtViewMode, (p: LucideProps) => React.ReactNode> = {
  ancestors: ChevronsUp,
  descendants: ChevronsDown,
  full: ChevronsUpDown,
  clan: Network,
};
const ART_LABEL: Record<ArtViewMode, string> = {
  ancestors: 'chart.ancestors',
  descendants: 'chart.descendants',
  full: 'chart.artFull',
  clan: 'chart.artClan',
};
const ART_HINT: Record<ArtViewMode, string> = {
  ancestors: 'chart.artAncestorsHint',
  descendants: 'chart.artDescendantsHint',
  full: 'chart.artFullHint',
  clan: 'chart.artClanHint',
};
const GENS = Array.from({ length: GEN_MAX - GEN_MIN + 1 }, (_, i) => GEN_MIN + i);

// Панель над схемой: вид схемы, сколько поколений, поиск человека.
export function TreeToolbar() {
  const { t } = useTranslation();
  const view = useView();
  // «Дерево»: предки и «полный» — свой счётчик поколений (по умолчанию 7), «весь род» — без ограничения
  const isArt = view.chart === 'tree';
  const artAnc = isArt && (view.artMode === 'ancestors' || view.artMode === 'full');
  const showUp = USES_UP.includes(view.chart);
  const desc = useDescRoot();
  // «Потомки» от предка показываются целиком — выбор поколений не нужен
  const showDown =
    USES_DOWN.includes(view.chart) && (!isArt || (view.artMode === 'descendants' && (!desc.chosen || desc.chosen === desc.focus)));
  const rotatable = ROTATABLE.includes(view.chart);

  return (
    <div className="tree-toolbar">
      <ViewPicker />
      <ShowMenu />
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
      {isArt && view.artMode === 'descendants' && <DescRootPicker />}
      {artAnc && (
        <label className="gen-control" title={t('chart.up')}>
          <ChevronsUp size={16} strokeWidth={1.75} aria-hidden="true" />
          <select value={view.artUp} aria-label={t('chart.up')} onChange={(e) => setView({ artUp: Number(e.target.value) })}>
            {GENS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
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

/** Вид схемы — одним выпадающим списком; режимы «Дерева» — отдельной группой */
function ViewPicker() {
  const { t } = useTranslation();
  const view = useView();
  const value = view.chart === 'tree' ? `tree:${view.artMode}` : view.chart;
  const Icon = view.chart === 'tree' ? ART_ICON[view.artMode] : CHART_ICON[view.chart];
  const onChange = (v: string) => {
    if (v.startsWith('tree:')) setView({ chart: 'tree', artMode: v.slice(5) as ArtViewMode });
    else setView({ chart: v as ChartKind });
  };
  return (
    <label className="gen-control view-picker" title={t('chart.kind')}>
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      <select value={value} aria-label={t('chart.kind')} onChange={(e) => onChange(e.target.value)}>
        <optgroup label={t('chart.kind')}>
          {CHARTS.filter((c) => c !== 'tree').map((c) => (
            <option key={c} value={c}>
              {t(`chart.${c}`)}
            </option>
          ))}
        </optgroup>
        <optgroup label={t('chart.tree')}>
          {ART_MODES.map((m) => (
            <option key={m} value={`tree:${m}`} title={t(ART_HINT[m])}>
              {t('chart.tree')}: {t(ART_LABEL[m]).toLocaleLowerCase()}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

/** «Показывать»: галочки — что выводить в подписях людей (отчество, фамилия, годы, супруг(а), фото) */
function ShowMenu() {
  const { t } = useTranslation();
  const view = useView();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const off = SHOW_KEYS.filter((k) => !view.show[k]).length;
  return (
    <div className="show-menu" ref={ref}>
      <button type="button" className="gen-control show-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>{t('show.title')}</span>
        {off > 0 && <span className="show-off">−{off}</span>}
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
      {open && (
        <div className="show-pop" role="group" aria-label={t('show.title')}>
          {SHOW_KEYS.map((k) => (
            <label key={k} className="show-item">
              <input type="checkbox" checked={view.show[k]} onChange={(e) => setView({ show: { ...view.show, [k]: e.target.checked } })} />
              <span>{t(`show.${k}`)}</span>
            </label>
          ))}
          <p className="muted small show-note">{t('show.note')}</p>
        </div>
      )}
    </div>
  );
}

/** «Потомки»: от кого растить дерево — сам человек или любой его предок (с числом потомков) */
/** От кого сейчас растёт «Дерево потомков»: человек в центре, список кандидатов и выбранный */
function useDescRoot() {
  const tree = useApp((s) => s.session?.history.present);
  const focusId = useApp((s) => s.session?.focusId);
  const view = useView();
  const focus = tree && focusId && tree.people[focusId] ? focusId : tree?.rootPersonId;
  const roots = useMemo(
    () => (tree && focus ? descendantRoots(tree, focus) : { list: [] as DescendantRoot[], best: undefined }),
    [tree, focus],
  );
  const saved = view.artDescRoot?.focus === focus ? view.artDescRoot?.root : undefined;
  const chosen = saved && roots.list.some((r) => r.id === saved) ? saved : roots.best;
  return { focus, roots, chosen };
}

function DescRootPicker() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const { focus, roots, chosen } = useDescRoot();
  if (!focus || roots.list.length < 2) return null;
  return (
    <label className="gen-control desc-root" title={t('chart.descFrom')}>
      <span className="muted small">{t('chart.descFromShort')}</span>
      <select value={chosen} aria-label={t('chart.descFrom')} onChange={(e) => setView({ artDescRoot: { focus, root: e.target.value } })}>
        {[...roots.list]
          .sort((a, b) => a.depth - b.depth || b.count - a.count)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {nameOf(tree.people[r.id])} — {r.count}
            </option>
          ))}
      </select>
    </label>
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
