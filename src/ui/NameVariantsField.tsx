import { Languages, Trash, WandSparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { autoVariant, NAME_LANGS, suggestLang, transliterate } from '../model/nameVariants';
import type { NameVariant, Person } from '../model/types';

// «Имя на других языках» в карточке человека: язык + имя, отчество, фамилия.
// Кнопка с палочкой заполняет вариант транслитерацией основного имени
// (кириллица → узбекская латиница или английский, латиница → кириллица).
// Вариант на языке интерфейса показывается на схеме и в списках вместо основного имени.

type Update = (fn: (p: Person) => Person, field?: string) => void;
const FIELDS = ['given', 'patronymic', 'surname'] as const;

export function NameVariantsField({ person, update }: { person: Person; update: Update }) {
  const { t, i18n } = useTranslation();
  const variants = person.names.variants ?? [];

  const setVariants = (next: NameVariant[], field?: string) =>
    update((p) => {
      const names: Person['names'] = { ...p.names, variants: next };
      if (!next.length) delete names.variants;
      return { ...p, names };
    }, field);

  const change = (i: number, patch: Partial<NameVariant>, field?: string) =>
    setVariants(
      variants.map((v, k) => {
        if (k !== i) return v;
        const nv = { ...v, ...patch };
        for (const f of FIELDS) if (!nv[f]) delete nv[f];
        return nv;
      }),
      field,
    );

  const add = () => {
    const lang = suggestLang(
      person.names,
      variants.map((v) => v.lang),
      i18n.resolvedLanguage ?? 'ru',
    );
    setVariants([...variants, autoVariant(person.names, lang)]);
  };

  // Можно ли для этого языка что-то перевести автоматически
  const canAuto = (lang: string) => FIELDS.some((f) => person.names[f] && transliterate(person.names[f]!, lang));

  return (
    <div className="name-variants">
      {variants.length > 0 && (
        <div className="name-variants-head">
          <Languages size={15} strokeWidth={1.75} aria-hidden="true" />
          <span>{t('person.variants')}</span>
          <small className="muted">{t('person.variantsHint')}</small>
        </div>
      )}
      {variants.map((v, i) => (
        <div key={i} className="name-variant">
          <div className="name-variant-top">
            <select
              value={v.lang}
              aria-label={t('person.variantLang')}
              onChange={(e) => change(i, { lang: e.target.value })}
            >
              {NAME_LANGS.filter((l) => l.code === v.lang || !variants.some((x) => x.lang === l.code)).map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              disabled={!canAuto(v.lang)}
              title={t('person.variantAuto')}
              aria-label={t('person.variantAuto')}
              onClick={() => change(i, autoVariant(person.names, v.lang))}
            >
              <WandSparkles size={16} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              className="icon-btn"
              title={t('person.variantRemove')}
              aria-label={t('person.variantRemove')}
              onClick={() => setVariants(variants.filter((_, k) => k !== i))}
            >
              <Trash size={16} strokeWidth={1.75} />
            </button>
          </div>
          <div className="form-grid form-grid-3">
            {FIELDS.map((f) => (
              <label key={f} className="field">
                <span>{t(`person.${f}`)}</span>
                <input
                  value={v[f] ?? ''}
                  lang={v.lang}
                  placeholder={person.names[f] ?? ''}
                  onChange={(e) => change(i, { [f]: e.target.value || undefined }, `variant.${i}.${f}`)}
                />
              </label>
            ))}
          </div>
        </div>
      ))}
      {variants.length < NAME_LANGS.length && (
        <button type="button" className="link-btn small add-field" onClick={add}>
          + {t('person.variantAdd')}
        </button>
      )}
    </div>
  );
}
