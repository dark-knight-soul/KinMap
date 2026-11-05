import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildIcs } from '../../file/ics';
import { download, fileNameFor } from '../../file/io';
import { inMonth, todayYMD, upcoming, type CalEvent, type Occurrence } from '../../model/calendar';
import type { TreeData } from '../../model/types';
import { notify, select, useApp } from '../../state/store';
import { useNameOf } from '../format';
import { Avatar } from '../media';
import { Modal } from '../Modal';

// Вид «Календарь»: ближайшие семейные даты и сетка месяца.

const UPCOMING_DAYS = 30;
const ICON: Record<CalEvent['kind'], string> = {
  birthday: '🎂',
  birthMemorial: '🕯',
  deathMemorial: '🕯',
  wedding: '💍',
  weddingMemorial: '💍',
};

/** «День рождения · 41 год», «100 лет со дня рождения»… */
export function useOccurrenceText() {
  const { t } = useTranslation();
  return (o: Occurrence) => t(`calendar.kind.${o.kind}`, { years: t('calendar.years', { count: o.years }) });
}

export function useNamesOf() {
  const nameOf = useNameOf();
  const { t } = useTranslation();
  return (tree: TreeData, o: CalEvent) => o.personIds.map((id) => nameOf(tree.people[id])).join(` ${t('calendar.and')} `);
}

