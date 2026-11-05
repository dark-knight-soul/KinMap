import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { LoadError, normalizeTree, type LoadWarning } from '../model/validate';
import type { TreeData } from '../model/types';
import { decrypt, encrypt, isEncrypted, type EncryptionKey } from './crypto';

// Файл древа .kinmap — это zip-архив:
//   mimetype     — "application/x-kinmap" (первым и без сжатия, как в ODF: так файл легко опознать)
//   kinmap.json  — данные древа
//   photos/…     — фотографии (этап 4)
// С паролем весь архив дополнительно шифруется (см. crypto.ts).

export const MIME = 'application/x-kinmap';
export const FILE_EXTENSION = '.kinmap';

export function packTree(tree: TreeData): Uint8Array {
  return zipSync(
    {
      mimetype: [strToU8(MIME), { level: 0 }],
      'kinmap.json': strToU8(JSON.stringify(tree)),
    },
    { level: 6 },
  );
}

export function unpackTree(bytes: Uint8Array): { tree: TreeData; warnings: LoadWarning[] } {
  if (isEncrypted(bytes)) throw new LoadError('needsPassword');

  // Простой JSON тоже принимаем — удобно для отладки и ручных правок
  if (bytes[0] === 0x7b /* { */) {
    try {
      return normalizeTree(JSON.parse(strFromU8(bytes)));
    } catch (e) {
      if (e instanceof LoadError) throw e;
      throw new LoadError('corrupt');
    }
  }

  // zip начинается с «PK»
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new LoadError('notKinmap');
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new LoadError('corrupt');
  }
  const json = files['kinmap.json'];
  if (!json) throw new LoadError('notKinmap');
  try {
    return normalizeTree(JSON.parse(strFromU8(json)));
  } catch (e) {
    if (e instanceof LoadError) throw e;
    throw new LoadError('corrupt');
  }
}

/** Байты файла для сохранения: с паролем — зашифрованные */
export async function serializeTree(tree: TreeData, key?: EncryptionKey | null): Promise<Uint8Array> {
  const zip = packTree(tree);
  return key ? encrypt(zip, key) : zip;
}

/** Открыть байты файла. Для зашифрованного нужен пароль, иначе LoadError('needsPassword') */
export async function deserializeTree(
  bytes: Uint8Array,
  password?: string,
): Promise<{ tree: TreeData; warnings: LoadWarning[]; key: EncryptionKey | null }> {
  if (isEncrypted(bytes)) {
    if (password === undefined) throw new LoadError('needsPassword');
    const { plain, key } = await decrypt(bytes, password);
    return { ...unpackTree(plain), key };
  }
  return { ...unpackTree(bytes), key: null };
}
