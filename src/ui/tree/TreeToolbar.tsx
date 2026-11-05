import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { matchesQuery, sortKey } from '../../model/queries';
import { setFocus, useApp } from '../../state/store';
import { GEN_MAX, GEN_MIN, setView, useView, type ChartKind } from '../../state/view';
import { lifespan, useNameOf } from '../format';

const CHARTS: ChartKind[] = ['family', 'ancestors', 'descendants', 'fan'];
const GENS = Array.from({ length: GEN_MAX - GEN_MIN + 1 }, (_, i) => GEN_MIN + i);

// Панель над схемой: вид схемы, сколько поколений, поиск человека.
export function TreeToolbar() {
  const { t } = useTranslation();
  const view = useView();
  const showUp = view.chart !== 'descendants';
  const showDown = view.chart === 'family' || view.chart === 'descendants';

  return (
    <div className="tree-toolbar">
      <div className="segmented" role="tablist" aria-label={t('chart.kind')}>
        {CHARTS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={view.chart === c}
            className={view.chart === c ? 'active' : ''}
            onClick={() => setView({ chart: c })}
          >
            {t(`chart.${c}`)}
          </button>
        ))}
      </div>
      {showUp && (
        <label className="control">
          <span className="control-label">{t('chart.up')}</span>
          <select value={view.up} onChange={(e) => setView({ up: Number(e.target.value) })}>
            {GENS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
      {showDown && (
        <label className="control">
          <span className="control-label">{t('chart.down')}</span>
          <select value={view.down} onChange={(e) => setView({ down: Number(e.target.value) })}>
            {GENS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      )}
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
                <span className={`sex-dot sex-${p.sex}`} aria-hidden="true" />
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
