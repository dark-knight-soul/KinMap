import { ArrowLeftRight, FolderOpen } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaStore } from '../file/format';
import { pickFileToOpen } from '../file/io';
import { findMatches, mergeTrees, type MatchCandidate } from '../model/mergeTrees';
import type { Person, PersonId, TreeData } from '../model/types';
import { addMedia, apply, getState, notify, useApp } from '../state/store';
import { lifespan, useNameOf } from './format';
import { Avatar } from './media';
import { Modal } from './Modal';
import { useOpenFlow } from './useOpenFlow';

// «Объединить с другим древом»: файл родственника (.kinmap или GEDCOM) вливается в открытое древо.
// KinMap сам находит людей, которые есть в обоих древах; пары можно снять галочкой.
// Всё объединение — одна операция: отменяется Ctrl+Z.

interface Incoming {
  tree: TreeData;
  media: MediaStore;
  name: string;
}

export function MergeTreesDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const nameOf = useNameOf();
  const { loadForMerge, busy, dialogs } = useOpenFlow();
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [matches, setMatches] = useState<MatchCandidate[]>([]);
  const [rejected, setRejected] = useState<Set<PersonId>>(new Set());

  const pick = async () => {
    const file = await pickFileToOpen();
    if (!file) return;
    const loaded = await loadForMerge(file);
    if (!loaded) return;
    setIncoming(loaded);
    setMatches(findMatches(getState().session!.history.present, loaded.tree));
    setRejected(new Set());
  };

  const accepted = matches.filter((m) => !rejected.has(m.incomingId));
  const total = incoming ? Object.keys(incoming.tree.people).length : 0;
  const matchedIds = useMemo(() => new Set(accepted.map((m) => m.incomingId)), [accepted]);
  const newPeople = useMemo(
    () => (incoming ? Object.values(incoming.tree.people).filter((p) => !matchedIds.has(p.id)) : []),
    [incoming, matchedIds],
  );

  const run = () => {
    if (!incoming) return;
    let result: ReturnType<typeof mergeTrees> | undefined;
    // Фото второго древа — до изменения древа, чтобы ссылки на них сразу работали
    addMedia(incoming.media);
    const ok = apply((tr) => {
      result = mergeTrees(tr, incoming.tree, new Map(accepted.map((m) => [m.incomingId, m.baseId])));
      return result.tree;
    });
    if (ok && result) {
      notify(result.conflicts ? 'mergeTrees.doneConflicts' : 'mergeTrees.done', {
        added: result.added,
        merged: result.merged,
        conflicts: result.conflicts,
      });
      onClose();
    }
  };

  return (
    <Modal
      title={t('mergeTrees.title')}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={!incoming || busy}>
            {incoming ? t('mergeTrees.run', { added: newPeople.length, merged: accepted.length }) : t('mergeTrees.runShort')}
          </button>
        </>
      }
    >
      <p className="muted small">{t('mergeTrees.hint')}</p>
      {!incoming ? (
        <div className="merge-pick">
          <button type="button" className="btn btn-large" onClick={() => void pick()} disabled={busy}>
            <FolderOpen size={18} strokeWidth={1.75} /> {busy ? t('mergeTrees.reading') : t('mergeTrees.pick')}
          </button>
          <p className="muted small">{t('mergeTrees.formats')}</p>
        </div>
      ) : (
        <>
          <div className="merge-summary">
            <div>
              <strong>{incoming.name}</strong>
              <div className="muted small">
                {t('mergeTrees.summary', { total, matched: accepted.length, added: newPeople.length })}
              </div>
            </div>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => void pick()} disabled={busy}>
              {t('mergeTrees.other')}
            </button>
          </div>

          <h3 className="form-subtitle">{t('mergeTrees.matchesTitle', { count: matches.length })}</h3>
          {matches.length === 0 ? (
            <p className="muted">{t('mergeTrees.noMatches')}</p>
          ) : (
            <ul className="match-list">
              {matches.map((m) => {
                const a = incoming.tree.people[m.incomingId]!;
                const b = tree.people[m.baseId];
                if (!b) return null;
                const on = !rejected.has(m.incomingId);
                return (
                  <li key={m.incomingId} className={on ? 'match on' : 'match'}>
                    <label className="match-row">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(rejected);
                          if (e.target.checked) next.delete(m.incomingId);
                          else next.add(m.incomingId);
                          setRejected(next);
                        }}
                      />
                      <PersonBit p={a} name={nameOf(a)} />
                      <ArrowLeftRight size={16} strokeWidth={1.75} className="muted" aria-hidden="true" />
                      <PersonBit p={b} name={nameOf(b)} />
                    </label>
                    <div className="match-reasons">
                      {m.reasons.map((r) => (
                        <span key={r} className="tag">
                          {t(`mergeTrees.reasons.${r}`)}
                        </span>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {newPeople.length > 0 && (
            <details className="merge-new">
              <summary>{t('mergeTrees.newTitle', { count: newPeople.length })}</summary>
              <ul>
                {newPeople.slice(0, 300).map((p) => (
                  <li key={p.id}>
                    {nameOf(p)} <span className="muted small">{lifespan(p)}</span>
                  </li>
                ))}
                {newPeople.length > 300 && <li className="muted">…</li>}
              </ul>
            </details>
          )}
          <p className="muted small">{t('mergeTrees.after')}</p>
        </>
      )}
      {dialogs}
    </Modal>
  );
}

function PersonBit({ p, name }: { p: Person; name: string }) {
  return (
    <span className="match-person">
      <Avatar person={p} size={28} />
      <span className="match-name">
        {name}
        <span className="muted small"> {lifespan(p)}</span>
      </span>
    </span>
  );
}
