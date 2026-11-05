import { ArrowLeftRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bloodRelations, findKinship } from '../model/kinship';
import { bloodTermEn, bloodTermRu, nameKinship, stepLabel, type KinLang } from '../model/kinshipTerms';
import { matchesQuery, sortKey } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import { select, useApp } from '../state/store';
import { lifespan, useDateLocale, useNameOf } from './format';
import { Avatar } from './media';
import { Modal } from './Modal';

// «Кем приходится»: выбрать двух людей — получить родство в обе стороны,
// цепочку «как связаны» и (при браках между родственниками) другие связи.

export function KinshipDialog({ initialA, initialB, onClose }: { initialA?: PersonId; initialB?: PersonId; onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const lang: KinLang = useDateLocale();
  const nameOf = useNameOf();
  const [a, setA] = useState<PersonId | undefined>(initialA);
  const [b, setB] = useState<PersonId | undefined>(initialB);

  const result = useMemo(() => {
    if (!a || !b) return null;
    const there = findKinship(tree, a, b);
    if (!there) return { related: false as const };
    const back = findKinship(tree, b, a)!;
    const alternatives = bloodRelations(tree, a, b).slice(1);
    return {
      related: true as const,
      there,
      forward: nameKinship(tree, there, lang),
      backward: nameKinship(tree, back, lang),
      alternatives,
    };
  }, [tree, a, b, lang]);

  const personA = a ? tree.people[a] : undefined;
  const personB = b ? tree.people[b] : undefined;

  return (
    <Modal title={t('kin.title')} onClose={onClose} wide>
      <p className="muted small">{t('kin.hint')}</p>
      <div className="kin-pickers">
        <PersonSelect tree={tree} label={t('kin.a')} value={a} onChange={setA} />
        <button
          type="button"
          className="icon-btn kin-swap"
          onClick={() => {
            setA(b);
            setB(a);
          }}
          title={t('kin.swap')}
          aria-label={t('kin.swap')}
        >
          <ArrowLeftRight size={18} strokeWidth={1.75} />
        </button>
        <PersonSelect tree={tree} label={t('kin.b')} value={b} onChange={setB} />
      </div>

      {result && personA && personB && (
        <div className="kin-result">
          {a === b ? (
            <p>{t('kin.same')}</p>
          ) : !result.related ? (
            <p className="muted">{t('kin.notRelated')}</p>
          ) : (
            <>
              <div className="kin-answers">
                <Answer
                  who={nameOf(personB)}
                  term={result.forward.term}
                  exact={result.forward.exact}
                  forWhom={nameOf(personA)}
                />
                <Answer
                  who={nameOf(personA)}
                  term={result.backward.term}
                  exact={result.backward.exact}
                  forWhom={nameOf(personB)}
                />
              </div>

              <h3 className="form-subtitle">{t('kin.path')}</h3>
              <ol className="kin-path">
                {result.there.path.map((id, i) => {
                  const p = tree.people[id]!;
                  const step = result.there.steps[i - 1];
                  return (
                    <li key={`${id}-${i}`}>
                      {step && <span className="kin-step">↓ {stepLabel(tree, step, lang)}</span>}
                      <button
                        type="button"
                        className="kin-person"
                        onClick={() => {
                          select(id);
                          onClose();
                        }}
                      >
                        <Avatar person={p} size={28} />
                        <span>{nameOf(p)}</span>
                        <span className="muted small">{lifespan(p)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {result.alternatives.length > 0 && (
                <>
                  <h3 className="form-subtitle">{t('kin.also')}</h3>
                  <ul className="kin-also">
                    {result.alternatives.map((r) => (
                      <li key={`${r.up}:${r.down}`}>
                        {(lang === 'ru' ? bloodTermRu : bloodTermEn)(r.up, r.down, personB.sex)}{' '}
                        <span className="muted small">{t('kin.via', { name: nameOf(tree.people[r.via]) })}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function Answer({ who, term, exact, forWhom }: { who: string; term: string; exact: boolean; forWhom: string }) {
  const { t } = useTranslation();
  return (
    <div className="kin-answer">
      <div className="kin-who">{who}</div>
      <div className="kin-term">{term}</div>
      <div className="muted small">
        {t('kin.for')} {forWhom}
        {!exact && <> · {t('kin.descriptive')}</>}
      </div>
    </div>
  );
}

/** Выбор человека: поле поиска с подсказками */
function PersonSelect({
  tree,
  label,
  value,
  onChange,
}: {
  tree: TreeData;
  label: string;
  value?: PersonId;
  onChange: (id: PersonId) => void;
}) {
  const { t } = useTranslation();
  const nameOf = useNameOf();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const current = value ? tree.people[value] : undefined;

  const results = useMemo(
    () =>
      Object.values(tree.people)
        .filter((p) => matchesQuery(p, query))
        .sort((x, y) => sortKey(x).localeCompare(sortKey(y)))
        .slice(0, 12),
    [tree.people, query],
  );

  return (
    <div className="kin-select">
      <span className="control-label small">{label}</span>
      <div className="tree-search">
        <input
          type="search"
          value={open ? query : current ? nameOf(current) : ''}
          placeholder={t('kin.pick')}
          aria-label={label}
          onFocus={() => {
            setQuery('');
            setOpen(true);
          }}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              onChange(results[0].id);
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        {open && (
          <ul className="search-results" role="listbox">
            {results.length === 0 && <li className="muted empty-small">{t('people.notFound')}</li>}
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="person-row"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                >
                  <Avatar person={p} size={24} />
                  <span className="person-row-name">{nameOf(p)}</span>
                  <span className="muted small">{lifespan(p)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
