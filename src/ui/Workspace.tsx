import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { supportsFileAccess } from '../file/io';
import { renameTree } from '../model/ops';
import {
  apply,
  closeSession,
  flush,
  hasUnsavedFileChanges,
  redo,
  resumeFileAccess,
  saveAsNew,
  saveNow,
  undo,
  useApp,
  type Session,
} from '../state/store';
import { setView, useView } from '../state/view';
import { ExportGedcomDialog, ImportReportDialog } from './GedcomDialogs';
import { PrintDialog } from './print/PrintDialog';
import { IssuesButton, IssuesDialog } from './IssuesView';
import { KinshipDialog } from './KinshipDialog';
import { ConfirmDialog } from './Modal';
import { PasswordDialog } from './PasswordDialog';
import { PeopleList, addEmptyPerson } from './PeopleList';
import { PersonEditor } from './PersonEditor';
import { SnapshotsDialog } from './SnapshotsDialog';
import { TopBar } from './TopBar';
import { TreeChart } from './tree/TreeChart';
import { TreeToolbar } from './tree/TreeToolbar';

/** Через сколько минут без сохранения в файл показывать напоминание */
const REMIND_AFTER_MIN = 15;

type DialogName = 'password' | 'snapshots' | 'close' | 'issues' | 'kinship' | 'gedcom' | 'print' | null;

export function Workspace() {
  const { t } = useTranslation();
  const session = useApp((s) => s.session)!;
  const storageBroken = useApp((s) => s.storageBroken);
  const tree = session.history.present;
  const view = useView();
  const hasPeople = Object.keys(tree.people).length > 0;
  const [dialog, setDialog] = useState<DialogName>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const now = useNow(30_000);

  // Горячие клавиши. В полях ввода Ctrl+Z оставляем браузеру (отмена набора текста)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      const inField = e.target instanceof Element && !!e.target.closest('input, textarea, select');
      if (key === 's') {
        e.preventDefault();
        void (e.shiftKey ? saveAsNew() : saveNow());
      } else if (key === 'p') {
        // Печать браузера напечатала бы интерфейс — открываем своё окно печати
        e.preventDefault();
        setView({ mode: 'tree' });
        setDialog('print');
      } else if (!inField && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (!inField && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Предупреждение при закрытии вкладки, если файл отстаёт от изменений
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedFileChanges()) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const autosaving = !!session.handle && session.handleWritable;
  const unsavedMinutes = session.unsavedSince ? Math.floor((now - session.unsavedSince) / 60_000) : 0;
  const showReminder = !autosaving && hasUnsavedFileChanges(session) && unsavedMinutes >= REMIND_AFTER_MIN;

  const close = async () => {
    await flush();
    closeSession();
  };

  const menuAction = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  return (
    <div className="workspace-root">
      <TopBar compact>
        <div className="toolbar">
          <input
            className="tree-name"
            value={tree.name}
            aria-label={t('toolbar.treeName')}
            onChange={(e) => apply((tr) => renameTree(tr, e.target.value), 'treeName')}
            onBlur={(e) => {
              if (!e.target.value.trim()) apply((tr) => renameTree(tr, 'KinMap'));
            }}
          />
          <SaveStatus session={session} />
          <div className="toolbar-buttons">
            <button
              type="button"
              className="icon-btn"
              onClick={undo}
              disabled={!session.history.past.length}
              title={t('toolbar.undo')}
              aria-label={t('toolbar.undo')}
            >
              ↶
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={redo}
              disabled={!session.history.future.length}
              title={t('toolbar.redo')}
              aria-label={t('toolbar.redo')}
            >
              ↷
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void saveNow()} title={t('toolbar.saveHint')}>
              {t('toolbar.save')}
            </button>
            <div className="menu">
              <button
                type="button"
                className="btn"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {t('toolbar.menu')} ▾
              </button>
              {menuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="menu-list" role="menu">
                    <button type="button" role="menuitem" onClick={menuAction(() => void saveAsNew())}>
                      {t('toolbar.saveAs')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!hasPeople}
                      onClick={menuAction(() => {
                        setView({ mode: 'tree' });
                        setDialog('print');
                      })}
                    >
                      {t('toolbar.print')}
                    </button>
                    <button type="button" role="menuitem" onClick={menuAction(() => setDialog('gedcom'))}>
                      {t('toolbar.exportGedcom')}
                    </button>
                    <button type="button" role="menuitem" onClick={menuAction(() => setDialog('password'))}>
                      {session.key ? '🔒 ' : ''}
                      {t('toolbar.password')}
                    </button>
                    <button type="button" role="menuitem" onClick={menuAction(() => setDialog('snapshots'))}>
                      {t('toolbar.snapshots')}
                    </button>
                    <hr />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={menuAction(() => (hasUnsavedFileChanges() ? setDialog('close') : void close()))}
                    >
                      {t('toolbar.closeTree')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </TopBar>

      {storageBroken && <div className="banner banner-warn">{t('banner.storageBroken')}</div>}
      {showReminder && (
        <div className="banner banner-warn">
          <span>
            {t('banner.reminder', { minutes: unsavedMinutes })}
            {!supportsFileAccess() && ` ${t('banner.downloadNote')}`}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => void saveNow()}>
            {t('banner.saveNow')}
          </button>
        </div>
      )}

      <div className="view-bar">
        <div className="segmented" role="tablist" aria-label={t('view.label')}>
          {(['tree', 'list'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={view.mode === m}
              className={view.mode === m ? 'active' : ''}
              onClick={() => setView({ mode: m })}
            >
              {t(`view.${m}`)}
            </button>
          ))}
        </div>
        {view.mode === 'tree' && hasPeople && <TreeToolbar />}
        {hasPeople && (
          <button type="button" className="btn btn-small" onClick={() => setDialog('kinship')}>
            {t('kin.button')}
          </button>
        )}
        <IssuesButton onClick={() => setDialog('issues')} />
      </div>

      {view.mode === 'list' ? (
        <div className={session.selectedId ? 'workspace has-selection' : 'workspace'}>
          <PeopleList />
          <PersonEditor />
        </div>
      ) : !hasPeople ? (
        <div className="workspace-empty">
          <div className="empty">
            <p>{t('people.empty')}</p>
            <p className="muted small">{t('people.emptyHint')}</p>
            <button type="button" className="btn btn-primary" onClick={() => addEmptyPerson()}>
              {t('people.addFirst')}
            </button>
          </div>
        </div>
      ) : (
        <div className={session.selectedId ? 'workspace tree-mode has-selection' : 'workspace tree-mode'}>
          <div className="chart-area">
            <TreeChart />
            <p className="chart-hint muted small">{t('tree.hint')}</p>
          </div>
          {session.selectedId && <PersonEditor />}
        </div>
      )}

      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'snapshots' && <SnapshotsDialog onClose={() => setDialog(null)} />}
      {dialog === 'issues' && <IssuesDialog onClose={() => setDialog(null)} />}
      {dialog === 'gedcom' && <ExportGedcomDialog onClose={() => setDialog(null)} />}
      {dialog === 'print' && hasPeople && <PrintDialog onClose={() => setDialog(null)} />}
      <ImportReportDialog />
      {dialog === 'kinship' && (
        <KinshipDialog
          initialA={tree.rootPersonId}
          initialB={
            session.selectedId && session.selectedId !== tree.rootPersonId
              ? session.selectedId
              : session.focusId !== tree.rootPersonId
                ? session.focusId
                : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'close' && (
        <ConfirmDialog
          title={t('close.title')}
          text={t('close.unsaved')}
          confirmLabel={t('close.confirm')}
          onClose={() => setDialog(null)}
          onConfirm={() => void close()}
          extra={
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await saveNow();
                if (!hasUnsavedFileChanges()) void close();
              }}
            >
              {t('close.saveFirst')}
            </button>
          }
        />
      )}
    </div>
  );
}

