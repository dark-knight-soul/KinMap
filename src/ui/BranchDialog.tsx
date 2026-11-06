import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { packTree } from '../file/format';
import { download, fileNameFor } from '../file/io';
import { exportGedcom } from '../gedcom/export';
import { extractBranch, type BranchMode } from '../model/merge';
import { isLiving } from '../model/queries';
import type { PersonId } from '../model/types';
import { getState, notify, useApp } from '../state/store';
import { useNameOf } from './format';
import { Modal } from './Modal';

// «Сохранить ветку»: потомки или предки одного человека — отдельным файлом.
// Удобно, чтобы поделиться с роднёй только их частью рода.

type Format = 'kinmap' | 'gedcom';

export function BranchDialog({ personId, onClose }: { personId: PersonId; onClose: () => void }) {
  const { t } = useTranslation();
  const tree = useApp((s) => s.session!.history.present);
  const encrypted = useApp((s) => !!s.session?.key);
  const nameOf = useNameOf();
  const person = tree.people[personId];
  const [mode, setMode] = useState<BranchMode>('descendants');
  const [withSpouses, setWithSpouses] = useState(true);
  const [format, setFormat] = useState<Format>('kinmap');
  const [hideLiving, setHideLiving] = useState(true);

  const name = person ? t('branch.fileName', { name: nameOf(person), tree: tree.name }) : tree.name;
  const branch = useMemo(
    () => (person ? extractBranch(tree, personId, mode, withSpouses, name) : null),
    [tree, personId, mode, withSpouses, name, person],
  );
  const count = branch ? Object.keys(branch.people).length : 0;
  const living = branch ? Object.values(branch.people).filter((p) => isLiving(p)).length : 0;

  const run = () => {
    const s = getState().session;
    if (!s || !branch) return;
    let file: string;
    if (format === 'kinmap') {
      file = fileNameFor(name);
      download(packTree(branch, s.media), file);
    } else {
      const out = exportGedcom(branch, s.media, { version: '5.5.1', hideLiving, includePhotos: false, appVersion: __APP_VERSION__ });
      file = fileNameFor(name).replace(/\.kinmap$/, `.${out.extension}`);
      download(out.bytes, file);
    }
    notify('gedcom.exported', { name: file });
    onClose();
  };

  if (!person) return null;
  return (
    <Modal
      title={t('branch.title')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={run} disabled={count === 0} data-autofocus>
            {t('branch.save', { count })}
          </button>
        </>
      }
    >
      <p className="muted small">{t('branch.hint', { name: nameOf(person) })}</p>
      <fieldset className="radio-group">
        <legend>{t('branch.what')}</legend>
        <label className="checkbox">
          <input type="radio" name="branch-mode" checked={mode === 'descendants'} onChange={() => setMode('descendants')} />
          <span>{t('branch.descendants')}</span>
        </label>
        <label className="checkbox">
          <input type="radio" name="branch-mode" checked={mode === 'ancestors'} onChange={() => setMode('ancestors')} />
          <span>{t('branch.ancestors')}</span>
        </label>
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" checked={withSpouses} onChange={(e) => setWithSpouses(e.target.checked)} />
        <span>{t('branch.withSpouses')}</span>
      </label>
      <fieldset className="radio-group">
        <legend>{t('branch.format')}</legend>
        <label className="checkbox">
          <input type="radio" name="branch-format" checked={format === 'kinmap'} onChange={() => setFormat('kinmap')} />
          <span>
            <strong>KinMap</strong> — {t('branch.kinmapHint')}
          </span>
        </label>
        <label className="checkbox">
          <input type="radio" name="branch-format" checked={format === 'gedcom'} onChange={() => setFormat('gedcom')} />
          <span>
            <strong>GEDCOM</strong> — {t('branch.gedcomHint')}
          </span>
        </label>
      </fieldset>
      {format === 'gedcom' && (
        <label className="checkbox">
          <input type="checkbox" checked={hideLiving} onChange={(e) => setHideLiving(e.target.checked)} />
          <span>{t('gedcom.hideLiving', { count: living })}</span>
        </label>
      )}
      {format === 'kinmap' && encrypted && <p className="muted small">{t('branch.noPassword')}</p>}
    </Modal>
  );
}
