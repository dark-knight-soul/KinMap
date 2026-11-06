import {
  Armchair,
  BookOpen,
  Briefcase,
  ChevronDown,
  Droplet,
  Flower2,
  GraduationCap,
  House,
  Medal,
  PlaneLanding,
  PlaneTakeoff,
  Plus,
  Shield,
  Star,
  Trash,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatFuzzyDate } from '../model/dates';
import { EVENT_TYPES, isEmptyEvent, newEventId, sortEvents } from '../model/events';
import { updatePerson } from '../model/ops';
import type { Person, PersonEvent, PersonEventType } from '../model/types';
import { apply } from '../state/store';
import { DateField } from './DateField';
import { useDateLocale } from './format';

// События жизни в карточке человека: учёба, служба, работа, переезды, награды…
// Список по датам; щелчок по событию раскрывает поля для правки.

export const EVENT_ICON: Record<PersonEventType, LucideIcon> = {
  education: BookOpen,
  graduation: GraduationCap,
  military: Shield,
  work: Briefcase,
  residence: House,
  award: Medal,
  baptism: Droplet,
  burial: Flower2,
  emigration: PlaneTakeoff,
  immigration: PlaneLanding,
  retirement: Armchair,
  other: Star,
};

/** Подпись к событию одной строкой: «Окончание учёбы · 1977 · Ташкент» */
export function useEventSummary() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  return (e: PersonEvent) => [t(`events.types.${e.type}`), formatFuzzyDate(e.date, locale), e.place].filter(Boolean).join(' · ');
}

export function LifeEventsSection({ person }: { person: Person }) {
  const { t } = useTranslation();
  const summary = useEventSummary();
  const [open, setOpen] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const id = person.id;
  const list = sortEvents(person.events ?? []);

  const save = (fn: (events: PersonEvent[]) => PersonEvent[], key?: string) =>
    apply(
      (tr) =>
        updatePerson(tr, id, (p) => {
          const events = fn(p.events ?? []);
          const next: Person = { ...p, events };
          if (!events.length) delete next.events;
          return next;
        }),
      key ? `${id}.events.${key}` : undefined,
    );
  /** Изменить одно поле события; пустое значение — убрать поле */
  const patch = (eventId: string, field: 'type' | 'title' | 'date' | 'place' | 'note') => (value: PersonEvent[typeof field]) =>
    save(
      (evs) =>
        evs.map((e) => {
          if (e.id !== eventId) return e;
          const next = { ...e, [field]: value } as PersonEvent;
          if ((value === undefined || value === '') && field !== 'type') delete next[field];
          return next;
        }),
      `${eventId}.${field}`,
    );
  const add = (type: PersonEventType) => {
    const ev: PersonEvent = { id: newEventId(), type };
    save((evs) => [...evs, ev]);
    setOpen(ev.id);
    setMenu(false);
  };
  /** Закрыть событие; совсем пустое — убрать (его добавили и ничего не заполнили) */
  const close = (e: PersonEvent) => {
    setOpen(null);
    if (isEmptyEvent(e)) save((evs) => evs.filter((x) => x.id !== e.id));
  };

  return (
    <section className="life-events">
      <div className="life-events-head">
        <h3 className="form-subtitle">{t('events.title')}</h3>
        <div className="menu">
          <button type="button" className="chip-btn" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <Plus size={15} strokeWidth={1.75} /> {t('events.add')}
          </button>
          {menu && (
            <>
              <div className="menu-backdrop" onClick={() => setMenu(false)} />
              <div className="menu-list events-menu" role="menu">
                {EVENT_TYPES.map((type) => {
                  const Icon = EVENT_ICON[type];
                  return (
                    <button key={type} type="button" role="menuitem" className="menu-item" onClick={() => add(type)}>
                      <Icon size={16} strokeWidth={1.75} /> {t(`events.types.${type}`)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
      {list.length === 0 && <p className="muted small">{t('events.empty')}</p>}
      <ol className="event-list">
        {list.map((e) => {
          const Icon = EVENT_ICON[e.type];
          const isOpen = open === e.id;
          return (
            <li key={e.id} className={isOpen ? 'event-item open' : 'event-item'}>
              <button type="button" className="event-row" aria-expanded={isOpen} onClick={() => (isOpen ? close(e) : setOpen(e.id))}>
                <span className="event-icon">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span className="event-text">
                  {e.title && <strong>{e.title}</strong>}
                  <span className="muted small">{summary(e)}</span>
                </span>
                <ChevronDown size={16} strokeWidth={1.75} className="event-chevron" />
              </button>
              {isOpen && (
                <div className="event-form form-stack">
                  <label className="field">
                    <span>{t('events.type')}</span>
                    <select value={e.type} onChange={(x) => patch(e.id, 'type')(x.target.value as PersonEventType)}>
                      {EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`events.types.${type}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>{t(`events.titleLabel.${e.type}`)}</span>
                    <input value={e.title ?? ''} onChange={(x) => patch(e.id, 'title')(x.target.value)} autoFocus={!e.title && !e.date} />
                  </label>
                  <div className="form-grid form-grid-2">
                    <DateField id={`ev-${e.id}-date`} label={t('person.date')} value={e.date} onCommit={(d) => patch(e.id, 'date')(d)} />
                    <label className="field">
                      <span>{t('person.place')}</span>
                      <input value={e.place ?? ''} onChange={(x) => patch(e.id, 'place')(x.target.value)} />
                    </label>
                  </div>
                  <label className="field">
                    <span>{t('events.note')}</span>
                    <textarea rows={3} value={e.note ?? ''} onChange={(x) => patch(e.id, 'note')(x.target.value)} />
                  </label>
                  <div className="event-actions">
                    <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => save((evs) => evs.filter((x) => x.id !== e.id))}>
                      <Trash size={15} strokeWidth={1.75} /> {t('events.delete')}
                    </button>
                    <button type="button" className="btn btn-small" onClick={() => close(e)}>
                      {t('events.done')}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
