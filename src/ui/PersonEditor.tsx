import { ArrowLeft, ChevronsDown, ChevronsUp, Crosshair, Star, Trash, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { knownGenerations } from '../model/generations';
import { findKinship } from '../model/kinship';
import { nameKinship } from '../model/kinshipTerms';
import { patronymicSuggestions } from '../model/patronymic';
import { removePerson, setRootPerson, updatePerson } from '../model/ops';
import { childrenOf, isLiving, parentsOf, siblingsOf, spousesOf } from '../model/queries';
import type { LifeEvent, Person, PersonNames } from '../model/types';
import { apply, select, setFocus, useApp } from '../state/store';
import { GEN_MAX, GEN_MIN, setView, useView } from '../state/view';
import { Segmented, SexToggle } from './controls';
import { DateField } from './DateField';
import { LifeEventsSection } from './LifeEvents';
import { lifespan, useDateLocale, useNameOf } from './format';
import { PersonIssues } from './IssuesView';
import { KinshipDialog } from './KinshipDialog';
import { NameVariantsField } from './NameVariantsField';
import { Avatar } from './media';
import { ConfirmDialog } from './Modal';
import { PhotosSection } from './photos/PhotosSection';
import { Relations } from './Relations';

// Карточка человека: вкладки «Основное», «Родные», «Фото», «О жизни».
// Поля сразу пишут изменения в древо; быстрые правки одного поля — один шаг отмены.

type Tab = 'main' | 'relatives' | 'photos' | 'life';
// Последняя открытая вкладка — при переходе к другому человеку остаёмся на ней
let lastTab: Tab = 'main';

export function PersonEditor() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const selectedId = useApp((s) => s.session!.selectedId);
  const focusId = useApp((s) => s.session!.focusId);
  const view = useView();
  const nameOf = useNameOf();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTabState] = useState<Tab>(lastTab);
  const [showBirthSurname, setShowBirthSurname] = useState(false);
  const setTab = (x: Tab) => {
    lastTab = x;
    setTabState(x);
  };

  const person = selectedId ? tree.people[selectedId] : undefined;
  if (!person) {
    return (
      <section className="editor editor-empty">
        <p className="muted">{t('person.nothingSelected')}</p>
      </section>
    );
  }
  const id = person.id;

  const update = (fn: (p: Person) => Person, field?: string) =>
    apply((tr) => updatePerson(tr, id, fn), field ? `${id}.${field}` : undefined);

  const setName = (field: keyof PersonNames) => (value: string) =>
    update((p) => ({ ...p, names: { ...p.names, [field]: value || undefined } }), field);

  const setEvent = (kind: 'birth' | 'death', patch: Partial<LifeEvent>, field?: string) =>
    update((p) => {
      const ev: LifeEvent = { ...p[kind], ...patch };
      if (!ev.date) delete ev.date;
      if (!ev.place) delete ev.place;
      const next = { ...p, [kind]: ev };
      if (!ev.date && !ev.place) delete next[kind];
      return next;
    }, field);

  const autoLiving = isLiving({ ...person, living: undefined });
  const living = person.living ?? autoLiving;
  const showDeath = !living || !!person.death;
  const isRoot = tree.rootPersonId === id;
  const relativesCount =
    parentsOf(tree, id).length + spousesOf(tree, id).length + childrenOf(tree, id).length + siblingsOf(tree, id).full.length;
  const photosCount = person.photos?.length ?? 0;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'main', label: t('person.tabs.main') },
    { value: 'relatives', label: `${t('person.tabs.relatives')}${relativesCount ? ` ${relativesCount}` : ''}` },
    { value: 'photos', label: `${t('person.tabs.photos')}${photosCount ? ` ${photosCount}` : ''}` },
    { value: 'life', label: `${t('person.tabs.life')}${person.events?.length ? ` ${person.events.length}` : ''}` },
  ];

  return (
    <section className="editor" key={id}>
      <div className="editor-head">
        <div className="editor-title">
          <Avatar person={person} size={52} />
          <div className="editor-title-text">
            <h2>{nameOf(person)}</h2>
            <span className="muted small">{[lifespan(person), person.occupation].filter(Boolean).join(' · ')}</span>
          </div>
        </div>
        <div className="editor-head-actions">
          {(focusId !== id || view.mode !== 'tree') && (
            <button
              type="button"
              className="icon-btn"
              title={t('tree.center')}
              aria-label={t('tree.center')}
              onClick={() => {
                setFocus(id);
                setView({ mode: 'tree' });
              }}
            >
              <Crosshair size={18} strokeWidth={1.75} />
            </button>
          )}
          <button
            type="button"
            className={isRoot ? 'icon-btn is-on' : 'icon-btn'}
            title={isRoot ? t('person.isRoot') : t('person.makeRoot')}
            aria-label={isRoot ? t('person.isRoot') : t('person.makeRoot')}
            aria-pressed={isRoot}
            onClick={() => !isRoot && apply((tr) => setRootPerson(tr, id))}
          >
            <Star size={18} strokeWidth={1.75} fill={isRoot ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn-danger"
            title={t('person.delete')}
            aria-label={t('person.delete')}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title={view.mode === 'list' ? t('people.back') : t('common.close')}
            aria-label={view.mode === 'list' ? t('people.back') : t('common.close')}
            onClick={() => select(undefined)}
          >
            {view.mode === 'list' ? <ArrowLeft size={18} strokeWidth={1.75} className="mobile-only-icon" /> : <X size={18} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      <RelationToRoot personId={id} />
      <GenerationsInfo personId={id} />
      <PersonIssues personId={id} />

      <div className="tabs" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.value}
            type="button"
            role="tab"
            aria-selected={tab === x.value}
            className={tab === x.value ? 'tab active' : 'tab'}
            onClick={() => setTab(x.value)}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'main' && (
        <div className="tab-panel">
          <div className="form-grid form-grid-3">
            <TextField id="field-given" label={t('person.given')} value={person.names.given} onChange={setName('given')} />
            <PatronymicField person={person} onChange={setName('patronymic')} />
            <TextField id="field-surname" label={t('person.surname')} value={person.names.surname} onChange={setName('surname')} />
          </div>
          {person.names.birthSurname || showBirthSurname ? (
            <TextField
              id="field-birthSurname"
              label={t('person.birthSurname')}
              hint={t('person.birthSurnameHint')}
              value={person.names.birthSurname}
              onChange={setName('birthSurname')}
            />
          ) : (
            <button type="button" className="link-btn small add-field" onClick={() => setShowBirthSurname(true)}>
              + {t('person.birthSurname')}
            </button>
          )}

          <NameVariantsField person={person} update={update} />

          {/* Пол и статус — друг под другом: рядом кнопки не помещаются в ширину карточки */}
          <div className="form-stack">
            <div className="field">
              <span>{t('person.sex')}</span>
              <SexToggle value={person.sex} onChange={(sex) => update((p) => ({ ...p, sex }))} />
            </div>
            <div className="field">
              <span>{t('person.living')}</span>
              <Segmented
                full
                label={t('person.living')}
                value={person.living === undefined ? 'auto' : person.living ? 'yes' : 'no'}
                onChange={(v) =>
                  update((p) => {
                    const next = { ...p, living: v === 'auto' ? undefined : v === 'yes' };
                    if (next.living === undefined) delete next.living;
                    return next;
                  })
                }
                options={[
                  { value: 'yes', label: t('person.livingYesShort') },
                  { value: 'no', label: t('person.livingNoShort') },
                  { value: 'auto', label: t('person.livingAutoShort'), title: t('person.livingAuto', { state: autoLiving ? t('person.alive') : t('person.dead') }) },
                ]}
              />
            </div>
          </div>

          <fieldset className="event">
            <legend>{t('person.birth')}</legend>
            <div className="form-grid form-grid-2">
              <DateField id="field-birth-date" label={t('person.date')} value={person.birth?.date} onCommit={(date) => setEvent('birth', { date })} />
              <TextField
                id="field-birth-place"
                label={t('person.place')}
                value={person.birth?.place}
                onChange={(place) => setEvent('birth', { place: place || undefined }, 'birth.place')}
              />
            </div>
          </fieldset>
          {showDeath && (
            <fieldset className="event">
              <legend>{t('person.death')}</legend>
              <div className="form-grid form-grid-2">
                <DateField id="field-death-date" label={t('person.date')} value={person.death?.date} onCommit={(date) => setEvent('death', { date })} />
                <TextField
                  id="field-death-place"
                  label={t('person.place')}
                  value={person.death?.place}
                  onChange={(place) => setEvent('death', { place: place || undefined }, 'death.place')}
                />
              </div>
            </fieldset>
          )}
        </div>
      )}

      {tab === 'relatives' && (
        <div className="tab-panel">
          <Relations person={person} />
        </div>
      )}

      {tab === 'photos' && (
        <div className="tab-panel">
          <PhotosSection person={person} />
        </div>
      )}

      {tab === 'life' && (
        <div className="tab-panel">
          <TextField
            id="field-occupation"
            label={t('person.occupation')}
            value={person.occupation}
            onChange={(v) => update((p) => ({ ...p, occupation: v || undefined }), 'occupation')}
          />
          <LifeEventsSection person={person} />
          <label className="field">
            <span>{t('person.notes')}</span>
            <textarea
              rows={10}
              value={person.notes ?? ''}
              placeholder={t('person.notesPlaceholder')}
              onChange={(e) => update((p) => ({ ...p, notes: e.target.value || undefined }), 'notes')}
            />
          </label>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={t('person.deleteTitle', { name: nameOf(person) })}
          text={t('person.deleteText')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            setConfirmDelete(false);
            apply((tr) => removePerson(tr, id));
            select(undefined);
          }}
        />
      )}
    </section>
  );
}

