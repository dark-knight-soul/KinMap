import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { LoadError, normalizeTree, type LoadWarning } from '../model/validate';
import type { TreeData } from '../model/types';
import { decrypt, encrypt, isEncrypted, type EncryptionKey } from './crypto';

// Файл древа .kinmap — это zip-архив:
//   mimetype            — "application/x-kinmap" (первым и без сжатия, как в ODF: так файл легко опознать)
//   kinmap.json         — данные древа
//   photos/<id>.<ext>   — фотографии (уже сжаты, поэтому кладутся без повторного сжатия)
// С паролем весь архив дополнительно шифруется (см. crypto.ts).

export const MIME = 'application/x-kinmap';
export const FILE_EXTENSION = '.kinmap';

/** Байты фотографий по id. Хранятся отдельно от данных древа (древо — это JSON) */
export type MediaStore = Readonly<Record<string, Uint8Array>>;

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** id всех фото, на которые ссылается древо */
export function photoIdsOf(tree: TreeData): Set<string> {
  const ids = new Set<string>();
  for (const p of Object.values(tree.people)) for (const ph of p.photos ?? []) ids.add(ph.id);
  return ids;
}

export function packTree(tree: TreeData, media: MediaStore = {}): Uint8Array {
  const files: Zippable = {
    mimetype: [strToU8(MIME), { level: 0 }],
    'kinmap.json': strToU8(JSON.stringify(tree)),
  };
  // Кладём только фото, на которые есть ссылки: удалённые в файл не попадают
  for (const p of Object.values(tree.people)) {
    for (const ph of p.photos ?? []) {
      const bytes = media[ph.id];
      if (bytes) files[`photos/${ph.id}.${EXT[ph.mime] ?? 'bin'}`] = [bytes, { level: 0 }];
    }
  }
  return zipSync(files, { level: 6 });
}

export interface Unpacked {
  tree: TreeData;
  warnings: LoadWarning[];
  media: Record<string, Uint8Array>;
}

export function unpackTree(bytes: Uint8Array): Unpacked {
  if (isEncrypted(bytes)) throw new LoadError('needsPassword');

  // Простой JSON тоже принимаем — удобно для отладки и ручных правок
  if (bytes[0] === 0x7b /* { */) {
    try {
      return withMedia(normalizeTree(JSON.parse(strFromU8(bytes))), {});
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
  let parsed;
  try {
    parsed = normalizeTree(JSON.parse(strFromU8(json)));
  } catch (e) {
    if (e instanceof LoadError) throw e;
    throw new LoadError('corrupt');
  }
  const media: Record<string, Uint8Array> = {};
  for (const [name, data] of Object.entries(files)) {
    const m = name.match(/^photos\/([a-z0-9]+)\.[a-z]+$/i);
    if (m) media[m[1]!] = data;
  }
  return withMedia(parsed, media);
}

/** Ссылки на отсутствующие в архиве фото убираем (с предупреждением), лишние фото не берём */
function withMedia(parsed: { tree: TreeData; warnings: LoadWarning[] }, all: Record<string, Uint8Array>): Unpacked {
  const media: Record<string, Uint8Array> = {};
  let missing = false;
  const people = { ...parsed.tree.people };
  for (const [id, p] of Object.entries(people)) {
    if (!p.photos) continue;
    const kept = p.photos.filter((ph) => {
      const bytes = all[ph.id];
      if (bytes) media[ph.id] = bytes;
      else missing = true;
      return !!bytes;
    });
    if (kept.length !== p.photos.length) {
      people[id] = { ...p, photos: kept.length ? kept : undefined };
      if (!kept.length) delete people[id]!.photos;
    }
  }
  const warnings = missing ? [...parsed.warnings, 'missingPhotos' as const] : parsed.warnings;
  return { tree: missing ? { ...parsed.tree, people } : parsed.tree, warnings, media };
}

/** Байты файла для сохранения: с паролем — зашифрованные */
export async function serializeTree(
  tree: TreeData,
  key?: EncryptionKey | null,
  media: MediaStore = {},
): Promise<Uint8Array> {
  const zip = packTree(tree, media);
  return key ? encrypt(zip, key) : zip;
}

/** Открыть байты файла. Для зашифрованного нужен пароль, иначе LoadError('needsPassword') */
export async function deserializeTree(
  bytes: Uint8Array,
  password?: string,
): Promise<Unpacked & { key: EncryptionKey | null }> {
  if (isEncrypted(bytes)) {
    if (password === undefined) throw new LoadError('needsPassword');
    const { plain, key } = await decrypt(bytes, password);
    return { ...unpackTree(plain), key };
  }
  return { ...unpackTree(bytes), key: null };
}
