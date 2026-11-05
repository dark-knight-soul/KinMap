import { Crosshair, Heart, Link2, PanelRightOpen, Trash, UserPlus, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CARD_H, CARD_W, type CardBox } from '../../layout/types';
import { removePerson } from '../../model/ops';
import { parentsOf } from '../../model/queries';
import type { TreeData } from '../../model/types';
import { apply, getState, select, setFocus, useApp } from '../../state/store';
import { closeContextMenu, useUi } from '../../state/ui';
import { useNameOf } from '../format';
import { KinshipDialog } from '../KinshipDialog';
import { ConfirmDialog } from '../Modal';
import type { RelativeKind } from '../useAddRelative';

// Быстрые действия с карточкой на схеме:
//  - кнопки «+» вокруг выбранной карточки (родитель сверху, супруг справа,
//    ребёнок снизу, брат/сестра слева);
//  - меню по правой кнопке мыши или долгому нажатию.

const R = 11;


/** Какой «родитель» добавить: отца, мать или (если нет обоих) любого */
export function parentKind(tree: TreeData, personId: string): RelativeKind | null {
  const birth = parentsOf(tree, personId).filter((p) => p.relation === 'birth');
  if (birth.length >= 2) return null;
  const hasFather = birth.some((p) => p.person.sex === 'M');
  const hasMother = birth.some((p) => p.person.sex === 'F');
  if (!birth.length) return 'parent';
  return hasFather ? 'mother' : hasMother ? 'father' : 'parent';
}

/** «Добавить отца» / «Добавить мать» / «Добавить родителя» */
function parentTitle(t: (k: string) => string, kind: RelativeKind): string {
  return t(kind === 'father' ? 'quick.father' : kind === 'mother' ? 'quick.mother' : 'quick.parent');
}

/** Кнопки «+» вокруг выбранной карточки (внутри SVG схемы) */
export function QuickAdd({
  box,
  tree,
  onAdd,
  scale,
}: {
  box: CardBox;
  tree: TreeData;
  onAdd: (personId: string, kind: RelativeKind) => void;
  /** Текущий масштаб схемы — кнопки держим одного размера на экране */
  scale: number;
}) {
  const { t } = useTranslation();
  const id = box.personId;
  const pk = parentKind(tree, id);
  // При отдалении кнопки не должны становиться крошечными: компенсируем масштаб (но не больше чем в 3 раза)
  const s = Math.min(3, Math.max(1, 1 / scale));
  // Кнопки — прямо на краях карточки: наружу выходит только половина кружка,
  // поэтому они не закрывают соседей (между супругами зазор всего 20)
  const gap = 0;
  const buttons: { kind: RelativeKind; x: number; y: number; title: string }[] = [
    ...(pk ? [{ kind: pk, x: box.x + CARD_W / 2, y: box.y - gap, title: parentTitle(t, pk) }] : []),
    { kind: 'spouse', x: box.x + CARD_W + gap, y: box.y + CARD_H / 2, title: t('quick.spouse') },
    { kind: 'child', x: box.x + CARD_W / 2, y: box.y + CARD_H + gap, title: t('quick.child') },
    { kind: 'sibling', x: box.x - gap, y: box.y + CARD_H / 2, title: t('quick.sibling') },
  ];
  return (
    <g className="quick-add">
      {buttons.map((b) => (
        <g
          key={b.title}
          className="quick-btn"
          transform={`translate(${b.x} ${b.y}) scale(${s})`}
          role="button"
          aria-label={b.title}
          onClick={(e) => {
            e.stopPropagation();
            onAdd(id, b.kind);
          }}
        >
          <title>{b.title}</title>
          <circle r={R + 6} className="quick-hit" />
          <circle r={R} />
          <path d="M -5 0 H 5 M 0 -5 V 5" />
        </g>
      ))}
    </g>
  );
}

/** Меню действий с человеком (правая кнопка / долгое нажатие) */
export function CardContextMenu({ onAdd }: { onAdd: (personId: string, kind: RelativeKind) => void }) {
  const { t } = useTranslation();
  const menu = useUi((s) => s.contextMenu);
  const tree = useApp((s) => s.session?.history.present);
  const nameOf = useNameOf();
  const ref = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [kinship, setKinship] = useState<string | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeContextMenu();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeContextMenu();
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('wheel', closeContextMenu, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', closeContextMenu);
    };
  }, [menu]);

  const person = menu && tree ? tree.people[menu.personId] : undefined;
  const run = (fn: () => void) => () => {
    closeContextMenu();
    fn();
  };
  // Меню не должно вылезать за край экрана
  const x = menu ? Math.min(menu.x, window.innerWidth - 240) : 0;
  const y = menu ? Math.min(menu.y, window.innerHeight - 380) : 0;
  const pk = person && tree ? parentKind(tree, person.id) : null;
  const rootId = tree?.rootPersonId;

  return (
    <>
      {menu && person && (
        <div ref={ref} className="popover context-menu" style={{ left: x, top: y }} role="menu">
          <div className="context-title">{nameOf(person)}</div>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => select(person.id))}>
            <PanelRightOpen size={16} strokeWidth={1.75} /> {t('quick.open')}
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => setFocus(person.id))}>
            <Crosshair size={16} strokeWidth={1.75} /> {t('tree.center')}
          </button>
          <hr />
          {pk && (
            <button type="button" role="menuitem" className="menu-item" onClick={run(() => onAdd(person.id, pk))}>
              <UserPlus size={16} strokeWidth={1.75} /> {parentTitle(t, pk)}
            </button>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => onAdd(person.id, 'spouse'))}>
            <Heart size={16} strokeWidth={1.75} /> {t('quick.spouse')}
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => onAdd(person.id, 'child'))}>
            <UserPlus size={16} strokeWidth={1.75} /> {t('quick.child')}
          </button>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => onAdd(person.id, 'sibling'))}>
            <Users size={16} strokeWidth={1.75} /> {t('quick.sibling')}
          </button>
          {rootId && rootId !== person.id && (
            <>
              <hr />
              <button type="button" role="menuitem" className="menu-item" onClick={run(() => setKinship(person.id))}>
                <Link2 size={16} strokeWidth={1.75} /> {t('quick.kinship')}
              </button>
            </>
          )}
          <hr />
          <button type="button" role="menuitem" className="menu-item menu-item-danger" onClick={run(() => setConfirm(person.id))}>
            <Trash size={16} strokeWidth={1.75} /> {t('person.delete')}
          </button>
        </div>
      )}
      {confirm && tree?.people[confirm] && (
        <ConfirmDialog
          title={t('person.deleteTitle', { name: nameOf(tree.people[confirm]) })}
          text={t('person.deleteText')}
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            const id = confirm;
            setConfirm(null);
            apply((tr) => removePerson(tr, id));
            if (getState().session?.selectedId === id) select(undefined);
          }}
        />
      )}
      {kinship && rootId && <KinshipDialog initialA={rootId} initialB={kinship} onClose={() => setKinship(null)} />}
    </>
  );
}
