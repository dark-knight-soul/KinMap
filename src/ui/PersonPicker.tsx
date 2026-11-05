import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parseFuzzyDate } from '../model/dates';
import { genderSurname } from '../model/names';
import type { NewPerson } from '../model/ops';
import { matchesQuery, sortKey } from '../model/queries';
import type { PersonId, Sex } from '../model/types';
import { useApp } from '../state/store';
import { SexToggle } from './controls';
import { lifespan, useNameOf } from './format';
import { Avatar } from './media';
import { Modal } from './Modal';

// Окно «добавить родственника»: вводишь имя — ниже сразу видно, нет ли уже такого
// человека в древе (чтобы не плодить дубликаты). Можно выбрать его или добавить нового.

export type PickChoice = { existing: PersonId } | { create: NewPerson };

const MAX_MATCHES = 8;

export function PersonPicker({
  title,
  defaults,
  exclude,
  familyChoices,
  onPick,
  onClose,
}: {
  title: string;
  defaults: { sex?: Sex; surname?: string };
  exclude: PersonId[];
  /** «Второй родитель» — если у человека несколько союзов */
  familyChoices?: { value: string; label: string }[];
  onPick: (choice: PickChoice, family?: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const [given, setGiven] = useState('');
  const [sex, setSexState] = useState<Sex>(defaults.sex ?? 'U');
  const [surname, setSurnameState] = useState(() => genderSurname(defaults.surname ?? '', defaults.sex ?? 'U'));
  // Пока фамилию не правили руками — при смене пола она меняет род: Испытов → Испытова
  const [surnameTouched, setSurnameTouched] = useState(false);
  const setSurname = (v: string) => {
    setSurnameTouched(true);
    setSurnameState(v);
  };
  const setSex = (s: Sex) => {
    setSexState(s);
    if (!surnameTouched) setSurnameState((cur) => genderSurname(cur, s));
  };
  const [born, setBorn] = useState('');
  const [family, setFamily] = useState(familyChoices?.[0]?.value);

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
    const date = parseFuzzyDate(born);
    onPick(
      {
        create: {
          sex,
          names: { given: given.trim() || undefined, surname: surname.trim() || undefined },
          birth: date ? { date } : undefined,
        },
      },
      family,
    );
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid form-grid-2">
          <label className="field">
            <span>{t('person.given')}</span>
            <input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>{t('person.surname')}</span>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </label>
        </div>
        <div className="form-grid form-grid-2">
          <div className="field">
            <span>{t('person.sex')}</span>
            <SexToggle value={sex} onChange={setSex} />
          </div>
          <label className="field">
            <span>{t('picker.born')}</span>
            <input value={born} onChange={(e) => setBorn(e.target.value)} placeholder={t('picker.bornPlaceholder')} />
          </label>
        </div>
        {familyChoices && familyChoices.length > 1 && (
          <label className="field">
            <span>{t('picker.otherParent')}</span>
            <select value={family} onChange={(e) => setFamily(e.target.value)}>
              {familyChoices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {matches.length > 0 && (
          <div className="picker-existing">
            <span className="muted small">{t('picker.orExisting')}</span>
            <ul className="rel-list">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" className="person-row" onClick={() => onPick({ existing: p.id }, family)}>
                    <Avatar person={p} size={28} />
                    <span className="person-row-name">{nameOf(p)}</span>
                    <span className="muted small">{lifespan(p)}</span>
                    <span className="pick-label small">{t('picker.choose')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('picker.createNew')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
