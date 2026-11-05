import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addPartnerToFamily,
  addPerson,
  linkChild,
  linkParent,
  linkPartners,
  setChildRelation,
  unlinkChild,
  unlinkParent,
  unlinkPartner,
  updateFamily,
} from '../model/ops';
import { childrenOf, parentsOf, siblingsOf, spousesOf, unionsOf } from '../model/queries';
import type { ChildRelation, Family, Person, PersonId, Sex, TreeData, UnionStatus } from '../model/types';
import { apply, select, useApp } from '../state/store';
import { DateField } from './DateField';
import { lifespan, useNameOf } from './format';
import { PersonPicker, type PickChoice } from './PersonPicker';

// Связи человека: родители, союзы с детьми, братья и сёстры.
// Добавление идёт через окно выбора: новый человек или уже есть в древе.

interface PickerState {
  title: string;
  defaults: { sex?: Sex; surname?: string };
  exclude: PersonId[];
  link: (tree: TreeData, otherId: PersonId) => TreeData;
}

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
  const [picker, setPicker] = useState<PickerState | null>(null);
  const id = person.id;

  const parents = parentsOf(tree, id);
  const unions = unionsOf(tree, id);
  const siblings = siblingsOf(tree, id);
  const birthParents = parents.filter((p) => p.relation === 'birth');
  const hasFather = birthParents.some((p) => p.person.sex === 'M');
  const hasMother = birthParents.some((p) => p.person.sex === 'F');
  const surname = person.names.surname;

  const onPick = (choice: PickChoice) => {
    if (!picker) return;
    const p = picker;
    setPicker(null);
    apply((tr) => {
      let next = tr;
      let otherId: PersonId;
      if ('create' in choice) {
        const r = addPerson(next, choice.create);
        next = r.tree;
        otherId = r.id;
      } else {
        otherId = choice.existing;
      }
      return p.link(next, otherId);
    });
  };

  const openPicker = (title: string, defaults: PickerState['defaults'], exclude: PersonId[], link: PickerState['link']) =>
    setPicker({ title, defaults, exclude: [id, ...exclude], link });

  const addParent = (sex: Sex) =>
    openPicker(
      t(sex === 'M' ? 'picker.titleFather' : sex === 'F' ? 'picker.titleMother' : 'picker.titleParent'),
      { sex, surname: sex === 'M' ? surname : undefined },
      parents.map((p) => p.person.id),
      (tr, pid) => linkParent(tr, id, pid).tree,
    );

  const addSpouse = () =>
    openPicker(
      t('picker.titleSpouse'),
      { sex: person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined },
      spousesOf(tree, id).map((s) => s.person.id),
      (tr, pid) => linkPartners(tr, id, pid).tree,
    );

  // Фамилия ребёнка по умолчанию — по отцу
  const childSurname = (fatherCandidate?: Person) =>
    person.sex === 'M' ? surname : fatherCandidate?.sex === 'M' ? fatherCandidate.names.surname : surname;

  const addChildTo = (familyId: string, partner?: Person) =>
    openPicker(
      t('picker.titleChild'),
      { surname: childSurname(partner) },
      childrenOf(tree, id).map((c) => c.person.id),
      (tr, pid) => linkChild(tr, id, pid, { familyId }).tree,
    );

  const addChildOther = () =>
    openPicker(
      t('picker.titleChild'),
      { surname: childSurname() },
      childrenOf(tree, id).map((c) => c.person.id),
      (tr, pid) => {
        const single = unionsOf(tr, id).find((f) => f.partners.length === 1);
        return single ? linkChild(tr, id, pid, { familyId: single.id }).tree : linkParent(tr, pid, id).tree;
      },
    );

  const setSecondParent = (familyId: string) =>
    openPicker(
      t('picker.titleSecondParent'),
      { sex: person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined },
      [],
      (tr, pid) => addPartnerToFamily(tr, familyId, pid),
    );

  // Обычные функции, а не компоненты: иначе при каждом изменении они пересоздаются и теряют фокус
  const personLink = (p: Person) => (
    <button type="button" className="link-btn person-link" onClick={() => select(p.id)}>
      <span className={`sex-dot sex-${p.sex}`} aria-hidden="true" />
      {nameOf(p)}
      {lifespan(p) && <span className="muted small"> {lifespan(p)}</span>}
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
    <button
      type="button"
      className="icon-btn icon-btn-small"
      onClick={onClick}
      title={label ?? t('relations.unlink')}
      aria-label={label ?? t('relations.unlink')}
    >
      ×
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
          {!hasFather && (
            <button type="button" className="btn btn-small" onClick={() => addParent('M')}>
              {t('relations.addFather')}
            </button>
          )}
          {!hasMother && (
            <button type="button" className="btn btn-small" onClick={() => addParent('F')}>
              {t('relations.addMother')}
            </button>
          )}
          {birthParents.length < 2 && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => addParent('U')}>
              {t('relations.addParent')}
            </button>
          )}
        </div>
      </section>

      <section className="rel-section">
        <h3>{t('relations.families')}</h3>
        {unions.map((f) => {
          const partnerId = f.partners.find((p) => p !== id);
          const partner = partnerId ? tree.people[partnerId] : undefined;
          return (
            <div key={f.id} className="union-card">
              <div className="union-head">
                {partner ? (
                  <>
                    <span className="muted small">{t('relations.spouse')}:</span>
                    {personLink(partner)}
                    <select
                      className="select-small"
                      aria-label={t('relations.status')}
                      value={f.status}
                      onChange={(e) =>
                        apply((tr) => updateFamily(tr, f.id, (x) => ({ ...x, status: e.target.value as UnionStatus })))
                      }
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
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => setSecondParent(f.id)}>
                      {t('relations.setSecondParent')}
                    </button>
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
              <ul className="rel-list">
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
              <button type="button" className="btn btn-small" onClick={() => addChildTo(f.id, partner)}>
                {t('relations.addChild')}
              </button>
            </div>
          );
        })}
        <div className="rel-actions">
          <button type="button" className="btn btn-small" onClick={addSpouse}>
            {t('relations.addSpouse')}
          </button>
          {!unions.some((f) => f.partners.length === 1) && (
            <button type="button" className="btn btn-small btn-ghost" onClick={addChildOther}>
              {t('relations.addChildOther')}
            </button>
          )}
        </div>
      </section>

      {(siblings.full.length > 0 || siblings.half.length > 0) && (
        <section className="rel-section">
          <h3>{t('relations.siblings')}</h3>
          <ul className="rel-list">
            {siblings.full.map((p) => (
              <li key={p.id} className="rel-row">
                {personLink(p)}
              </li>
            ))}
          </ul>
          {siblings.half.length > 0 && (
            <>
              <h4 className="muted small">{t('relations.halfSiblings')}</h4>
              <ul className="rel-list">
                {siblings.half.map((p) => (
                  <li key={p.id} className="rel-row">
                    {personLink(p)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {picker && (
        <PersonPicker
          title={picker.title}
          defaults={picker.defaults}
          exclude={picker.exclude}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

