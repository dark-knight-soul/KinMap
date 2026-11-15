import { useId, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { parseFuzzyDate } from '../model/dates';
import { genderSurname } from '../model/names';
import { genderPatronymic, patronymicFrom, patronymicSuggestions } from '../model/patronymic';
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

export interface PickerDefaults {
  sex?: Sex;
  surname?: string;
  /** Имя отца — из него получается отчество (Иван → Иванович / Ивановна) */
  father?: string;
  /** Имя отца для каждого варианта «второго родителя» (если отец зависит от выбора) */
  fatherByFamily?: Record<string, string | undefined>;
  /** Готовое отчество (например, у брата/сестры), если имя отца неизвестно */
  patronymic?: string;
}

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
  defaults: PickerDefaults;
  exclude: PersonId[];
  /** «Второй родитель» — если у человека несколько союзов */
  familyChoices?: { value: string; label: string }[];
  onPick: (choice: PickChoice, family?: string) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
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
    if (!patronymicTouched) setPatronymicState(autoPatronymic(s, family));
  };
  const [born, setBorn] = useState('');
  const [family, setFamilyState] = useState(familyChoices?.[0]?.value);

  // Отчество подставляется само (от имени отца или как у брата/сестры),
  // пока его не правили руками; меняется вместе с полом и выбором второго родителя.
  const fatherFor = (fam: string | undefined) =>
    defaults.fatherByFamily && fam !== undefined ? defaults.fatherByFamily[fam] : defaults.father;
  const autoPatronymic = (s: Sex, fam: string | undefined) =>
    patronymicFrom(fatherFor(fam), s) || (defaults.patronymic ? (genderPatronymic(defaults.patronymic, s) ?? '') : '');
  const [patronymic, setPatronymicState] = useState(() => autoPatronymic(sex, family));
  const [patronymicTouched, setPatronymicTouched] = useState(false);
  const setPatronymic = (v: string) => {
    setPatronymicTouched(true);
    setPatronymicState(v);
  };
  const setFamily = (fam: string) => {
    setFamilyState(fam);
    if (!patronymicTouched) setPatronymicState(autoPatronymic(sex, fam));
  };
  const uzbek = i18n.resolvedLanguage === 'uz';
  const patronymicList = useMemo(
    () => patronymicSuggestions(tree, sex, { father: fatherFor(family), uzbek }),
    [tree, sex, family, uzbek],
  );
  // В английском интерфейсе отчество не принято — поле показываем, только если в древе оно уже где-то есть
  const showPatronymic =
    i18n.resolvedLanguage !== 'en' || !!patronymic || Object.values(tree.people).some((p) => p.names.patronymic);
  const listId = useId();

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
          names: {
            given: given.trim() || undefined,
            patronymic: patronymic.trim() || undefined,
            surname: surname.trim() || undefined,
          },
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
          {showPatronymic && (
            <label className="field">
              <span>{t('person.patronymic')}</span>
              {/* Список вариантов: от отца, от имён мужчин древа, уже записанные отчества */}
              <input
                value={patronymic}
                onChange={(e) => setPatronymic(e.target.value)}
                list={listId}
                autoComplete="off"
                placeholder={t('picker.patronymicPlaceholder')}
              />
              <datalist id={listId}>
                {patronymicList.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </label>
          )}
          <label className="field">
            <span>{t('person.surname')}</span>
            <input value={surname} onChange={(e) => setSurname(e.target.value)} />
          </label>
          <label className="field">
            <span>{t('picker.born')}</span>
            <input value={born} onChange={(e) => setBorn(e.target.value)} placeholder={t('picker.bornPlaceholder')} />
          </label>
        </div>
        <div className="field">
          <span>{t('person.sex')}</span>
          <SexToggle value={sex} onChange={setSex} />
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
