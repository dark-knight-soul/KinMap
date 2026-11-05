import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { serializeTree } from '../file/format';
import { download, fileNameFor } from '../file/io';
import { getState, notify, removePassword, setPassword, useApp } from '../state/store';
import { Modal } from './Modal';

const MIN_LENGTH = 6;

// Пароль на файл: поставить, сменить, снять. Честно предупреждаем, что забытый
// пароль восстановить нельзя, и предлагаем сохранить копию без пароля в надёжное место.
export function PasswordDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const hasPassword = useApp((s) => !!s.session?.key);
  const [mode, setMode] = useState<'view' | 'form'>(hasPassword ? 'view' : 'form');
  const [password, setPasswordValue] = useState('');
  const [repeat, setRepeat] = useState('');
  const [hint, setHint] = useState('');
  const [understand, setUnderstand] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const error =
    password.length > 0 && password.length < MIN_LENGTH
      ? t('password.tooShort')
      : repeat.length > 0 && repeat !== password
        ? t('password.mismatch')
        : hint && password && hint.toLowerCase().includes(password.toLowerCase())
          ? t('password.hintHasPassword')
          : null;
  const canSubmit = password.length >= MIN_LENGTH && repeat === password && understand && !error && !busy;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await setPassword(password, hint);
      const s = getState().session;
      notify(s?.handle && s.handleWritable ? 'password.setDoneAuto' : 'password.setDone');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const downloadPlainCopy = async () => {
    const s = getState().session;
    if (!s) return;
    const tree = s.history.present;
    const name = fileNameFor(`${tree.name} (${t('password.plainCopy').toLowerCase()})`);
    download(await serializeTree(tree, null, s.media), name);
  };

  return (
    <Modal title={t('password.title')} onClose={onClose}>
      {mode === 'view' ? (
        <div className="form">
          <p className="with-icon"><Lock size={16} /> {t('password.enabled')}</p>
          <div className="stack">
            <button type="button" className="btn" onClick={() => setMode('form')}>
              {t('password.change')}
            </button>
            {confirmRemove ? (
              <div className="confirm-inline">
                <p>{t('password.removeConfirm')}</p>
                <button type="button" className="btn" onClick={() => setConfirmRemove(false)}>
                  {t('common.cancel')}
                </button>{' '}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    removePassword();
                    notify('password.removed');
                    onClose();
                  }}
                >
                  {t('password.remove')}
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-danger-ghost" onClick={() => setConfirmRemove(true)}>
                {t('password.remove')}
              </button>
            )}
            <div>
              <button type="button" className="btn btn-ghost" onClick={() => void downloadPlainCopy()}>
                {t('password.plainCopy')}
              </button>
              <p className="muted small">{t('password.plainCopyHint')}</p>
            </div>
          </div>
        </div>
      ) : (
        <form className="form" onSubmit={submit}>
          {!hasPassword && <p className="muted">{t('password.disabled')}</p>}
          <label className="field">
            <span>{t('password.password')}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPasswordValue(e.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <label className="field">
            <span>{t('password.repeat')}</span>
            <input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" />
          </label>
          <label className="field">
            <span>{t('password.hint')}</span>
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder={t('password.hintPlaceholder')} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <label className="checkbox">
            <input type="checkbox" checked={understand} onChange={(e) => setUnderstand(e.target.checked)} />
            <span>{t('password.understand')}</span>
          </label>
          <div className="form-actions">
            <button type="button" className="btn" onClick={hasPassword ? () => setMode('view') : onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
              {busy ? t('password.working') : hasPassword ? t('password.change') : t('password.set')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
