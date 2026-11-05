import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFuzzyDate, parseFuzzyDate } from '../model/dates';
import type { FuzzyDate } from '../model/types';
import { useDateLocale } from './format';

// Поле даты: человек пишет как привык («12 марта 1950», «ок. 1950»),
// при выходе из поля дата разбирается и показывается в едином виде.
export function DateField({
  id,
  label,
  value,
  onCommit,
}: {
  id: string;
  label: string;
  value: FuzzyDate | undefined;
  onCommit: (date: FuzzyDate | undefined) => void;
}) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const formatted = formatFuzzyDate(value, locale);
  const [text, setText] = useState(formatted);

  // Значение поменялось снаружи (отмена, другой человек, смена языка) — обновляем поле
  useEffect(() => setText(formatted), [formatted]);

  const commit = () => {
    const parsed = parseFuzzyDate(text);
    if (JSON.stringify(parsed) !== JSON.stringify(value)) onCommit(parsed);
    setText(formatFuzzyDate(parsed, locale));
  };

  const notParsed = !!value?.text && !value.date;

  return (
    <label className="field">
      <span>{label}</span>
      <input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
        }}
        title={t('person.dateHint')}
        placeholder={locale === 'ru' ? 'дд.мм.гггг' : 'd Mon yyyy'}
        aria-invalid={notParsed}
      />
      {notParsed && <small className="warn-text">{t('person.dateNotParsed')}</small>}
    </label>
  );
}
