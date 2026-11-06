import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeStats } from '../model/stats';
import type { PersonId } from '../model/types';
import { select, setFocus, useApp } from '../state/store';
import { useNameOf } from './format';
import { Modal } from './Modal';

// Статистика рода: крупные цифры, долгожители, частые имена/фамилии/места
// и насколько полно заполнено древо. Всё считается в браузере, никуда не отправляется.

export function StatsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const s = useMemo(() => computeStats(tree), [tree]);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const fmt = (n: number) => n.toLocaleString(i18n.language);

  const open = (id: PersonId) => {
    setFocus(id);
    select(id);
    onClose();
  };
  const personBtn = (id: PersonId, extra: string) => (
    <>
      <button type="button" className="link-btn" onClick={() => open(id)}>
        {nameOf(tree.people[id])}
      </button>{' '}
      <span className="muted small">{extra}</span>
    </>
  );

  const tiles: { label: string; value: string }[] = [
    { label: t('stats.people'), value: fmt(s.people) },
    { label: t('stats.families'), value: fmt(s.families) },
    { label: t('stats.generations'), value: fmt(s.generations) },
    { label: t('stats.living'), value: fmt(s.living) },
    { label: t('stats.avgLifespan'), value: s.avgLifespan ? t('stats.years', { count: Math.round(s.avgLifespan) }) : '—' },
    {
      label: t('stats.span'),
      value: s.earliest && s.latest ? `${s.earliest.year} – ${s.latest.year}` : '—',
    },
  ];

  if (s.people === 0) {
    return (
      <Modal title={t('stats.title')} onClose={onClose}>
        <p className="muted">{t('stats.empty')}</p>
      </Modal>
    );
  }

  return (
    <Modal title={t('stats.title')} onClose={onClose} wide>
      <div className="stat-tiles">
        {tiles.map((x) => (
          <div key={x.label} className="stat-tile">
            <div className="stat-value">{x.value}</div>
            <div className="muted small">{x.label}</div>
          </div>
        ))}
      </div>

      <div className="stat-split">
        <span className="legend-dot sex-m" /> {t('stats.males')}: {fmt(s.males)}
        <span className="legend-dot sex-f" /> {t('stats.females')}: {fmt(s.females)}
      </div>

      <div className="stat-grid">
        {s.earliest && (
          <section>
            <h3 className="form-subtitle">{t('stats.oldest')}</h3>
            <p>{personBtn(s.earliest.id, String(s.earliest.year))}</p>
            {s.latest && (
              <>
                <h3 className="form-subtitle">{t('stats.youngest')}</h3>
                <p>{personBtn(s.latest.id, String(s.latest.year))}</p>
              </>
            )}
          </section>
        )}
        {s.longestLived.length > 0 && (
          <section>
            <h3 className="form-subtitle">{t('stats.longestLived')}</h3>
            <ol className="stat-list">
              {s.longestLived.map((x) => (
                <li key={x.id}>{personBtn(x.id, t('stats.years', { count: x.years }))}</li>
              ))}
            </ol>
          </section>
        )}
        {s.byCentury.length > 0 && (
          <section>
            <h3 className="form-subtitle">{t('stats.byCentury')}</h3>
            <Bars
              items={s.byCentury.map(
                (c) => [t('stats.century', { n: i18n.language.startsWith('ru') ? roman(c.century) : c.century }), Math.round(c.avg)] as [string, number],
              )}
            />
          </section>
        )}
        <TopList title={t('stats.topSurnames')} items={s.topSurnames} />
        <TopList title={t('stats.topMale')} items={repeated(s.topGivenMale)} />
        <TopList title={t('stats.topFemale')} items={repeated(s.topGivenFemale)} />
        <TopList title={t('stats.topPlaces')} items={repeated(s.topPlaces)} />
        <section>
          <h3 className="form-subtitle">{t('stats.completeness')}</h3>
          <Meter label={t('stats.withBirthDate')} value={s.withBirthDate} text={pct(s.withBirthDate)} />
          <Meter label={t('stats.withPhoto')} value={s.withPhoto} text={pct(s.withPhoto)} />
        </section>
      </div>
    </Modal>
  );
}

/** «Частые» — только то, что встречается хотя бы дважды */
const repeated = (items: [string, number][]) => items.filter((x) => x[1] >= 2);

/** Век римскими цифрами (так принято по-русски: XIX век) */
function roman(n: number): string {
  const map: [number, string][] = [
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ];
  let out = '';
  for (const [v, r] of map) while (n >= v) ((out += r), (n -= v));
  return out;
}

function TopList({ title, items }: { title: string; items: [string, number][] }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="form-subtitle">{title}</h3>
      <Bars items={items} />
    </section>
  );
}

/** Простые горизонтальные полоски: подпись, полоса, число */
function Bars({ items }: { items: [string, number][] }) {
  const max = Math.max(...items.map((x) => x[1]), 1);
  return (
    <ul className="stat-bars">
      {items.map(([label, n]) => (
        <li key={label}>
          <span className="stat-bar-label">{label}</span>
          <span className="stat-bar-track">
            <span className="stat-bar" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="stat-bar-n">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Meter({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="stat-meter">
      <div className="small">
        {label} <strong>{text}</strong>
      </div>
      <span className="stat-bar-track">
        <span className="stat-bar" style={{ width: `${value * 100}%` }} />
      </span>
    </div>
  );
}