/** «Известно поколений: ↑ 3 поколения предков (6 чел.) · ↓ 2 поколения потомков (4 чел.)»; по клику — схема */
function GenerationsInfo({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const g = useMemo(() => knownGenerations(tree, personId), [tree, personId]);
  const show = (chart: 'ancestors' | 'descendants', n: number) => {
    const gens = Math.min(GEN_MAX, Math.max(GEN_MIN, n));
    setView(chart === 'ancestors' ? { mode: 'tree', chart, up: gens } : { mode: 'tree', chart, down: gens });
    setFocus(personId);
  };
  if (!g.up && !g.down) return <p className="gen-info muted small">{t('gens.none')}</p>;
  return (
    <div className="gen-info">
      <span className="muted small">{t('gens.title')}:</span>
      {g.up > 0 && (
        <button type="button" className="gen-chip" title={t('gens.showAncestors')} onClick={() => show('ancestors', g.up)}>
          <ChevronsUp size={14} strokeWidth={2} aria-hidden="true" />
          {t('gens.up', { count: g.up })}
          <span className="muted">· {t('gens.people', { count: g.upPeople })}</span>
        </button>
      )}
      {g.down > 0 && (
        <button type="button" className="gen-chip" title={t('gens.showDescendants')} onClick={() => show('descendants', g.down)}>
          <ChevronsDown size={14} strokeWidth={2} aria-hidden="true" />
          {t('gens.down', { count: g.down })}
          <span className="muted">· {t('gens.people', { count: g.downPeople })}</span>
        </button>
      )}
    </div>
  );
}

/** «Для главного человека (Алексей Демидов): прадедушка» — с кнопкой подробнее */
function RelationToRoot({ personId }: { personId: string }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const lang = useDateLocale();
  const nameOf = useNameOf();
  const [open, setOpen] = useState(false);
  const rootId = tree.rootPersonId;

  const name = useMemo(() => {
    if (!rootId || rootId === personId) return null;
    const k = findKinship(tree, rootId, personId);
    return k ? nameKinship(tree, k, lang).term : undefined;
  }, [tree, rootId, personId, lang]);

  if (name === null || !rootId) return null;
  return (
    <>
      <button type="button" className="root-relation" onClick={() => setOpen(true)} title={t('kin.details')}>
        <span className="muted small">{t('kin.forRoot', { name: nameOf(tree.people[rootId]) })}:</span>{' '}
        <strong>{name ?? t('kin.notRelatedShort')}</strong>
      </button>
      {open && <KinshipDialog initialA={rootId} initialB={personId} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Отчество с выпадающим списком: от отца, от имён мужчин древа, уже записанные отчества */
function PatronymicField({ person, onChange }: { person: Person; onChange: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const listId = useId();
  const uzbek = i18n.resolvedLanguage === 'uz';
  const options = useMemo(() => {
    const father = parentsOf(tree, person.id).find((p) => p.person.sex === 'M')?.person.names.given;
    return patronymicSuggestions(tree, person.sex, { father, uzbek, exclude: person.id });
  }, [tree, person.id, person.sex, uzbek]);
  return (
    <label className="field">
      <span>{t('person.patronymic')}</span>
      <input
        id="field-patronymic"
        value={person.names.patronymic ?? ''}
        onChange={(e) => onChange(e.target.value)}
        list={listId}
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </label>
  );
}

function TextField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {hint && <small className="muted"> — {hint}</small>}
      </span>
      <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
