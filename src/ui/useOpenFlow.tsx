import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { readHint } from '../file/crypto';
import { deserializeTree } from '../file/format';
import { pickFileToOpen, type OpenedFile } from '../file/io';
import { LoadError } from '../model/validate';
import type { TreeData } from '../model/types';
import { notify, openSession } from '../state/store';
import { addSnapshot, getFileHandle, getWorkingCopy, type WorkingCopy } from '../storage/local';
import { formatDateTime } from './format';
import { Modal } from './Modal';
import { usePrompt } from './usePrompt';

// Сценарии открытия древа:
//  1) файл с диска → (пароль) → проверка «в браузере есть более новая версия?» → открыть;
//  2) «Продолжить» копию из браузера → (пароль) → открыть.
// Возвращает функции и окна (dialogs), которые нужно отрисовать.

type Decoded = Awaited<ReturnType<typeof deserializeTree>>;

interface PasswordArgs {
  name: string;
  hint?: string;
  wrong: boolean;
}

interface NewerArgs {
  copy: WorkingCopy;
  fileTree: TreeData;
}

export function useOpenFlow() {
  const { t, i18n } = useTranslation();
  const passwordPrompt = usePrompt<PasswordArgs, string>();
  const newerPrompt = usePrompt<NewerArgs, 'browser' | 'file'>();
  const [busy, setBusy] = useState(false);

  const showLoadError = (e: unknown) => {
    const code = e instanceof LoadError ? e.code : 'unknown';
    notify(`errors.load.${code}`, undefined, 'error');
  };

  /** Расшифровать/разобрать байты, спрашивая пароль сколько нужно. null — отмена */
  async function decode(bytes: Uint8Array, name: string, password?: string): Promise<Decoded | null> {
    let wrong = false;
    for (;;) {
      try {
        return await deserializeTree(bytes, password);
      } catch (e) {
        if (e instanceof LoadError && (e.code === 'needsPassword' || e.code === 'wrongPassword')) {
          wrong = e.code === 'wrongPassword';
          const answer = await passwordPrompt.ask({ name, hint: readHint(bytes), wrong });
          if (answer === null) return null;
          password = answer;
          continue;
        }
        throw e;
      }
    }
  }

  async function openFile(file: OpenedFile): Promise<void> {
    setBusy(true);
    try {
      const decoded = await decode(file.bytes, file.name);
      if (!decoded) return;

      // Нет ли в браузере более свежей версии этого же древа?
      const copy = await getWorkingCopy(decoded.tree.id);
      if (copy && copy.updatedAt > decoded.tree.updatedAt) {
        const choice = await newerPrompt.ask({ copy, fileTree: decoded.tree });
        if (choice === null) return;
        if (choice === 'file') {
          // Более свежую версию из браузера не выбрасываем — кладём в автокопии
          await addSnapshot({
            treeId: copy.treeId,
            at: copy.updatedAt,
            name: copy.name,
            peopleCount: copy.peopleCount,
            encrypted: copy.encrypted,
            bytes: copy.bytes,
          });
        }
        if (choice === 'browser') {
          const fromBrowser = await decode(copy.bytes, copy.name);
          if (!fromBrowser) return;
          await openSession({
            tree: fromBrowser.tree,
            media: fromBrowser.media,
            key: fromBrowser.key ?? decoded.key,
            fileName: file.name,
            handle: file.handle,
            syncedWithFile: false,
            lastFileSaveAt: copy.savedToFileAt,
          });
          return;
        }
      }

      if (decoded.warnings.length) notify('load.warnings', undefined, 'error');
      await openSession({
        tree: decoded.tree,
        media: decoded.media,
        key: decoded.key,
        fileName: file.name,
        handle: file.handle,
        syncedWithFile: true,
      });
    } catch (e) {
      showLoadError(e);
    } finally {
      setBusy(false);
    }
  }

  async function pickAndOpen(): Promise<void> {
    const file = await pickFileToOpen();
    if (file) await openFile(file);
  }

  async function continueCopy(copy: WorkingCopy): Promise<void> {
    setBusy(true);
    try {
      const decoded = await decode(copy.bytes, copy.name);
      if (!decoded) return;
      const synced = !!copy.savedToFileAt && copy.savedToFileAt >= copy.updatedAt;
      await openSession({
        tree: decoded.tree,
        media: decoded.media,
        key: decoded.key,
        fileName: copy.fileName,
        handle: (await getFileHandle(copy.treeId)) ?? null,
        syncedWithFile: synced,
        lastFileSaveAt: copy.savedToFileAt,
      });
    } catch (e) {
      showLoadError(e);
    } finally {
      setBusy(false);
    }
  }

  const people = (n: number) => t('welcome.people', { count: n });

  const dialogs = (
    <>
      {passwordPrompt.args && (
        <PasswordPromptDialog args={passwordPrompt.args} onDone={passwordPrompt.finish} />
      )}
      {newerPrompt.args && (
        <Modal
          title={t('newer.title')}
          onClose={() => newerPrompt.finish(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => newerPrompt.finish('file')}>
                {t('newer.useFile')}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => newerPrompt.finish('browser')} data-autofocus>
                {t('newer.useBrowser')}
              </button>
            </>
          }
        >
          <p>
            {t('newer.text', {
              browserDate: formatDateTime(newerPrompt.args.copy.updatedAt, i18n.language),
              browserPeople: people(newerPrompt.args.copy.peopleCount),
              fileDate: formatDateTime(newerPrompt.args.fileTree.updatedAt, i18n.language),
              filePeople: people(Object.keys(newerPrompt.args.fileTree.people).length),
            })}
          </p>
        </Modal>
      )}
    </>
  );

  return { openFile, pickAndOpen, continueCopy, busy, dialogs };
}

function PasswordPromptDialog({ args, onDone }: { args: PasswordArgs; onDone: (p: string | null) => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) onDone(password);
  };

  return (
    <Modal title={t('unlock.title')} onClose={() => onDone(null)}>
      <form onSubmit={submit} className="form">
        <p className="muted">{t('unlock.file', { name: args.name })}</p>
        {args.hint && <p>{t('unlock.hint', { hint: args.hint })}</p>}
        <label className="field">
          <span>{t('password.password')}</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
          />
        </label>
        {args.wrong && <p className="error-text">{t('unlock.wrong')}</p>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => onDone(null)}>
            {t('common.cancel')}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!password}>
            {t('unlock.open')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
