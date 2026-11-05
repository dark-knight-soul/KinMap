import { FILE_EXTENSION, MIME } from './format';

// Открытие и сохранение файлов на диске.
//  - Chrome/Edge: File System Access API — пользователь один раз выбирает файл,
//    дальше KinMap сохраняет изменения прямо в него.
//  - Firefox/Safari: открытие через обычный выбор файла, сохранение — скачиванием.

const PICKER_TYPES: FilePickerAcceptType[] = [
  { description: 'KinMap', accept: { [MIME]: [FILE_EXTENSION] } },
];
// При открытии можно выбрать и GEDCOM (импорт из других программ)
const OPEN_TYPES: FilePickerAcceptType[] = [
  { description: 'KinMap, GEDCOM', accept: { [MIME]: [FILE_EXTENSION], 'application/x-gedcom': ['.ged', '.gdz', '.zip'] } },
];

export function supportsFileAccess(): boolean {
  return typeof window.showSaveFilePicker === 'function' && window.isSecureContext;
}

export interface OpenedFile {
  bytes: Uint8Array;
  name: string;
  handle: FileSystemFileHandle | null;
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/** Выбор файла пользователем. null — если он передумал */
export async function pickFileToOpen(): Promise<OpenedFile | null> {
  if (supportsFileAccess() && window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: OPEN_TYPES, id: 'kinmap' });
      if (!handle) return null;
      const file = await handle.getFile();
      return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle };
    } catch (e) {
      if (isAbort(e)) return null;
      // Например, запрещено во встроенном окне — пробуем обычный способ
    }
  }
  return pickWithInput();
}

function pickWithInput(): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = `${FILE_EXTENSION},.json,.ged,.gdz,.zip`;
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      resolve(file ? await readFile(file) : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/** Прочитать файл, перетащенный в окно */
export async function readFile(file: File): Promise<OpenedFile> {
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, handle: null };
}

/** Имя файла из названия древа: убираем символы, запрещённые в Windows */
export function fileNameFor(treeName: string): string {
  const safe = treeName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80) || 'KinMap';
  return safe + FILE_EXTENSION;
}

/**
 * «Сохранить как»: Chrome/Edge — окно выбора места (вернёт ручку файла),
 * остальные — скачивание. null — пользователь отменил.
 */
export async function saveAs(
  bytes: Uint8Array,
  suggestedName: string,
): Promise<{ handle: FileSystemFileHandle | null; name: string } | null> {
  if (supportsFileAccess() && window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({ types: PICKER_TYPES, suggestedName, id: 'kinmap' });
      await writeToHandle(handle, bytes);
      return { handle, name: handle.name };
    } catch (e) {
      if (isAbort(e)) return null;
    }
  }
  download(bytes, suggestedName);
  return { handle: null, name: suggestedName };
}

export async function writeToHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(bytes as BufferSource);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => undefined);
    throw e;
  }
}

/** Есть ли право записи в файл. request=true — спросить пользователя (только по нажатию кнопки) */
export async function hasWritePermission(handle: FileSystemFileHandle, request = false): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  try {
    if ((await handle.queryPermission?.(opts)) === 'granted') return true;
    if (request) return (await handle.requestPermission?.(opts)) === 'granted';
  } catch {
    // ручка устарела (файл удалён/перемещён)
  }
  return false;
}

export function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
