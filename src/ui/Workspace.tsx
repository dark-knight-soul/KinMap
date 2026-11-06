import {
  CalendarDays,
  ChartColumn,
  ChartGantt,
  CircleCheck,
  CircleExclamationPoint,
  Ellipsis,
  FileDown,
  FilePlus,
  HardDrive,
  Keyboard,
  Link2,
  List,
  LoaderCircle,
  Lock,
  LogOut,
  Network,
  Printer,
  Redo2,
  RotateCcwClock,
  Save,
  Undo2,
} from 'lucide-react';
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
import { openHelp, setHighlight } from '../state/ui';
import { setView, useView, VIEW_MODES, type ViewMode } from '../state/view';
import { CalendarView, TodayBanner } from './calendar/CalendarView';
import { ExportGedcomDialog, ImportReportDialog } from './GedcomDialogs';
import { IssuesButton, IssuesDialog } from './IssuesView';
import { KinshipDialog } from './KinshipDialog';
import { ConfirmDialog } from './Modal';
import { CoachHint, FirstPersonDialog } from './Onboarding';
import { PasswordDialog } from './PasswordDialog';
import { PeopleList } from './PeopleList';
import { PersonEditor } from './PersonEditor';
import { PrintDialog } from './print/PrintDialog';
import { SnapshotsDialog } from './SnapshotsDialog';
import { StatsDialog } from './StatsDialog';
import { TopBar } from './TopBar';
import { TimelineView } from './timeline/TimelineView';
import { TreeChart } from './tree/TreeChart';
import { TreeToolbar } from './tree/TreeToolbar';

/** Через сколько минут без сохранения в файл показывать напоминание */
const REMIND_AFTER_MIN = 15;

type DialogName = 'password' | 'snapshots' | 'close' | 'issues' | 'kinship' | 'gedcom' | 'print' | 'first' | 'stats' | null;

const MODE_ICON: Record<ViewMode, typeof Network> = { tree: Network, list: List, calendar: CalendarDays, timeline: ChartGantt };
const ICON = { size: 18, strokeWidth: 1.75 } as const;

