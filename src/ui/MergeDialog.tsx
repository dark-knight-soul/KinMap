import { ArrowLeftRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mergePeople } from '../model/merge';
import { childrenOf, isAncestor, parentsOf, unionsOf } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import { apply, getState, select, setFocus, useApp } from '../state/store';
import { lifespan, useNameOf } from './format';
import { PersonSelect } from './KinshipDialog';
import { Avatar } from './media';
import { Modal } from './Modal';

// Объединение дублей: два человека — на самом деле один. Данные второго дополняют
// первого (пустые поля, фото, заметки), все связи переходят к первому. Отмена — Ctrl+Z.

export function MergeDialog({ initialA, initialB, onClose }: { initialA?: PersonId; initialB?: PersonId; onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const [keep, setKeep] = useState<PersonId | undefined>(initialA);
  const [drop, setDrop] = useState<PersonId | undefined>(initialB);

  const both = keep && drop && keep !== drop && tree.people[keep] && tree.people[drop];
  // Предка с потомком объединить нельзя — получится петля
  const blocked = both ? isAncestor(tree, keep, drop) || isAncestor(tree, drop, keep) : false;

  const run = () => {
    if (!keep || !drop || blocked) return;
    const s = getState().session!;
    const wasFocus = s.focusId === drop;
    if (apply((tr) => mergePeople(tr, keep, drop))) {
      if (wasFocus) setFocus(keep);
      else select(keep);
      onClose();
    }
  };

  return (
    <Modal
      title={t('merge.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={!both || blocked}>
            {t('merge.run')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('merge.hint')}</p>
      <div className="kin-pickers">
        <PersonSelect tree={tree} label={t('merge.keep')} value={keep} onChange={setKeep} />
        <button
          type="button"
          className="icon-btn kin-swap"
          onClick={() => {
            setKeep(drop);
            setDrop(keep);
          }}
          title={t('kin.swap')}
          aria-label={t('kin.swap')}
        >
          <ArrowLeftRight size={18} strokeWidth={1.75} />
        </button>
        <PersonSelect tree={tree} label={t('merge.drop')} value={drop} onChange={setDrop} />
      </div>
      {keep && drop && keep === drop && <p className="muted">{t('kin.same')}</p>}
      {both && (
        <div className="merge-compare">
          <PersonSummary tree={tree} id={keep} role={t('merge.keepShort')} />
          <PersonSummary tree={tree} id={drop} role={t('merge.dropShort')} />
        </div>
      )}
      {blocked && <div className="issues-box">{t('merge.blocked')}</div>}
    </Modal>
  );
}

/** Короткая сводка о человеке: чтобы было видно, что это действительно один человек */
function PersonSummary({ tree, id, role }: { tree: TreeData; id: PersonId; role: string }) {
  const { t } = useTranslation();
  const nameOf = useNameOf();
  const p = tree.people[id]!;
  const parents = parentsOf(tree, id).map((x) => nameOf(x.person));
  const partners = unionsOf(tree, id).flatMap((f) => f.partners.filter((x) => x !== id).map((x) => nameOf(tree.people[x])));
  const children = childrenOf(tree, id).length;
  return (
    <div className="merge-card">
      <div className="muted small">{role}</div>
      <div className="merge-head">
        <Avatar person={p} size={40} />
        <div>
          <strong>{nameOf(p)}</strong>
          <div className="muted small">{lifespan(p) || '—'}</div>
        </div>
      </div>
      <dl className="merge-facts small">
        {p.birth?.place && (
          <>
            <dt>{t('merge.birthPlace')}</dt>
            <dd>{p.birth.place}</dd>
          </>
        )}
        <dt>{t('merge.parents')}</dt>
        <dd>{parents.join(', ') || '—'}</dd>
        <dt>{t('merge.partners')}</dt>
        <dd>{partners.join(', ') || '—'}</dd>
        <dt>{t('merge.children')}</dt>
        <dd>{children || '—'}</dd>
        <dt>{t('merge.photos')}</dt>
        <dd>{p.photos?.length || '—'}</dd>
      </dl>
    </div>
  );
}
