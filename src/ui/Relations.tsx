import { Plus, Unlink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setChildRelation, unlinkChild, unlinkParent, unlinkPartner, updateFamily } from '../model/ops';
import { parentsOf, siblingsOf, unionsOf } from '../model/queries';
import type { ChildRelation, Family, Person, UnionStatus } from '../model/types';
import { apply, select, useApp } from '../state/store';
import { DateField } from './DateField';
import { lifespan, useNameOf } from './format';
import { Avatar } from './media';
import { useAddRelative } from './useAddRelative';

// Родные человека: родители, союзы с детьми, братья и сёстры.

const RELATIONS: ChildRelation[] = ['birth', 'adopted', 'foster', 'unknown'];
const STATUSES: UnionStatus[] = ['married', 'partners', 'divorced', 'widowed', 'unknown'];
const REL_KEY: Record<ChildRelation, string> = {
  birth: 'relBirth',
  adopted: 'relAdopted',
  foster: 'relFoster',
  unknown: 'relUnknown',
};
const STATUS_KEY: Record<UnionStatus, string> = {
  married: 'statusMarried',
  partners: 'statusPartners',
  divorced: 'statusDivorced',
  widowed: 'statusWidowed',
  unknown: 'statusUnknown',
};

export function Relations({ person }: { person: Person }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const { add, dialog } = useAddRelative();
  const id = person.id;

  const parents = parentsOf(tree, id);
  const unions = unionsOf(tree, id);
  const siblings = siblingsOf(tree, id);
  const birthParents = parents.filter((p) => p.relation === 'birth');
  const hasFather = birthParents.some((p) => p.person.sex === 'M');
  const hasMother = birthParents.some((p) => p.person.sex === 'F');

  // Обычные функции, а не компоненты: иначе при каждом изменении они пересоздаются и теряют фокус
  const personLink = (p: Person, extra?: string) => (
    <button type="button" className="rel-person" onClick={() => select(p.id)}>
      <Avatar person={p} size={30} />
      <span className="rel-person-text">
        <span>{nameOf(p)}</span>
        <span className="muted small">{[extra, lifespan(p)].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );

  const relationSelect = (familyId: string, childId: string, value: ChildRelation) => (
    <select
      className="select-small"
      aria-label={t('relations.relation')}
      value={value}
      onChange={(e) => apply((tr) => setChildRelation(tr, familyId, childId, e.target.value as ChildRelation))}
    >
      {RELATIONS.map((r) => (
        <option key={r} value={r}>
          {t(`relations.${REL_KEY[r]}`)}
        </option>
      ))}
    </select>
  );

  const unlinkButton = (onClick: () => void, label?: string) => (
    <button type="button" className="icon-btn icon-btn-small" onClick={onClick} title={label ?? t('relations.unlink')} aria-label={label ?? t('relations.unlink')}>
      <Unlink size={15} strokeWidth={1.75} />
    </button>
  );

  const addButton = (label: string, onClick: () => void) => (
    <button type="button" className="chip-btn" onClick={onClick}>
      <Plus size={14} strokeWidth={2} /> {label}
    </button>
  );

  return (
    <div className="relations">
      <section className="rel-section">
        <h3>{t('relations.parents')}</h3>
        <ul className="rel-list">
          {parents.map((p) => (
            <li key={`${p.familyId}-${p.person.id}`} className="rel-row">
              {personLink(p.person)}
              {relationSelect(p.familyId, id, p.relation)}
              {unlinkButton(() => apply((tr) => unlinkParent(tr, id, p.person.id)))}
            </li>
          ))}
        </ul>
        <div className="rel-actions">
          {!hasFather && birthParents.length < 2 && addButton(t('relations.father'), () => add(id, 'father'))}
          {!hasMother && birthParents.length < 2 && addButton(t('relations.mother'), () => add(id, 'mother'))}
        </div>
      </section>

      <section className="rel-section">
        <h3>{t('relations.families')}</h3>
        {unions.map((f) => unionCard(f))}
        <div className="rel-actions">
          {addButton(t('relations.spouse'), () => add(id, 'spouse'))}
          {!unions.some((f) => f.partners.length === 1) && addButton(t('relations.childOther'), () => add(id, 'child'))}
        </div>
      </section>

      <section className="rel-section">
        <h3>{t('relations.siblings')}</h3>
        <ul className="rel-list">
          {siblings.full.map((p) => (
            <li key={p.id} className="rel-row">
              {personLink(p)}
            </li>
          ))}
          {siblings.half.map((p) => (
            <li key={p.id} className="rel-row">
              {personLink(p, t('relations.halfShort'))}
            </li>
          ))}
        </ul>
        <div className="rel-actions">{addButton(t('relations.sibling'), () => add(id, 'sibling'))}</div>
      </section>

      {dialog}
    </div>
  );

  // Обычная функция (не компонент) — см. комментарий выше про потерю фокуса
  function unionCard(f: Family) {
    const personId = id;
    const partnerId = f.partners.find((p) => p !== personId);
    const partner = partnerId ? tree.people[partnerId] : undefined;
    return (
      <div className="union-card" key={f.id}>
        <div className="union-head">
          {partner ? (
            <>
              {personLink(partner)}
              <select
                className="select-small"
                aria-label={t('relations.status')}
                value={f.status}
                onChange={(e) => apply((tr) => updateFamily(tr, f.id, (x) => ({ ...x, status: e.target.value as UnionStatus })))}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`relations.${STATUS_KEY[s]}`)}
                  </option>
                ))}
              </select>
              {unlinkButton(() => apply((tr) => unlinkPartner(tr, f.id, partner.id)), t('relations.unlinkSpouse'))}
            </>
          ) : (
            <>
              <span className="muted">{t('relations.noSpouse')}</span>
              {addButton(t('relations.setSecondParent'), () => add(personId, { secondParent: f.id }))}
            </>
          )}
        </div>
        {partner && (
          <div className="union-date">
            <DateField
              id={`field-marriage-${f.id}`}
              label={t('relations.marriageDate')}
              value={f.marriage?.date}
              onCommit={(date) =>
                apply((tr) =>
                  updateFamily(tr, f.id, (x) => {
                    const marriage = { ...x.marriage, date };
                    if (!date) delete marriage.date;
                    const next: Family = { ...x, marriage };
                    if (!marriage.date && !marriage.place) delete next.marriage;
                    return next;
                  }),
                )
              }
            />
          </div>
        )}
        {f.children.length > 0 && (
          <ul className="rel-list rel-children">
            {f.children.map((c) => {
              const child = tree.people[c.id];
              return child ? (
                <li key={c.id} className="rel-row">
                  {personLink(child)}
                  {relationSelect(f.id, c.id, c.relation)}
                  {unlinkButton(() => apply((tr) => unlinkChild(tr, f.id, c.id)))}
                </li>
              ) : null;
            })}
          </ul>
        )}
        <div className="rel-actions">{addButton(t('relations.child'), () => add(personId, { childIn: f.id }))}</div>
      </div>
    );
  }
}
