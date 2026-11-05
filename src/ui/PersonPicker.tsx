import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { NewPerson } from '../model/ops';
import { matchesQuery, sortKey } from '../model/queries';
import type { PersonId, Sex } from '../model/types';
import { useApp } from '../state/store';
import { lifespan, useNameOf } from './format';
import { Modal } from './Modal';

// Окно «добавить родственника»: вводишь имя — ниже сразу видно, нет ли уже такого
// человека в древе (чтобы не плодить дубликаты). Можно выбрать его или добавить нового.

export type PickChoice = { existing: PersonId } | { create: NewPerson };

const MAX_MATCHES = 20;

export function PersonPicker({
  title,
  defaults,
  exclude,
  onPick,
  onClose,
}: {
  title: string;
  defaults: { sex?: Sex; surname?: string };
  exclude: PersonId[];
  onPick: (choice: PickChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const [given, setGiven] = useState('');
  const [surname, setSurname] = useState(defaults.surname ?? '');
  const [sex, setSex] = useState<Sex>(defaults.sex ?? 'U');

  const query = `${given} ${surname}`.trim();
  const matches = useMemo(() => {
    if (!given.trim()) return [];
    const skip = new Set(exclude);
    return Object.values(tree.people)
      .filter((p) => !skip.has(p.id) && matchesQuery(p, query))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .slice(0, MAX_MATCHES);
  }, [tree.people, query, given, exclude]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onPick({
      create: {
        sex,
        names: { given: given.trim() || undefined, surname: surname.trim() || undefined },
      },
    });
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <form className="form" onSubmit={submit}>
        <h3 className="form-subtitle">{t('picker.newPerson')}</h3>
        <div className="form-grid">
          <label className="field">
            <span>{t('person.given')}</span>
            <input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>{t('person.surname')}</span>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('person.sex')}</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="M">{t('person.sexM')}</option>
              <option value="F">{t('person.sexF')}</option>
              <option value="U">{t('person.sexU')}</option>
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('picker.createNew')}
          </button>
        </div>
      </form>

      {given.trim() && (
        <div className="picker-existing">
          <h3 className="form-subtitle">{t('picker.orExisting')}</h3>
          {matches.length === 0 ? (
            <p className="muted small">{t('picker.noMatches')}</p>
          ) : (
            <ul className="rel-list">
              {matches.map((p) => (
                <li key={p.id} className="rel-row">
                  <span className={`sex-dot sex-${p.sex}`} aria-hidden="true" />
                  <span className="grow">
                    {nameOf(p)} <span className="muted small">{lifespan(p)}</span>
                  </span>
                  <button type="button" className="btn btn-small" onClick={() => onPick({ existing: p.id })}>
                    {t('picker.choose')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
