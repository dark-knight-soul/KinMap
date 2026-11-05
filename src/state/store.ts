import { useSyncExternalStore } from 'react';
import { deriveKey, type EncryptionKey } from '../file/crypto';
import { serializeTree, type MediaStore } from '../file/format';
import type { ImportReport } from '../gedcom/import';
import { fileNameFor, hasWritePermission, saveAs, writeToHandle } from '../file/io';
import { OpError } from '../model/ops';
import type { TreeData } from '../model/types';
import {
  addSnapshot,
  isStorageAvailable,
  markSavedToFile,
  requestPersistence,
  saveFileHandle,
  saveWorkingCopy,
} from '../storage/local';
import { initHistory, pushHistory, redoHistory, undoHistory, type History } from './history';

// Состояние приложения: открытое древо, история отмены, связь с файлом, уведомления.
// Плюс автосохранение:
//   - в браузер (рабочая копия) — через ~0.7 с после изменения;
//   - автокопия — не чаще раза в 5 минут;
//   - в файл на диске — через ~1.5 с, если браузер это умеет (Chrome/Edge) и есть разрешение.

export interface Session {
  history: History<TreeData>;
  /** Ключ шифрования, если на файле пароль */
  key: EncryptionKey | null;
  /** Счётчик изменений — растёт при каждом изменении (включая отмену) */
  revision: number;
  /** Какое изменение записано в файл. -1 — в файл ещё не сохраняли */
  fileRevision: number;
  fileName?: string;
  handle: FileSystemFileHandle | null;
  /** Есть ли сейчас право писать в файл без вопроса пользователю */
  handleWritable: boolean;
  savingToFile: boolean;
  lastFileSaveAt?: string;
  /** Когда появились несохранённые в файл изменения (для напоминания) */
  unsavedSince?: number;
  /** Выбранный человек (открыта его карточка) */
  selectedId?: string;
  /** Вокруг кого строится схема */
  focusId?: string;
  /**
   * Байты фотографий по id. Только добавляются (не удаляются), чтобы отмена удаления
   * фото работала; при сохранении в файл попадают лишь те, на которые есть ссылки.
   */
  media: MediaStore;
}

export interface Notice {
  id: number;
  kind: 'info' | 'error';
  /** Ключ перевода и параметры */
  key: string;
  params?: Record<string, string | number>;
}

export interface AppState {
  session: Session | null;
  notice: Notice | null;
  /** Хранилище браузера недоступно — копии не сохраняются */
  storageBroken: boolean;
  /** Отчёт о последнем импорте GEDCOM (показывается окном) */
  importReport: (ImportReport & { photosFailed: number }) | null;
}

let state: AppState = { session: null, notice: null, storageBroken: false, importReport: null };

export function showImportReport(report: AppState['importReport']): void {
  setState({ importReport: report });
}
const listeners = new Set<() => void>();

export const getState = () => state;

function setState(next: Partial<AppState>): void {
  const prevSession = state.session;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
  const s = state.session;
  if (s && prevSession && s.revision !== prevSession.revision && s.history.present.id === prevSession.history.present.id) {
    scheduleAutosave();
  }
}

