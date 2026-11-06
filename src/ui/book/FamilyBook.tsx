import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaStore } from '../../file/format';
import { approxYear, formatFuzzyDate, type DateLocale } from '../../model/dates';
import { sortEvents } from '../../model/events';
import { ancestorReport, descendantReport, type AncEntry, type DescEntry } from '../../model/reports';
import { childrenOf, fullName, isLiving, parentsOf, sortKey, spousesOf } from '../../model/queries';
import type { LifeEvent, Person, PersonId, TreeData } from '../../model/types';
import { useDateLocale } from '../format';
import { urlFor } from '../media';

// «Книга семьи» для печати и сохранения в PDF: обложка, содержание, родословные росписи,
// жизнеописания с фото и событиями, указатель имён. Это обычный HTML-текст:
// браузер сам разбивает его на страницы (поля и номера страниц — в правиле @page).

export interface BookOptions {
  mainId: PersonId;
  progenitorId: PersonId;
  descendants: boolean;
  ancestors: boolean;
  biographies: boolean;
  index: boolean;
  descGen: number;
  ancGen: number;
  /** Скрыть сведения о живых: только имя */
  hideLiving: boolean;
  photos: boolean;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

export function FamilyBook({ tree, media, opts }: { tree: TreeData; media: MediaStore; opts: BookOptions }) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const year = new Date().getFullYear();
  const desc = useMemo(() => (opts.descendants ? descendantReport(tree, opts.progenitorId, opts.descGen) : []), [tree, opts]);
  const anc = useMemo(() => (opts.ancestors ? ancestorReport(tree, opts.mainId, opts.ancGen) : []), [tree, opts]);

  // Кто попадает в книгу: все из росписей и их супруги; если росписей нет — всё древо
  const people = useMemo(() => {
    const ids = new Set<PersonId>();
    for (const e of desc) {
      ids.add(e.personId);
      for (const u of e.unions) if (u.spouseId) ids.add(u.spouseId);
    }
    for (const e of anc) ids.add(e.personId);
    if (!opts.descendants && !opts.ancestors) for (const id of Object.keys(tree.people)) ids.add(id);
    return [...ids].map((id) => tree.people[id]!).filter(Boolean).sort((a, b) => sortKey(a).localeCompare(sortKey(b), locale));
  }, [desc, anc, opts, tree, locale]);

  // Номера человека в росписях — для указателя и жизнеописаний
  const refs = useMemo(() => {
    const m = new Map<PersonId, string[]>();
    const add = (id: PersonId, r: string) => m.set(id, [...(m.get(id) ?? []), r]);
    for (const e of desc) if (!e.seeNum) add(e.personId, e.num);
    for (const e of anc) if (e.seeNum === undefined) add(e.personId, `№ ${e.num}`);
    return m;
  }, [desc, anc]);

  const hidden = (p: Person) => opts.hideLiving && isLiving(p, year);
  const name = (p: Person | undefined) => (p ? fullName(p) || t('common.unnamed') : '');
  const date = (ev: LifeEvent | undefined) => formatFuzzyDate(ev?.date, locale);
  const lifeLine = (p: Person) => {
    if (hidden(p)) return '';
    const parts: string[] = [];
    const b = [date(p.birth), p.birth?.place].filter(Boolean).join(', ');
    const d = [date(p.death), p.death?.place].filter(Boolean).join(', ');
    if (b) parts.push(`${t('book.born')} ${b}`);
    if (d) parts.push(`${t('book.died')} ${d}`);
    else if (p.death || p.living === false) parts.push(t('book.diedUnknown'));
    return parts.join('; ');
  };
  const short = (p: Person | undefined) => {
    if (!p) return '';
    if (hidden(p)) return name(p);
    const b = approxYear(p.birth?.date);
    const d = approxYear(p.death?.date);
    const years = b || d ? ` (${b ?? '?'}${d ? `–${d}` : p.death || p.living === false ? '–?' : ''})` : '';
    return name(p) + years;
  };
  const spouseWord = (p: Person | undefined) => t(p?.sex === 'F' ? 'book.wife' : p?.sex === 'M' ? 'book.husband' : 'book.spouse');
  const photoOf = (p: Person) => {
    const ph = p.photos?.[0];
    const bytes = ph && media[ph.id];
    return opts.photos && !hidden(p) && ph && bytes ? urlFor(bytes, ph.mime) : undefined;
  };

