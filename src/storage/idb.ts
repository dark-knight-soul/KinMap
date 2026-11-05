// Минимальная обёртка над IndexedDB — встроенной базой данных браузера.
// Отдельная библиотека не нужна: операций мало, а лишний код увеличивает KinMap.html.
//
// Хранилища:
//   trees     — рабочая копия каждого древа (последнее состояние), ключ — id древа
//   snapshots — автокопии (последние 10 на древо)
//   handles   — «ручка» файла на диске (Chrome/Edge), чтобы сохранять прямо в него после перезагрузки

const DB_NAME = 'kinmap';
const DB_VERSION = 1;

export type StoreName = 'trees' | 'snapshots' | 'handles';

let dbPromise: Promise<IDBDatabase> | null = null;

const promisify = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB недоступна'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('trees')) db.createObjectStore('trees', { keyPath: 'treeId' });
        if (!db.objectStoreNames.contains('snapshots')) {
          const s = db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
          s.createIndex('treeId', 'treeId');
        }
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB заблокирована другой вкладкой'));
    });
    // Если открыть не удалось — в следующий раз попробуем снова
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

async function store(name: StoreName, mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function idbGet<T>(name: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return promisify((await store(name, 'readonly')).get(key)) as Promise<T | undefined>;
}

export async function idbGetAll<T>(name: StoreName): Promise<T[]> {
  return promisify((await store(name, 'readonly')).getAll()) as Promise<T[]>;
}

export async function idbGetAllByIndex<T>(name: StoreName, index: string, value: IDBValidKey): Promise<T[]> {
  return promisify((await store(name, 'readonly')).index(index).getAll(value)) as Promise<T[]>;
}

export async function idbPut(name: StoreName, value: unknown, key?: IDBValidKey): Promise<void> {
  await promisify((await store(name, 'readwrite')).put(value, key));
}

export async function idbDelete(name: StoreName, key: IDBValidKey): Promise<void> {
  await promisify((await store(name, 'readwrite')).delete(key));
}