function setSession(update: Partial<Session>): void {
  if (state.session) setState({ session: { ...state.session, ...update } });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Подписка компонента на часть состояния */
export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

// ─── Уведомления ────────────────────────────────────────────────────────────

let noticeId = 0;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

export function notify(key: string, params?: Notice['params'], kind: Notice['kind'] = 'info'): void {
  clearTimeout(noticeTimer);
  setState({ notice: { id: ++noticeId, kind, key, params } });
  noticeTimer = setTimeout(() => setState({ notice: null }), kind === 'error' ? 7000 : 4000);
}

export function dismissNotice(): void {
  setState({ notice: null });
}

// ─── Открытие и закрытие ────────────────────────────────────────────────────

export interface OpenParams {
  tree: TreeData;
  media?: MediaStore;
  key: EncryptionKey | null;
  fileName?: string;
  handle?: FileSystemFileHandle | null;
  /** true — содержимое совпадает с файлом на диске (только что открыли файл) */
  syncedWithFile: boolean;
  lastFileSaveAt?: string;
}

export async function openSession(p: OpenParams): Promise<void> {
  const handle = p.handle ?? null;
  const handleWritable = handle ? await hasWritePermission(handle) : false;
  setState({
    session: {
      history: initHistory(p.tree),
      key: p.key,
      revision: 0,
      fileRevision: p.syncedWithFile ? 0 : -1,
      fileName: p.fileName,
      handle,
      handleWritable,
      savingToFile: false,
      lastFileSaveAt: p.lastFileSaveAt,
      unsavedSince: p.syncedWithFile ? undefined : Date.now(),
      // Карточку сразу не открываем — сначала человек видит древо целиком
      selectedId: undefined,
      focusId: p.tree.rootPersonId,
      media: p.media ?? {},
    },
  });
  lastSnapshotAt = 0;
  if (handle) void saveFileHandle(p.tree.id, handle);
  // Сразу сохраняем копию в браузер (и автокопию «как было при открытии»)
  await persistToBrowser();
}

export function closeSession(): void {
  clearTimeout(browserTimer);
  clearTimeout(fileTimer);
  setState({ session: null });
}

// ─── Изменения, отмена, выбор ───────────────────────────────────────────────

/**
 * Применить изменение к древу. Ошибки правил (OpError) показываются уведомлением.
 * coalesceKey — склеивать быстрые изменения одного поля в один шаг отмены.
 */
export function apply(change: (tree: TreeData) => TreeData, coalesceKey?: string): boolean {
  const s = state.session;
  if (!s) return false;
  let next: TreeData;
  try {
    next = change(s.history.present);
  } catch (e) {
    if (e instanceof OpError) {
      notify(`errors.op.${e.code}`, undefined, 'error');
      return false;
    }
    throw e;
  }
  if (next === s.history.present) return true;
  next = { ...next, updatedAt: new Date().toISOString() };
  setSession({
    history: pushHistory(s.history, next, coalesceKey),
    revision: s.revision + 1,
    unsavedSince: s.unsavedSince ?? Date.now(),
    ...validIds(s, next),
  });
  return true;
}

/** Если выбранный человек или центр схемы удалён — переключаемся на главного человека */
function validIds(s: Session, tree: TreeData): Pick<Session, 'selectedId' | 'focusId'> {
  const ok = (id?: string) => (id && tree.people[id] ? id : undefined);
  const fallback = ok(tree.rootPersonId) ?? Object.keys(tree.people)[0];
  return { selectedId: ok(s.selectedId) ?? (s.selectedId ? fallback : undefined), focusId: ok(s.focusId) ?? fallback };
}

function moveHistory(move: (h: History<TreeData>) => History<TreeData>): void {
  const s = state.session;
  if (!s) return;
  const h = move(s.history);
  if (h === s.history) return;
  const present = { ...h.present, updatedAt: new Date().toISOString() };
  setSession({
    history: { ...h, present },
    revision: s.revision + 1,
    unsavedSince: s.unsavedSince ?? Date.now(),
    ...validIds(s, present),
  });
}

export const undo = () => moveHistory(undoHistory);
export const redo = () => moveHistory(redoHistory);

export function select(id: string | undefined): void {
  setSession({ selectedId: id });
}

/** Добавить байты фото (сама ссылка на фото добавляется в древо через apply) */
export function addMedia(items: MediaStore): void {
  const s = state.session;
  if (s) setSession({ media: { ...s.media, ...items } });
}

/** Сделать человека центром схемы (и выбрать его) */
export function setFocus(id: string): void {
  if (state.session?.history.present.people[id]) setSession({ focusId: id, selectedId: id });
}

// ─── Пароль ─────────────────────────────────────────────────────────────────

export async function setPassword(password: string, hint?: string): Promise<void> {
  const key = await deriveKey(password, { hint });
  const s = state.session;
  if (!s) return;
  // Файл на диске теперь устарел (он без пароля или со старым) — нужно пересохранить
  setSession({ key, revision: s.revision + 1, unsavedSince: s.unsavedSince ?? Date.now() });
}

export function removePassword(): void {
  const s = state.session;
  if (!s) return;
  setSession({ key: null, revision: s.revision + 1, unsavedSince: s.unsavedSince ?? Date.now() });
}

// ─── Сохранение ─────────────────────────────────────────────────────────────

const BROWSER_DELAY = 700;
const FILE_DELAY = 1500;
const SNAPSHOT_EVERY = 5 * 60 * 1000;

let browserTimer: ReturnType<typeof setTimeout> | undefined;
let fileTimer: ReturnType<typeof setTimeout> | undefined;
let lastSnapshotAt = 0;
// Очереди, чтобы записи не накладывались друг на друга
let browserQueue: Promise<void> = Promise.resolve();
let fileQueue: Promise<void> = Promise.resolve();

function scheduleAutosave(): void {
  clearTimeout(browserTimer);
  browserTimer = setTimeout(() => void persistToBrowser(), BROWSER_DELAY);
  const s = state.session;
  if (s?.handle && s.handleWritable) {
    clearTimeout(fileTimer);
    fileTimer = setTimeout(() => void writeCurrentToHandle(), FILE_DELAY);
  }
}

function persistToBrowser(): Promise<void> {
  browserQueue = browserQueue.then(async () => {
    const s = state.session;
    if (!s) return;
    if (!(await isStorageAvailable())) {
      if (!state.storageBroken) setState({ storageBroken: true });
      return;
    }
    const tree = s.history.present;
    try {
      const bytes = await serializeTree(tree, s.key, s.media);
      const peopleCount = Object.keys(tree.people).length;
      await saveWorkingCopy({
        treeId: tree.id,
        name: tree.name,
        updatedAt: tree.updatedAt,
        savedToFileAt: s.lastFileSaveAt,
        fileName: s.fileName,
        encrypted: !!s.key,
        peopleCount,
        bytes,
      });
      if (Date.now() - lastSnapshotAt > SNAPSHOT_EVERY) {
        lastSnapshotAt = Date.now();
        await addSnapshot({
          treeId: tree.id,
          at: new Date().toISOString(),
          name: tree.name,
          peopleCount,
          encrypted: !!s.key,
          bytes,
        });
      }
    } catch {
      if (!state.storageBroken) setState({ storageBroken: true });
    }
  });
  return browserQueue;
}

function afterFileSaved(revision: number, fileName: string, handle: FileSystemFileHandle | null): void {
  const s = state.session;
  if (!s) return;
  const at = new Date().toISOString();
  const upToDate = s.revision === revision;
  setSession({
    fileRevision: revision,
    fileName,
    handle,
    handleWritable: !!handle,
    lastFileSaveAt: at,
    unsavedSince: upToDate ? undefined : s.unsavedSince,
  });
  void markSavedToFile(s.history.present.id, at, fileName);
}

/** Тихая запись в уже выбранный файл (автосохранение) */
function writeCurrentToHandle(): Promise<void> {
  fileQueue = fileQueue.then(async () => {
    const s = state.session;
    if (!s?.handle || !s.handleWritable || s.fileRevision === s.revision) return;
    const revision = s.revision;
    setSession({ savingToFile: true });
    try {
      await writeToHandle(s.handle, await serializeTree(s.history.present, s.key, s.media));
      setSession({ savingToFile: false });
      afterFileSaved(revision, s.handle.name, s.handle);
    } catch {
      // Нет доступа (файл перемещён, права отозваны) — просим сохранить вручную
      setSession({ savingToFile: false, handleWritable: false });
      notify('save.autosaveFailed', undefined, 'error');
    }
  });
  return fileQueue;
}

/** Кнопка «Сохранить» / Ctrl+S */
export async function saveNow(): Promise<void> {
  const s = state.session;
  if (!s) return;
  void requestPersistence();
  if (s.handle) {
    // Разрешение можно запросить только по нажатию — это оно и есть
    const ok = s.handleWritable || (await hasWritePermission(s.handle, true));
    if (ok) {
      setSession({ handleWritable: true });
      await writeCurrentToHandle();
      if (state.session?.fileRevision === state.session?.revision) notify('save.saved', { name: s.handle.name });
      return;
    }
  }
  await saveAsNew();
}

/** «Сохранить как…» — всегда спрашивает место/имя (или скачивает) */
export async function saveAsNew(): Promise<void> {
  const s = state.session;
  if (!s) return;
  void requestPersistence();
  const revision = s.revision;
  const tree = s.history.present;
  const result = await saveAs(await serializeTree(tree, s.key, s.media), s.fileName ?? fileNameFor(tree.name));
  if (!result) return;
  afterFileSaved(revision, result.name, result.handle);
  void saveFileHandle(tree.id, result.handle);
  notify(result.handle ? 'save.saved' : 'save.downloaded', { name: result.name });
}

/** Возобновить автосохранение в файл после перезагрузки (нужно нажатие пользователя) */
export async function resumeFileAccess(): Promise<void> {
  const s = state.session;
  if (!s?.handle) return;
  if (await hasWritePermission(s.handle, true)) {
    setSession({ handleWritable: true });
    await writeCurrentToHandle();
  } else {
    notify('save.permissionDenied', undefined, 'error');
  }
}

/** Принудительно дописать всё в браузер (перед закрытием древа) */
export async function flush(): Promise<void> {
  clearTimeout(browserTimer);
  await persistToBrowser();
}

export function hasUnsavedFileChanges(s: Session | null = state.session): boolean {
  return !!s && s.fileRevision !== s.revision;
}