  const main = tree.people[opts.mainId];
  const progenitor = tree.people[opts.progenitorId];
  const gens = Math.max(desc.at(-1)?.gen ?? 0, (anc.at(-1)?.gen ?? -1) + 1);
  const today = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date());
  const coverPhoto = main && photoOf(main);

  const sections = [
    opts.descendants && { id: 'desc', title: t('book.descTitle', { name: name(progenitor) }) },
    opts.ancestors && { id: 'anc', title: t('book.ancTitle', { name: name(main) }) },
    opts.biographies && { id: 'bio', title: t('book.bioTitle') },
    opts.index && { id: 'idx', title: t('book.indexTitle') },
  ].filter(Boolean) as { id: string; title: string }[];

  return (
    <article className="book" lang={locale}>
      {/* Обложка */}
      <section className="book-cover">
        <p className="book-kicker">{t('book.kicker')}</p>
        <h1>{tree.name}</h1>
        {coverPhoto && <img className="book-cover-photo" src={coverPhoto} alt="" />}
        {main && <p className="book-cover-sub">{t('book.coverMain', { name: name(main) })}</p>}
        <p className="book-cover-meta">
          {t('book.coverPeople', { count: people.length })}
          {gens > 0 && ` · ${t('book.coverGens', { count: gens })}`}
        </p>
        <p className="book-cover-date">{t('book.compiled', { date: today })}</p>
      </section>

      {/* Содержание */}
      <section className="book-toc">
        <h2>{t('book.toc')}</h2>
        <ol>
          {sections.map((s) => (
            <li key={s.id}>{s.title}</li>
          ))}
        </ol>
        {opts.descendants && <p className="book-note">{t('book.descHint')}</p>}
        {opts.ancestors && <p className="book-note">{t('book.ancHint')}</p>}
        {opts.hideLiving && <p className="book-note">{t('book.livingHidden')}</p>}
      </section>

      {opts.descendants && (
        <section className="book-section">
          <h2>{sections.find((s) => s.id === 'desc')!.title}</h2>
          {groupBy(desc, (e) => e.gen).map(([gen, entries]) => (
            <div key={gen} className="book-gen">
              <h3>{t('book.generation', { n: locale === 'ru' ? (ROMAN[gen] ?? gen) : gen })}</h3>
              {entries.map((e) => (
                <DescRecord key={e.num} e={e} tree={tree} t={t} name={name} short={short} lifeLine={lifeLine} spouseWord={spouseWord} hidden={hidden} locale={locale} />
              ))}
            </div>
          ))}
        </section>
      )}

      {opts.ancestors && (
        <section className="book-section">
          <h2>{sections.find((s) => s.id === 'anc')!.title}</h2>
          {groupBy(anc, (e) => e.gen).map(([gen, entries]) => (
            <div key={gen} className="book-gen">
              <h3>{ancGenTitle(t, gen)}</h3>
              {entries.map((e) => (
                <AncRecord key={e.num} e={e} tree={tree} t={t} name={name} lifeLine={lifeLine} hidden={hidden} />
              ))}
            </div>
          ))}
        </section>
      )}

      {opts.biographies && (
        <section className="book-section">
          <h2>{t('book.bioTitle')}</h2>
          {people.map((p) => (
            <Biography key={p.id} p={p} tree={tree} t={t} name={name} short={short} lifeLine={lifeLine} spouseWord={spouseWord} hidden={hidden(p)} photo={photoOf(p)} refs={refs.get(p.id)} locale={locale} />
          ))}
        </section>
      )}

      {opts.index && (
        <section className="book-section book-index">
          <h2>{t('book.indexTitle')}</h2>
          <ul>
            {people.map((p) => (
              <li key={p.id}>
                <span>{indexName(p) || t('common.unnamed')}</span>
                {!hidden(p) && <span className="book-muted"> {shortYears(p)}</span>}
                <span className="book-refs">{(refs.get(p.id) ?? []).join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="book-footer">{t('book.footer', { date: today })}</p>
    </article>
  );
}

type T = (key: string, opts?: Record<string, unknown>) => string;

function groupBy<E>(list: E[], key: (e: E) => number): [number, E[]][] {
  const m = new Map<number, E[]>();
  for (const e of list) m.set(key(e), [...(m.get(key(e)) ?? []), e]);
  return [...m.entries()];
}

function ancGenTitle(t: T, gen: number): string {
  if (gen === 0) return t('book.ancSelf');
  if (gen === 1) return t('book.ancParents');
  if (gen === 2) return t('book.ancGrand');
  if (gen === 3) return t('book.ancGreat');
  return t('book.ancGen', { n: gen });
}

/** «Демидов Иван Петрович» — фамилия первой, для указателя */
function indexName(p: Person): string {
  return [p.names.surname, p.names.given, p.names.patronymic].filter(Boolean).join(' ');
}

function shortYears(p: Person): string {
  const b = approxYear(p.birth?.date);
  const d = approxYear(p.death?.date);
  return b || d ? `(${b ?? '?'}${d ? `–${d}` : ''})` : '';
}

const statusKey: Record<string, string> = {
  divorced: 'book.divorced',
  widowed: 'book.widowed',
  partners: 'book.partners',
};

function DescRecord({
  e,
  tree,
  t,
  name,
  short,
  lifeLine,
  spouseWord,
  hidden,
  locale,
}: {
  e: DescEntry;
  tree: TreeData;
  t: T;
  name: (p: Person | undefined) => string;
  short: (p: Person | undefined) => string;
  lifeLine: (p: Person) => string;
  spouseWord: (p: Person | undefined) => string;
  hidden: (p: Person) => boolean;
  locale: DateLocale;
}) {
  const p = tree.people[e.personId]!;
  if (e.seeNum) {
    return (
      <p className="book-rec">
        <b className="book-num">{e.num}.</b> <b>{name(p)}</b> — {t('book.see', { num: e.seeNum })}
      </p>
    );
  }
  const life = lifeLine(p);
  const unions = e.unions.filter((u) => u.spouseId || u.children.length);
  return (
    <div className="book-rec">
      <p>
        <b className="book-num">{e.num}.</b> <b>{name(p)}</b>
        {life && <> ({life})</>}.{!hidden(p) && p.occupation && <> {p.occupation}.</>}
      </p>
      {unions.map((u, i) => {
        const spouse = u.spouseId ? tree.people[u.spouseId] : undefined;
        const parents = spouse ? parentsOf(tree, spouse.id).map((x) => name(x.person)) : [];
        const marriage = !hidden(p) ? formatFuzzyDate(u.family.marriage?.date, locale) : '';
        const status = statusKey[u.family.status];
        return (
          <p key={u.family.id} className="book-union">
            {spouse ? (
              <>
                {unions.length > 1 && `${i + 1}) `}
                {spouseWord(spouse)}: <b>{short(spouse)}</b>
                {parents.length > 0 && <>, {t('book.parentsOf', { names: parents.join(t('book.and')) })}</>}
                {marriage && <>; {t('book.married', { date: marriage })}</>}
                {status && <>; {t(status)}</>}.
              </>
            ) : (
              <>{t('book.unknownSpouse')}.</>
            )}{' '}
            {u.children.length > 0 && (
              <>
                {t('book.children')}: {u.children.join(', ')}.
              </>
            )}
          </p>
        );
      })}
      {e.more && <p className="book-union book-muted">{t('book.more')}</p>}
    </div>
  );
}

function AncRecord({
  e,
  tree,
  t,
  name,
  lifeLine,
  hidden,
}: {
  e: AncEntry;
  tree: TreeData;
  t: T;
  name: (p: Person | undefined) => string;
  lifeLine: (p: Person) => string;
  hidden: (p: Person) => boolean;
}) {
  const p = tree.people[e.personId]!;
  if (e.seeNum !== undefined) {
    return (
      <p className="book-rec">
        <b className="book-num">{e.num}.</b> <b>{name(p)}</b> — {t('book.seeAnc', { num: e.seeNum })}
      </p>
    );
  }
  const life = lifeLine(p);
  return (
    <p className="book-rec">
      <b className="book-num">{e.num}.</b> <b>{name(p)}</b>
      {life && <> ({life})</>}.{!hidden(p) && p.occupation && <> {p.occupation}.</>}
    </p>
  );
}

function Biography({
  p,
  tree,
  t,
  name,
  short,
  lifeLine,
  spouseWord,
  hidden,
  photo,
  refs,
  locale,
}: {
  p: Person;
  tree: TreeData;
  t: T;
  name: (p: Person | undefined) => string;
  short: (p: Person | undefined) => string;
  lifeLine: (p: Person) => string;
  spouseWord: (p: Person | undefined) => string;
  hidden: boolean;
  photo?: string;
  refs?: string[];
  locale: DateLocale;
}) {
  const parents = parentsOf(tree, p.id).map((x) => short(x.person));
  const spouses = spousesOf(tree, p.id);
  const kids = childrenOf(tree, p.id).map((x) => short(x.person));
  const events = hidden ? [] : sortEvents(p.events ?? []);
  const life = lifeLine(p);
  return (
    <div className="book-bio">
      {photo && <img className="book-photo" src={photo} alt="" />}
      <h3>
        {name(p)}
        {refs?.length ? <span className="book-refs"> {refs.join(', ')}</span> : null}
      </h3>
      {life && <p className="book-life">{life}</p>}
      {hidden && <p className="book-muted">{t('book.livingShort')}</p>}
      {!hidden && p.occupation && (
        <p>
          <span className="book-label">{t('person.occupation')}:</span> {p.occupation}
        </p>
      )}
      {events.length > 0 && (
        <ul className="book-events">
          {events.map((ev) => (
            <li key={ev.id}>
              <span className="book-ev-date">{formatFuzzyDate(ev.date, locale) || '—'}</span>{' '}
              <span>
                {t(`events.types.${ev.type}`)}
                {ev.title && <>: {ev.title}</>}
                {ev.place && <>, {ev.place}</>}
                {ev.note && <span className="book-muted"> — {ev.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="book-family">
        {parents.length > 0 && (
          <>
            <span className="book-label">{t('book.parents')}:</span> {parents.join(', ')}.{' '}
          </>
        )}
        {spouses.map((s) => (
          <span key={s.family.id}>
            <span className="book-label">{spouseWord(s.person)}:</span> {short(s.person)}.{' '}
          </span>
        ))}
        {kids.length > 0 && (
          <>
            <span className="book-label">{t('book.children')}:</span> {kids.join(', ')}.
          </>
        )}
      </p>
      {!hidden && p.notes && (
        <div className="book-notes">
          {p.notes.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}
