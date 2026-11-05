import { idbDelete, idbGet, idbGetAll, idbGetAllByIndex, idbPut, openDb } from './idb';

// Копии древ внутри браузера. Это страховка, а не главное хранилище:
// главное — файл .kinmap у пользователя. Браузер может очистить эти данные,
// поэтому мы просим его «не удалять» (persist) и напоминаем сохранять файл.
// Байты здесь — ровно то же, что в файле (с паролем — зашифрованные).

export interface WorkingCopy {
  treeId: string;
  name: string;
  /** Время последнего изменения древа */
  updatedAt: string;
  /** Когда последний раз сохраняли в файл */
  savedToFileAt?: string;
  fileName?: string;
  encrypted: boolean;
  peopleCount: number;
  bytes: Uint8Array;
}

export interface Snapshot {
  id?: number;
  treeId: string;
  at: string;
  name: string;
  peopleCount: number;
  encrypted: boolean;
  bytes: Uint8Array;
}

/** Сколько автокопий хранить на одно древо */
export const MAX_SNAPSHOTS = 10;

let available: boolean | null = null;

/** Доступно ли хранилище браузера (в приватном режиме или с диска может быть запрещено) */
export async function isStorageAvailable(): Promise<boolean> {
  if (available === null) {
    try {
      await openDb();
      available = true;
    } catch {
      available = false;
    }
  }
  return available;
}

/** Попросить браузер не удалять наши данные при нехватке места */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function listWorkingCopies(): Promise<WorkingCopy[]> {
  if (!(await isStorageAvailable())) return [];
  const all = await idbGetAll<WorkingCopy>('trees');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWorkingCopy(treeId: string): Promise<WorkingCopy | undefined> {
  if (!(await isStorageAvailable())) return undefined;
  return idbGet<WorkingCopy>('trees', treeId);
}

export async function saveWorkingCopy(copy: WorkingCopy): Promise<void> {
  if (!(await isStorageAvailable())) return;
  await idbPut('trees', copy);
}

export async function markSavedToFile(treeId: string, at: string, fileName: string): Promise<void> {
  const copy = await getWorkingCopy(treeId);
  if (copy) await saveWorkingCopy({ ...copy, savedToFileAt: at, fileName });
}

/** Удалить из браузера всё про древо: копию, автокопии и связь с файлом */
export async function deleteTreeFromBrowser(treeId: string): Promise<void> {
  if (!(await isStorageAvailable())) return;
  await idbDelete('trees', treeId);
  await idbDelete('handles', treeId);
  for (const s of await idbGetAllByIndex<Snapshot>('snapshots', 'treeId', treeId)) {
    if (s.id !== undefined) await idbDelete('snapshots', s.id);
  }
}

export async function listSnapshots(treeId: string): Promise<Snapshot[]> {
  if (!(await isStorageAvailable())) return [];
  const all = await idbGetAllByIndex<Snapshot>('snapshots', 'treeId', treeId);
  return all.sort((a, b) => b.at.localeCompare(a.at));
}

/** Добавить автокопию и удалить самые старые сверх лимита */
export async function addSnapshot(snapshot: Omit<Snapshot, 'id'>): Promise<void> {
  if (!(await isStorageAvailable())) return;
  await idbPut('snapshots', snapshot);
  const all = await listSnapshots(snapshot.treeId);
  for (const old of all.slice(MAX_SNAPSHOTS)) {
    if (old.id !== undefined) await idbDelete('snapshots', old.id);
  }
}

export async function saveFileHandle(treeId: string, handle: FileSystemFileHandle | null): Promise<void> {
  if (!(await isStorageAvailable())) return;
  try {
    if (handle) await idbPut('handles', handle, treeId);
    else await idbDelete('handles', treeId);
  } catch {
    // Некоторые браузеры не умеют хранить «ручки» файлов — тогда просто без автосохранения после перезагрузки
  }
}

export async function getFileHandle(treeId: string): Promise<FileSystemFileHandle | undefined> {
  if (!(await isStorageAvailable())) return undefined;
  try {
    return await idbGet<FileSystemFileHandle>('handles', treeId);
  } catch {
    return undefined;
  }
}
