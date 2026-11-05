import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  addPartnerToFamily,
  addPerson,
  linkChild,
  linkParent,
  linkPartners,
  linkSibling,
} from '../model/ops';
import { childrenOf, parentsOf, siblingsOf, spousesOf, unionsOf } from '../model/queries';
import type { Person, PersonId, Sex, TreeData } from '../model/types';
import { apply, getState, select } from '../state/store';
import { useNameOf } from './format';
import { PersonPicker, type PickChoice } from './PersonPicker';

// Добавление родственника — общее для карточки человека, кнопок «+» на схеме
// и меню правой кнопки. Открывает окно выбора «новый человек или уже есть в древе».

export type RelativeKind =
  | 'father'
  | 'mother'
  | 'parent'
  | 'spouse'
  | 'child'
  | 'sibling'
  | { childIn: string }
  | { secondParent: string };

interface PickerState {
  title: string;
  defaults: { sex?: Sex; surname?: string };
  exclude: PersonId[];
  /** Выбор «второй родитель» для ребёнка, если у человека несколько союзов */
  familyChoices?: { value: string; label: string }[];
  link: (tree: TreeData, otherId: PersonId, family?: string) => TreeData;
}

const NO_FAMILY = '';

export function useAddRelative() {
  const { t } = useTranslation();
  const nameOf = useNameOf();
  const [picker, setPicker] = useState<PickerState | null>(null);

  const add = (personId: PersonId, kind: RelativeKind) => {
    const tree = getState().session?.history.present;
    const person = tree?.people[personId];
    if (!tree || !person) return;
    const surname = person.names.surname;
    const opposite: Sex | undefined = person.sex === 'M' ? 'F' : person.sex === 'F' ? 'M' : undefined;
    const open = (s: Omit<PickerState, 'exclude'> & { exclude?: PersonId[] }) =>
      setPicker({ ...s, exclude: [personId, ...(s.exclude ?? [])] });
    // Фамилия ребёнка по умолчанию — по отцу
    const childSurname = (partner?: Person) =>
      person.sex === 'M' ? surname : partner?.sex === 'M' ? partner.names.surname : surname;
    const children = childrenOf(tree, personId).map((c) => c.person.id);

    if (kind === 'father' || kind === 'mother' || kind === 'parent') {
      const sex: Sex = kind === 'father' ? 'M' : kind === 'mother' ? 'F' : 'U';
      open({
        title: t(kind === 'father' ? 'picker.titleFather' : kind === 'mother' ? 'picker.titleMother' : 'picker.titleParent'),
        // Фамилию подставляем отцу и «родителю вообще» (чаще всего первым добавляют отца)
        defaults: { sex, surname: sex === 'F' ? undefined : surname },
        exclude: parentsOf(tree, personId).map((p) => p.person.id),
        link: (tr, pid) => linkParent(tr, personId, pid).tree,
      });
    } else if (kind === 'spouse') {
      open({
        title: t('picker.titleSpouse'),
        defaults: { sex: opposite },
        exclude: spousesOf(tree, personId).map((s) => s.person.id),
        link: (tr, pid) => linkPartners(tr, personId, pid).tree,
      });
    } else if (kind === 'sibling') {
      open({
        title: t('picker.titleSibling'),
        defaults: { surname },
        exclude: [...siblingsOf(tree, personId).full, ...siblingsOf(tree, personId).half].map((p) => p.id),
        link: (tr, pid) => linkSibling(tr, personId, pid).tree,
      });
    } else if (kind === 'child') {
      // Ребёнок «вообще»: если союзов несколько — спросим, от кого
      const unions = unionsOf(tree, personId).filter((f) => f.partners.length === 2);
      const partnerOf = (fid: string) => tree.people[tree.families[fid]!.partners.find((p) => p !== personId)!];
      const choices = [
        ...unions.map((f) => ({ value: f.id, label: nameOf(partnerOf(f.id)) })),
        { value: NO_FAMILY, label: t('picker.otherParentUnknown') },
      ];
      open({
        title: t('picker.titleChild'),
        defaults: { surname: childSurname(unions[0] ? partnerOf(unions[0].id) : undefined) },
        exclude: children,
        familyChoices: unions.length ? choices : undefined,
        link: (tr, pid, fid) => {
          const familyId = fid ?? unions[0]?.id ?? NO_FAMILY;
          if (familyId) return linkChild(tr, personId, pid, { familyId }).tree;
          const single = unionsOf(tr, personId).find((f) => f.partners.length === 1);
          return single ? linkChild(tr, personId, pid, { familyId: single.id }).tree : linkParent(tr, pid, personId).tree;
        },
      });
    } else if ('childIn' in kind) {
      const fam = tree.families[kind.childIn];
      const partner = fam ? tree.people[fam.partners.find((p) => p !== personId) ?? ''] : undefined;
      open({
        title: t('picker.titleChild'),
        defaults: { surname: childSurname(partner) },
        exclude: children,
        link: (tr, pid) => linkChild(tr, personId, pid, { familyId: kind.childIn }).tree,
      });
    } else {
      open({
        title: t('picker.titleSecondParent'),
        defaults: { sex: opposite },
        link: (tr, pid) => addPartnerToFamily(tr, kind.secondParent, pid),
      });
    }
  };

  const onPick = (choice: PickChoice, family?: string) => {
    if (!picker) return;
    const p = picker;
    setPicker(null);
    let createdId: PersonId | undefined;
    const ok = apply((tr) => {
      let next = tr;
      let otherId: PersonId;
      if ('create' in choice) {
        const r = addPerson(next, choice.create);
        next = r.tree;
        otherId = r.id;
        createdId = r.id;
      } else {
        otherId = choice.existing;
      }
      return p.link(next, otherId, family);
    });
    // Нового человека сразу выбираем — можно дописать даты и фото
    if (ok && createdId) select(createdId);
  };

  const dialog = picker ? (
    <PersonPicker
      title={picker.title}
      defaults={picker.defaults}
      exclude={picker.exclude}
      familyChoices={picker.familyChoices}
      onPick={onPick}
      onClose={() => setPicker(null)}
    />
  ) : null;

  return { add, dialog };
}
