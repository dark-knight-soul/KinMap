import { FolderOpen, Lock, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState, type DragEvent, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { readFile } from '../file/io';
import { createDemoTree } from '../model/demo';
import { createTree } from '../model/ops';
import { openSession } from '../state/store';
import { deleteTreeFromBrowser, listWorkingCopies, type WorkingCopy } from '../storage/local';
import { formatDateTime } from './format';
import { ConfirmDialog, Modal } from './Modal';
import { useOpenFlow } from './useOpenFlow';

// Стартовый экран: создать древо, открыть файл (кнопкой или перетаскиванием),
// продолжить работу с древом, копия которого есть в браузере.
export function StartScreen() {
  const { t, i18n } = useTranslation();
  const flow = useOpenFlow();
  const [copies, setCopies] = useState<WorkingCopy[]>([]);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<WorkingCopy | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = () => void listWorkingCopies().then(setCopies, () => setCopies([]));
  useEffect(refresh, []);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) await flow.openFile(await readFile(file));
  };

  const unsaved = (c: WorkingCopy) => !c.savedToFileAt || c.savedToFileAt < c.updatedAt;

  return (
    <main
      className={dragOver ? 'main drop-target' : 'main'}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <section className="welcome">
        <h1>{t('welcome.title')}</h1>
        <p className="welcome-text">{t('welcome.text')}</p>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={18} strokeWidth={2} /> {t('welcome.create')}
          </button>
          <button type="button" className="btn" onClick={() => void flow.pickAndOpen()} disabled={flow.busy}>
            <FolderOpen size={18} strokeWidth={1.75} /> {t('welcome.open')}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void openSession({ tree: createDemoTree(t('demo.name')), key: null, syncedWithFile: false })}
          >
            <Sparkles size={18} strokeWidth={1.75} /> {t('welcome.demo')}
          </button>
        </div>
        <p className="hint">{t('welcome.dropHint')}</p>
      </section>

      {copies.length > 0 && (
        <section className="recent">
          <h2>{t('welcome.recent')}</h2>
          <ul className="recent-list">
            {copies.map((c) => (
              <li key={c.treeId} className="recent-item">
                <div className="recent-info">
                  <div className="recent-name">
                    {c.encrypted && <Lock size={14} className="inline-icon" aria-label={t('welcome.withPassword')} />}
                    {c.name}
                  </div>
                  <div className="muted small">
                    {t('welcome.people', { count: c.peopleCount })} ·{' '}
                    {t('welcome.changed', { date: formatDateTime(c.updatedAt, i18n.language) })}
                    {c.fileName && ` · ${c.fileName}`}
                    {unsaved(c) && <span className="badge-warn"> {t('welcome.notSavedToFile')}</span>}
                  </div>
                </div>
                <div className="recent-actions">
                  <button type="button" className="btn btn-primary" onClick={() => void flow.continueCopy(c)}>
                    {t('welcome.continue')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setRemoving(c)}>
                    {t('welcome.removeFromBrowser')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ul className="features">
        {(
          [
            ['privateTitle', 'privateText'],
            ['printTitle', 'printText'],
            ['kinshipTitle', 'kinshipText'],
            ['gedcomTitle', 'gedcomText'],
          ] as const
        ).map(([title, text]) => (
          <li key={title} className="feature">
            <h2>{t(`features.${title}`)}</h2>
            <p>{t(`features.${text}`)}</p>
          </li>
        ))}
      </ul>

      {creating && <CreateTreeDialog onClose={() => setCreating(false)} />}
      {removing && (
        <ConfirmDialog
          title={t('welcome.removeConfirmTitle', { name: removing.name })}
          text={
            <>
              <p>{t('welcome.removeConfirmText')}</p>
              {unsaved(removing) && <p className="error-text">{t('welcome.removeConfirmUnsaved')}</p>}
            </>
          }
          confirmLabel={t('common.delete')}
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await deleteTreeFromBrowser(removing.treeId);
            setRemoving(null);
            refresh();
          }}
        />
      )}
      {flow.dialogs}
    </main>
  );
}

function CreateTreeDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    await openSession({ tree: createTree(name), key: null, syncedWithFile: false });
  };

  return (
    <Modal title={t('create.title')} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>{t('create.nameLabel')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('create.namePlaceholder')}
            autoFocus
            maxLength={120}
          />
        </label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {t('create.submit')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