function SaveStatus({ session }: { session: Session }) {
  const { t } = useTranslation();
  const name = session.fileName ?? '';
  let content;
  if (session.savingToFile) {
    content = <span className="status">{t('status.saving')}</span>;
  } else if (session.handle && !session.handleWritable) {
    content = (
      <span className="status status-warn">
        {t('status.needsPermission', { name })}{' '}
        <button type="button" className="link-btn" onClick={() => void resumeFileAccess()}>
          {t('status.resume')}
        </button>
      </span>
    );
  } else if (!hasUnsavedFileChanges(session)) {
    content = (
      <span className="status status-ok">
        ✓ {session.handle ? t('status.savedToFile', { name }) : t('status.downloaded', { name })}
      </span>
    );
  } else {
    content = <span className="status status-warn">● {t('status.unsaved')}</span>;
  }
  return (
    // Подсказка с полным текстом — на узком экране статус обрезается многоточием
    <div className="save-status" title={statusTitle(session, t)}>
      {session.key && (
        <span className="status" title={t('status.locked')} aria-label={t('status.locked')}>
          🔒
        </span>
      )}
      {content}
    </div>
  );
}

function statusTitle(session: Session, t: (k: string, o?: Record<string, string>) => string): string {
  const name = session.fileName ?? '';
  if (session.savingToFile) return t('status.saving');
  if (session.handle && !session.handleWritable) return t('status.needsPermission', { name });
  if (!hasUnsavedFileChanges(session)) {
    return session.handle ? t('status.savedToFile', { name }) : t('status.downloaded', { name });
  }
  return t('status.unsaved');
}

/** Текущее время, обновляемое раз в interval мс (для напоминаний) */
function useNow(interval: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(id);
  }, [interval]);
  return now;
}
