import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Sex } from '../model/types';

// Мелкие общие элементы управления.

/** Переключатель-«кнопочки» вместо выпадающего списка: всё видно сразу, один клик */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  full,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? 'segmented segmented-full' : 'segmented'} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Пол: М / Ж / ? */
export function SexToggle({ value, onChange }: { value: Sex; onChange: (s: Sex) => void }) {
  const { t } = useTranslation();
  return (
    <Segmented
      value={value}
      label={t('person.sex')}
      full
      onChange={onChange}
      options={[
        { value: 'M', label: <><span className="sex-dot sex-M" /> {t('person.sexMShort')}</>, title: t('person.sexM') },
        { value: 'F', label: <><span className="sex-dot sex-F" /> {t('person.sexFShort')}</>, title: t('person.sexF') },
        { value: 'U', label: '?', title: t('person.sexU') },
      ]}
    />
  );
}
