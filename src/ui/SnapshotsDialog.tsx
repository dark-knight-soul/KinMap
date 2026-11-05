import { Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { decrypt, decryptWithKey } from '../file/crypto';
import { unpackTree } from '../file/format';
import { addMedia, apply, getState, notify, useApp } from '../state/store';
import { MAX_SNAPSHOTS, listSnapshots, type Snapshot } from '../storage/local';
import { formatDateTime } from './format';
import { Modal } from './Modal';

// Автокопии из браузера. Восстановление — обычное изменение древа, его можно отменить (Ctrl+Z).
// Копия могла быть сделана с другим паролем (или когда пароль был, а теперь снят) —
// тогда спрашиваем пароль прямо здесь.
export function SnapshotsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const treeId = useApp((s) => s.session!.history.present.id);
  const [items, setItems] = useState<Snapshot[] | null>(null);
  const [locked, setLocked] = useState<Snapshot | null>(null);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState(false);

  useEffect(() => {
    void listSnapshots(treeId).then(setItems, () => setItems([]));
  }, [treeId]);

  const applySnapshot = (bytes: Uint8Array, snap: Snapshot) => {
    const { tree, media } = unpackTree(bytes);
    addMedia(media);
    // id древа оставляем текущим, чтобы копия не стала «другим» древом
    apply((current) => ({ ...tree, id: current.id }));
    notify('snapshots.restored', { date: formatDateTime(snap.at, i18n.language) });
    onClose();
  };

  const restore = async (snap: Snapshot) => {
    if (!snap.encrypted) return applySnapshot(snap.bytes, snap);
    const key = getState().session?.key;
    if (key) {
      try {
        return applySnapshot(await decryptWithKey(snap.bytes, key), snap);
      } catch {
        // другой пароль — спросим ниже
      }
    }
    setLocked(snap);
    setPassword('');
    setWrong(false);
  };

  const unlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!locked || !password) return;
    try {
      const { plain } = await decrypt(locked.bytes, password);
      applySnapshot(plain, locked);
    } catch {
      setWrong(true);
    }
  };

  return (
    <Modal title={t('snapshots.title')} onClose={onClose}>
      <p className="muted small">{t('snapshots.text', { max: MAX_SNAPSHOTS })}</p>
      {items && items.length === 0 && <p>{t('snapshots.empty')}</p>}
      <ul className="rel-list">
        {items?.map((s) => (
          <li key={s.id} className="rel-row">
            <span className="grow">
              {s.encrypted && <Lock size={13} className="inline-icon" />}
              {formatDateTime(s.at, i18n.language)}{' '}
              <span className="muted small">· {t('welcome.people', { count: s.peopleCount })}</span>
            </span>
            <button type="button" className="btn btn-small" onClick={() => void restore(s)}>
              {t('snapshots.restore')}
            </button>
          </li>
        ))}
      </ul>
      {locked && (
        <form className="form confirm-inline" onSubmit={unlock}>
          <p>{t('snapshots.otherPassword')}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label={t('password.password')}
            autoFocus
          />
          {wrong && <p className="error-text">{t('unlock.wrong')}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!password}>
              {t('snapshots.restore')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
