import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addPerson } from '../model/ops';
import { matchesQuery, sortKey } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import { apply, getState, select, useApp } from '../state/store';
import { lifespan, useNameOf } from './format';

// Список людей с поиском. На этапе 3 рядом появится само древо.
export function PeopleList() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const selectedId = useApp((s) => s.session!.selectedId);
  const nameOf = useNameOf();
  const [query, setQuery] = useState('');

  const people = useMemo(
    () =>
      Object.values(tree.people)
        .filter((p) => matchesQuery(p, query))
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [tree.people, query],
  );
  const total = Object.keys(tree.people).length;

  return (
    <aside className="people-panel">
      <div className="people-head">
        <h2>
          {t('people.title')} <span className="muted">({total})</span>
        </h2>
        <button type="button" className="btn btn-primary btn-small" onClick={() => addEmptyPerson()}>
          + {t('people.add')}
        </button>
      </div>

      {total === 0 ? (
        <div className="empty">
          <p>{t('people.empty')}</p>
          <p className="muted small">{t('people.emptyHint')}</p>
          <button type="button" className="btn btn-primary" onClick={() => addEmptyPerson()}>
            {t('people.addFirst')}
          </button>
        </div>
      ) : (
        <>
          <input
            type="search"
            className="search"
            placeholder={t('people.searchPlaceholder')}
            aria-label={t('common.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul className="people-list">
            {people.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={p.id === selectedId ? 'person-row selected' : 'person-row'}
                  onClick={() => select(p.id)}
                >
                  <span className={`sex-dot sex-${p.sex}`} aria-hidden="true" />
                  <span className="person-row-name">
                    {nameOf(p)}
                    {p.id === tree.rootPersonId && (
                      <span className="root-mark" title={t('people.root')}>
                        {' '}
                        ★
                      </span>
                    )}
                  </span>
                  <span className="muted small">{lifespan(p)}</span>
                </button>
              </li>
            ))}
            {people.length === 0 && <li className="muted empty-small">{t('people.notFound')}</li>}
          </ul>
        </>
      )}
    </aside>
  );
}

/** Добавить пустого человека, выбрать его и поставить курсор в поле «Имя» */
function addEmptyPerson(): void {
  let id: PersonId | undefined;
  apply((tree: TreeData) => {
    const r = addPerson(tree);
    id = r.id;
    return r.tree;
  });
  if (id && getState().session) {
    select(id);
    requestAnimationFrame(() => document.getElementById('field-given')?.focus());
  }
}
