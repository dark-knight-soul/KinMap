import { Lightbulb, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { readSetting, writeSetting } from '../lib/storage';
import { parseFuzzyDate } from '../model/dates';
import { addPerson } from '../model/ops';
import type { PersonId, Sex } from '../model/types';
import { apply, setFocus, useApp } from '../state/store';
import { SexToggle } from './controls';
import { Modal } from './Modal';

// Первые шаги: «С кого начнём?» для пустого древа и подсказка на схеме, пока людей мало.

/** Окно «С кого начнём?» — простая форма вместо полной карточки */
export function FirstPersonDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [given, setGiven] = useState('');
  const [patronymic, setPatronymic] = useState('');
  const [surname, setSurname] = useState('');
  const [sex, setSex] = useState<Sex>('U');
  const [born, setBorn] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    let id: PersonId | undefined;
    const date = parseFuzzyDate(born);
    apply((tree) => {
      const r = addPerson(tree, {
        sex,
        names: {
          given: given.trim() || undefined,
          patronymic: patronymic.trim() || undefined,
          surname: surname.trim() || undefined,
        },
        birth: date ? { date } : undefined,
      });
      id = r.id;
      return { ...r.tree, rootPersonId: r.id };
    });
    if (id) setFocus(id);
    onClose();
  };

  return (
    <Modal title={t('onboarding.title')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted">{t('onboarding.text')}</p>
        <div className="form-grid form-grid-3">
          <label className="field">
            <span>{t('person.given')}</span>
            <input value={given} onChange={(e) => setGiven(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>{t('person.patronymic')}</span>
            <input value={patronymic} onChange={(e) => setPatronymic(e.target.value)} />
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
        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-large" disabled={!given.trim() && !surname.trim()}>
            {t('onboarding.start')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const COACH_KEY = 'coachDone';
/** После скольких людей подсказка больше не нужна */
const COACH_UNTIL = 6;

/** Подсказка на схеме: как добавлять родных */
export function CoachHint() {
  const { t } = useTranslation();
  const count = useApp((s) => Object.keys(s.session!.history.present.people).length);
  const hasSelection = useApp((s) => !!s.session!.selectedId);
  const [hidden, setHidden] = useState(() => readSetting(COACH_KEY) === '1');
  if (hidden || count >= COACH_UNTIL) return null;

  return (
    <div className="coach" role="note">
      <Lightbulb size={18} strokeWidth={1.75} className="coach-icon" />
      <span>{hasSelection ? t('onboarding.hintSelected') : t('onboarding.hintSelect')}</span>
      <button
        type="button"
        className="icon-btn icon-btn-small"
        aria-label={t('common.close')}
        onClick={() => {
          writeSetting(COACH_KEY, '1');
          setHidden(true);
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