export function CalendarView() {
  const { t, i18n } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const today = todayYMD();
  const [month, setMonth] = useState({ y: today.y, m: today.m });
  const [icsOpen, setIcsOpen] = useState(false);
  const text = useOccurrenceText();
  const namesOf = useNamesOf();

  const soon = useMemo(() => upcoming(tree, today, UPCOMING_DAYS), [tree, today.y, today.m, today.d]);
  const monthEvents = useMemo(() => inMonth(tree, month.y, month.m, today), [tree, month.y, month.m, today.y]);

  const fmtDay = (o: Occurrence) =>
    new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long', weekday: 'short' }).format(
      new Date(o.date.y, o.date.m - 1, o.date.d),
    );
  const when = (o: Occurrence) =>
    o.daysUntil === 0 ? t('calendar.today') : o.daysUntil === 1 ? t('calendar.tomorrow') : t('calendar.inDays', { count: o.daysUntil });

  const shift = (delta: number) =>
    setMonth(({ y, m }) => {
      const idx = y * 12 + (m - 1) + delta;
      return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
    });

  return (
    <div className="calendar">
      <section className="cal-section">
        <div className="cal-head">
          <h2>{t('calendar.upcoming', { days: UPCOMING_DAYS })}</h2>
          <button type="button" className="btn btn-small" onClick={() => setIcsOpen(true)}>
            📅 {t('calendar.toPhone')}
          </button>
        </div>
        {soon.length === 0 ? (
          <p className="muted">{t('calendar.nothingSoon')}</p>
        ) : (
          <ul className="cal-list">
            {soon.map((o) => (
              <li key={`${o.kind}-${o.familyId ?? o.personIds[0]}`} className={o.daysUntil === 0 ? 'cal-item today' : 'cal-item'}>
                <div className="cal-when">
                  <strong>{when(o)}</strong>
                  <span className="muted small">{fmtDay(o)}</span>
                </div>
                <button type="button" className="cal-who" onClick={() => select(o.personIds[0])}>
                  {o.personIds.map((id) => (tree.people[id] ? <Avatar key={id} person={tree.people[id]!} size={32} /> : null))}
                  <span>
                    <span className="cal-names">{namesOf(tree, o)}</span>
                    <span className="small">
                      {ICON[o.kind]} {text(o)}
                      {o.jubilee && <span className="cal-jubilee"> {t('calendar.jubilee')}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cal-section">
        <div className="cal-head">
          <button type="button" className="icon-btn" onClick={() => shift(-1)} aria-label={t('calendar.prev')}>
            ‹
          </button>
          <h2 className="cal-month-title">{monthTitle(i18n.language, month.y, month.m)}</h2>
          <button type="button" className="icon-btn" onClick={() => shift(1)} aria-label={t('calendar.next')}>
            ›
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setMonth({ y: today.y, m: today.m })}>
            {t('calendar.thisMonth')}
          </button>
        </div>
        <MonthGrid year={month.y} month={month.m} events={monthEvents} today={today} tree={tree} />
        <p className="muted small">{t('calendar.onlyExact')}</p>
      </section>

      {icsOpen && <IcsDialog onClose={() => setIcsOpen(false)} />}
    </div>
  );
}

/** «Ноябрь 2026 г.» — заглавная только первая буква (CSS capitalize задел бы и «г.») */
function monthTitle(lang: string, y: number, m: number): string {
  const s = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MonthGrid({
  year,
  month,
  events,
  today,
  tree,
}: {
  year: number;
  month: number;
  events: Occurrence[];
  today: { y: number; m: number; d: number };
  tree: TreeData;
}) {
  const { i18n, t } = useTranslation();
  const text = useOccurrenceText();
  const namesOf = useNamesOf();
  // Неделя с понедельника (как принято в России и Европе), в английском — с воскресенья
  const mondayFirst = i18n.resolvedLanguage !== 'en';
  const first = new Date(year, month - 1, 1).getDay(); // 0 — воскресенье
  const offset = mondayFirst ? (first + 6) % 7 : first;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(new Date(2024, 0, mondayFirst ? 1 + i : 7 + i)),
  );

  return (
    <div className="cal-grid" role="grid">
      {weekdays.map((w) => (
        <div key={w} className="cal-weekday" role="columnheader">
          {w}
        </div>
      ))}
      {cells.map((day, i) => {
        if (day === null) return <div key={`e${i}`} className="cal-cell empty" />;
        const list = events.filter((e) => e.date.d === day);
        const isToday = year === today.y && month === today.m && day === today.d;
        return (
          <div key={day} className={isToday ? 'cal-cell is-today' : 'cal-cell'} role="gridcell">
            <span className="cal-day">{day}</span>
            {list.slice(0, 3).map((o) => (
              <button
                key={`${o.kind}-${o.familyId ?? o.personIds[0]}`}
                type="button"
                className={o.jubilee ? 'cal-chip jubilee' : 'cal-chip'}
                title={`${namesOf(tree, o)} — ${text(o)}`}
                onClick={() => select(o.personIds[0])}
              >
                {ICON[o.kind]} {tree.people[o.personIds[0]!]?.names.given ?? t('common.unnamed')}
              </button>
            ))}
            {list.length > 3 && <span className="muted small">+{list.length - 3}</span>}
          </div>
        );
      })}
    </div>
  );
}

// Закрытые напоминания (на время работы с приложением)
const dismissed = new Set<string>();

/** Полоса «Сегодня: день рождения у …» вверху рабочего места */
export function TodayBanner() {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const text = useOccurrenceText();
  const namesOf = useNamesOf();
  const today = todayYMD();
  const key = `${tree.id}|${today.y}-${today.m}-${today.d}`;
  const [, rerender] = useState(0);
  const list = useMemo(() => upcoming(tree, today, 0), [tree, today.y, today.m, today.d]);
  if (!list.length || dismissed.has(key)) return null;

  return (
    <div className="banner banner-info" role="status">
      <span>
        <strong>{t('calendar.today')}:</strong>{' '}
        {list.map((o, i) => (
          <span key={`${o.kind}-${o.familyId ?? o.personIds[0]}`}>
            {i > 0 && '; '}
            {ICON[o.kind]}{' '}
            <button type="button" className="link-btn" onClick={() => select(o.personIds[0])}>
              {namesOf(tree, o)}
            </button>{' '}
            — {text(o)}
          </span>
        ))}
      </span>
      <button
        type="button"
        className="icon-btn icon-btn-small"
        aria-label={t('common.close')}
        onClick={() => {
          dismissed.add(key);
          rerender((n) => n + 1);
        }}
      >
        ×
      </button>
    </div>
  );
}

/** Экспорт дат в календарь телефона/Google (.ics) */
function IcsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const [memorial, setMemorial] = useState(true);

  const run = () => {
    const { text, count } = buildIcs(tree, {
      includeMemorial: memorial,
      calendarName: `${tree.name} — KinMap`,
      summary: (e, names) => `${ICON[e.kind]} ${t(`calendar.icsKind.${e.kind}`, { names, year: e.year })}`,
    });
    const name = fileNameFor(tree.name).replace(/\.kinmap$/, '.ics');
    download(new TextEncoder().encode(text), name, 'text/calendar');
    notify('calendar.icsDone', { count, name });
    onClose();
  };

  return (
    <Modal
      title={t('calendar.toPhone')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} data-autofocus>
            {t('gedcom.download')}
          </button>
        </>
      }
    >
      <p>{t('calendar.icsHint')}</p>
      <label className="checkbox">
        <input type="checkbox" checked={memorial} onChange={(e) => setMemorial(e.target.checked)} />
        <span>{t('calendar.icsMemorial')}</span>
      </label>
      <p className="muted small">{t('calendar.icsPrivacy')}</p>
    </Modal>
  );
}