export function Workspace() {
  const { t } = useTranslation();
  const session = useApp((s) => s.session)!;
  const storageBroken = useApp((s) => s.storageBroken);
  const tree = session.history.present;
  const view = useView();
  const hasPeople = Object.keys(tree.people).length > 0;
  // Новое пустое древо — сразу спрашиваем «С кого начнём?»
  const [dialog, setDialog] = useState<DialogName>(() => (hasPeople ? null : 'first'));
  const [menuOpen, setMenuOpen] = useState(false);
  const now = useNow(30_000);

  // Горячие клавиши. В полях ввода Ctrl+Z оставляем браузеру (отмена набора текста)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = e.target instanceof Element && !!e.target.closest('input, textarea, select');
      if (e.key === '?' && !inField && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openHelp();
        return;
      }
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
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

  // Подсветка пути относится к открытому древу — при закрытии сбрасываем
  useEffect(() => () => setHighlight(null), []);

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

  const menuItem = (Icon: typeof Save, label: string, fn: () => void, opts: { disabled?: boolean; danger?: boolean } = {}) => (
    <button
      type="button"
      role="menuitem"
      className={opts.danger ? 'menu-item menu-item-danger' : 'menu-item'}
      disabled={opts.disabled}
      onClick={() => {
        setMenuOpen(false);
        fn();
      }}
    >
      <Icon size={16} strokeWidth={1.75} /> {label}
    </button>
  );

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
            <button type="button" className="icon-btn" onClick={undo} disabled={!session.history.past.length} title={t('toolbar.undo')} aria-label={t('toolbar.undo')}>
              <Undo2 {...ICON} />
            </button>
            <button type="button" className="icon-btn redo-btn" onClick={redo} disabled={!session.history.future.length} title={t('toolbar.redo')} aria-label={t('toolbar.redo')}>
              <Redo2 {...ICON} />
            </button>
            <button type="button" className="btn btn-primary btn-icon" onClick={() => void saveNow()} title={t('toolbar.saveHint')}>
              <Save size={16} strokeWidth={2} />
              <span className="btn-label">{t('toolbar.save')}</span>
            </button>
            <div className="menu">
              <button
                type="button"
                className="icon-btn"
                aria-expanded={menuOpen}
                aria-label={t('toolbar.menu')}
                title={t('toolbar.menu')}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Ellipsis {...ICON} />
              </button>
              {menuOpen && (
                <>
                  <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
                  <div className="menu-list" role="menu">
                    {menuItem(FilePlus, t('toolbar.saveAs'), () => void saveAsNew())}
                    {menuItem(Printer, t('toolbar.print'), () => {
                      setView({ mode: 'tree' });
                      setDialog('print');
                    }, { disabled: !hasPeople })}
                    {menuItem(FileDown, t('toolbar.exportGedcom'), () => setDialog('gedcom'))}
                    {menuItem(ChartColumn, t('stats.title'), () => setDialog('stats'), { disabled: !hasPeople })}
                    <hr />
                    {menuItem(Lock, session.key ? t('toolbar.passwordOn') : t('toolbar.password'), () => setDialog('password'))}
                    {menuItem(RotateCcwClock, t('toolbar.snapshots'), () => setDialog('snapshots'))}
                    {menuItem(Keyboard, t('help.title'), openHelp)}
                    <hr />
                    {menuItem(LogOut, t('toolbar.closeTree'), () => (hasUnsavedFileChanges() ? setDialog('close') : void close()))}
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

      {hasPeople && <TodayBanner />}

      <div className="view-bar">
        <div className="segmented" role="tablist" aria-label={t('view.label')}>
          {VIEW_MODES.map((m) => {
            const Icon = MODE_ICON[m];
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={view.mode === m}
                className={view.mode === m ? 'active' : ''}
                onClick={() => setView({ mode: m })}
                title={t(`view.${m}`)}
              >
                <Icon size={16} strokeWidth={1.75} />
                <span className="seg-label">{t(`view.${m}`)}</span>
              </button>
            );
          })}
        </div>
        {view.mode === 'tree' && hasPeople && <TreeToolbar />}
        <div className="view-bar-end">
          {hasPeople && (
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setDialog('kinship')} title={t('kin.title')}>
              <Link2 size={16} strokeWidth={1.75} />
              <span className="seg-label">{t('kin.button')}</span>
            </button>
          )}
          <IssuesButton onClick={() => setDialog('issues')} />
        </div>
      </div>

      {view.mode === 'list' ? (
        <div className={session.selectedId ? 'workspace has-selection' : 'workspace'}>
          <PeopleList />
          <PersonEditor />
        </div>
      ) : !hasPeople ? (
        <div className="workspace-empty">
          <div className="empty empty-card">
            <h2>{t('onboarding.emptyTitle')}</h2>
            <p className="muted">{t('people.emptyHint')}</p>
            <button type="button" className="btn btn-primary btn-large" onClick={() => setDialog('first')}>
              {t('onboarding.start')}
            </button>
          </div>
        </div>
      ) : (
        <div className={session.selectedId ? 'workspace tree-mode has-selection' : 'workspace tree-mode'}>
          <div className="chart-area">
            {view.mode === 'calendar' ? (
              <CalendarView />
            ) : view.mode === 'timeline' ? (
              <TimelineView />
            ) : (
              <>
                <TreeChart />
                <CoachHint />
              </>
            )}
          </div>
          {session.selectedId && <PersonEditor />}
        </div>
      )}

      {dialog === 'first' && <FirstPersonDialog onClose={() => setDialog(null)} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'snapshots' && <SnapshotsDialog onClose={() => setDialog(null)} />}
      {dialog === 'issues' && <IssuesDialog onClose={() => setDialog(null)} />}
      {dialog === 'stats' && <StatsDialog onClose={() => setDialog(null)} />}
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

/**
 * Статус сохранения — спокойно и понятно:
 *  «Сохранено» · «Сохраняется…» · «Только в браузере» (файл ещё не создан) ·
 *  «Не сохранено в файл» (файл есть, но отстаёт) · «Автосохранение на паузе».
 */
function SaveStatus({ session }: { session: Session }) {
  const { t } = useTranslation();
  const name = session.fileName ?? '';
  const neverSaved = session.fileRevision === -1 && !session.handle && !session.lastFileSaveAt;
  let icon;
  let text: string;
  let hint: string;
  let cls = 'status';
  let action: React.ReactNode = null;

  if (session.savingToFile) {
    icon = <LoaderCircle size={15} className="spin" />;
    text = t('status.saving');
    hint = text;
  } else if (session.handle && !session.handleWritable) {
    icon = <CircleExclamationPoint size={15} />;
    text = t('status.paused');
    hint = t('status.needsPermission', { name });
    cls += ' status-warn';
    action = (
      <button type="button" className="link-btn" onClick={() => void resumeFileAccess()}>
        {t('status.resume')}
      </button>
    );
  } else if (!hasUnsavedFileChanges(session)) {
    icon = <CircleCheck size={15} />;
    text = t('status.saved');
    hint = session.handle ? t('status.savedToFile', { name }) : t('status.downloaded', { name });
    cls += ' status-ok';
  } else if (neverSaved) {
    icon = <HardDrive size={15} />;
    text = t('status.browserOnly');
    hint = t('status.browserOnlyHint');
    cls += ' status-muted';
  } else {
    icon = <CircleExclamationPoint size={15} />;
    text = t('status.unsaved');
    hint = t('status.unsavedHint', { name });
    cls += ' status-warn';
  }

  return (
    <div className="save-status" title={hint}>
      {session.key && <Lock size={14} className="status-lock" aria-label={t('status.locked')} />}
      <span className={cls}>
        {icon}
        <span className="status-text">{text}</span>
      </span>
      {action}
    </div>
  );
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
