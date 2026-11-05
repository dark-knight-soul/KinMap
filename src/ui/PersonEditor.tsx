import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { removePerson, setRootPerson, updatePerson } from '../model/ops';
import { isLiving } from '../model/queries';
import type { LifeEvent, Person, PersonNames, Sex } from '../model/types';
import { apply, select, setFocus, useApp } from '../state/store';
import { setView, useView } from '../state/view';
import { DateField } from './DateField';
import { lifespan, useDateLocale, useNameOf } from './format';
import { ConfirmDialog } from './Modal';
import { findKinship } from '../model/kinship';
import { nameKinship } from '../model/kinshipTerms';
import { PersonIssues } from './IssuesView';
import { KinshipDialog } from './KinshipDialog';
import { Avatar } from './media';
import { PhotosSection } from './photos/PhotosSection';
import { Relations } from './Relations';

// Карточка человека: имя, пол, даты, заметки и связи.
// Поля сразу пишут изменения в древо; быстрые правки одного поля — один шаг отмены.
export function PersonEditor() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const selectedId = useApp((s) => s.session!.selectedId);
  const focusId = useApp((s) => s.session!.focusId);
  const view = useView();
  const nameOf = useNameOf();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
  const isRoot = tree.rootPersonId === id;

  return (
    <section className="editor" key={id}>
      <button type="button" className="btn btn-ghost back-btn" onClick={() => select(undefined)}>
        {view.mode === 'tree' ? t('tree.back') : t('people.back')}
      </button>

      <div className="editor-head">
        <div className="editor-title">
          <Avatar person={person} size={56} />
          <div>
            <h2>{nameOf(person)}</h2>
            <span className="muted">
              {[lifespan(person), person.occupation].filter(Boolean).join(' · ')}
            </span>
          </div>
        </div>
        <div className="editor-head-actions">
          {(focusId !== id || view.mode !== 'tree') && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setFocus(id);
                setView({ mode: 'tree' });
              }}
            >
              ◎ {t('tree.center')}
            </button>
          )}
          {isRoot ? (
            <span className="muted small">★ {t('person.isRoot')}</span>
          ) : (
            <button type="button" className="btn btn-small" onClick={() => apply((tr) => setRootPerson(tr, id))}>
              ★ {t('person.makeRoot')}
            </button>
          )}
          <button type="button" className="btn btn-small btn-danger-ghost" onClick={() => setConfirmDelete(true)}>
            {t('person.delete')}
          </button>
        </div>
      </div>

      <RelationToRoot personId={id} />
      <PersonIssues personId={id} />

      <div className="form-grid">
        <TextField id="field-surname" label={t('person.surname')} value={person.names.surname} onChange={setName('surname')} />
        <TextField id="field-given" label={t('person.given')} value={person.names.given} onChange={setName('given')} />
        <TextField
          id="field-patronymic"
          label={t('person.patronymic')}
          value={person.names.patronymic}
          onChange={setName('patronymic')}
        />
        <TextField
          id="field-birthSurname"
          label={t('person.birthSurname')}
          hint={t('person.birthSurnameHint')}
          value={person.names.birthSurname}
          onChange={setName('birthSurname')}
        />
        <label className="field">
          <span>{t('person.sex')}</span>
          <select value={person.sex} onChange={(e) => update((p) => ({ ...p, sex: e.target.value as Sex }))}>
            <option value="M">{t('person.sexM')}</option>
            <option value="F">{t('person.sexF')}</option>
            <option value="U">{t('person.sexU')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('person.living')}</span>
          <select
            value={person.living === undefined ? 'auto' : person.living ? 'yes' : 'no'}
            onChange={(e) =>
              update((p) => {
                const v = e.target.value;
                const next = { ...p, living: v === 'auto' ? undefined : v === 'yes' };
                if (next.living === undefined) delete next.living;
                return next;
              })
            }
          >
            <option value="auto">
              {t('person.livingAuto', { state: autoLiving ? t('person.alive') : t('person.dead') })}
            </option>
            <option value="yes">{t('person.livingYes')}</option>
            <option value="no">{t('person.livingNo')}</option>
          </select>
        </label>
      </div>

      <div className="events">
        {(['birth', 'death'] as const).map((kind) => (
          <fieldset key={kind} className="event">
            <legend>{t(`person.${kind}`)}</legend>
            <DateField
              id={`field-${kind}-date`}
              label={t('person.date')}
              value={person[kind]?.date}
              onCommit={(date) => setEvent(kind, { date })}
            />
            <TextField
              id={`field-${kind}-place`}
              label={t('person.place')}
              value={person[kind]?.place}
              onChange={(place) => setEvent(kind, { place: place || undefined }, `${kind}.place`)}
            />
          </fieldset>
        ))}
      </div>
      <p className="muted small">{t('person.dateHint')}</p>

      <TextField
        id="field-occupation"
        label={t('person.occupation')}
        value={person.occupation}
        onChange={(v) => update((p) => ({ ...p, occupation: v || undefined }), 'occupation')}
      />

      <label className="field">
        <span>{t('person.notes')}</span>
        <textarea
          rows={6}
          value={person.notes ?? ''}
          placeholder={t('person.notesPlaceholder')}
          onChange={(e) => update((p) => ({ ...p, notes: e.target.value || undefined }), 'notes')}
        />
      </label>

      <PhotosSection person={person} />

      <Relations person={person} />

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
            select(tree.rootPersonId !== id ? tree.rootPersonId : undefined);
          }}
        />
      )}
    </section>
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
    <div className="root-relation">
      <span className="muted small">{t('kin.forRoot', { name: nameOf(tree.people[rootId]) })}:</span>{' '}
      <strong>{name ?? t('kin.notRelatedShort')}</strong>{' '}
      <button type="button" className="link-btn small" onClick={() => setOpen(true)}>
        {t('kin.details')}
      </button>
      {open && <KinshipDialog initialA={rootId} initialB={personId} onClose={() => setOpen(false)} />}
    </div>
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
