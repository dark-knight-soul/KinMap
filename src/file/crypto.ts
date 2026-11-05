import { LoadError } from '../model/validate';

// Шифрование файла древа паролем. Используется встроенная в браузер криптография (Web Crypto):
//  - ключ из пароля: PBKDF2-SHA256, 600 000 повторов (рекомендация OWASP) — подбор пароля очень медленный;
//  - шифр: AES-256-GCM — заодно проверяет целостность (неверный пароль или порча файла обнаруживаются).
//
// Устройство зашифрованного файла:
//   "KINMAP-ENC" (10 байт) | версия (1 байт) | длина заголовка (4 байта) | заголовок JSON | шифротекст
// Заголовок хранит соль, IV, число повторов и подсказку к паролю. Он не секретный,
// но защищён от подмены: участвует в проверке шифра (AAD).

const MAGIC = new TextEncoder().encode('KINMAP-ENC');
const CONTAINER_VERSION = 1;
export const DEFAULT_ITERATIONS = 600_000;

export interface EncryptionKey {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
  hint?: string;
}

interface Header {
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  hint?: string;
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function isEncrypted(bytes: Uint8Array): boolean {
  return bytes.length > MAGIC.length && MAGIC.every((b, i) => bytes[i] === b);
}

export async function deriveKey(
  password: string,
  options: { salt?: Uint8Array; iterations?: number; hint?: string } = {},
): Promise<EncryptionKey> {
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  return { key, salt, iterations, hint: options.hint?.trim() || undefined };
}

export async function encrypt(plain: Uint8Array, k: EncryptionKey): Promise<Uint8Array> {
  // Новый IV при каждом сохранении — обязательно для AES-GCM
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const header: Header = { kdf: 'PBKDF2-SHA256', iterations: k.iterations, salt: toB64(k.salt), iv: toB64(iv) };
  if (k.hint) header.hint = k.hint;
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: headerBytes },
      k.key,
      plain as BufferSource,
    ),
  );

  const out = new Uint8Array(MAGIC.length + 1 + 4 + headerBytes.length + cipher.length);
  let pos = 0;
  out.set(MAGIC, pos);
  pos += MAGIC.length;
  out[pos++] = CONTAINER_VERSION;
  new DataView(out.buffer).setUint32(pos, headerBytes.length);
  pos += 4;
  out.set(headerBytes, pos);
  pos += headerBytes.length;
  out.set(cipher, pos);
  return out;
}

function readContainer(bytes: Uint8Array): { header: Header; headerBytes: Uint8Array; cipher: Uint8Array } {
  if (!isEncrypted(bytes)) throw new LoadError('notKinmap');
  let pos = MAGIC.length;
  if (bytes[pos++] !== CONTAINER_VERSION) throw new LoadError('tooNew');
  if (bytes.length < pos + 4) throw new LoadError('corrupt');
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(pos);
  pos += 4;
  if (bytes.length < pos + len) throw new LoadError('corrupt');
  const headerBytes = bytes.slice(pos, pos + len);
  try {
    const header = JSON.parse(new TextDecoder().decode(headerBytes)) as Header;
    if (typeof header.salt !== 'string' || typeof header.iv !== 'string' || !Number.isInteger(header.iterations)) {
      throw new Error();
    }
    return { header, headerBytes, cipher: bytes.slice(pos + len) };
  } catch {
    throw new LoadError('corrupt');
  }
}

/** Подсказка к паролю — показывается в окне ввода пароля */
export function readHint(bytes: Uint8Array): string | undefined {
  return readContainer(bytes).header.hint;
}

/** Расшифровать. Возвращает данные и ключ — чтобы потом сохранять с тем же паролем */
export async function decrypt(bytes: Uint8Array, password: string): Promise<{ plain: Uint8Array; key: EncryptionKey }> {
  const { header } = readContainer(bytes);
  const key = await deriveKey(password, {
    salt: fromB64(header.salt),
    iterations: header.iterations,
    hint: header.hint,
  });
  return { plain: await decryptWithKey(bytes, key), key };
}

/** Расшифровать уже известным ключом (например, автокопию из браузера) */
export async function decryptWithKey(bytes: Uint8Array, key: EncryptionKey): Promise<Uint8Array> {
  const { header, headerBytes, cipher } = readContainer(bytes);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(header.iv) as BufferSource, additionalData: headerBytes as BufferSource },
        key.key,
        cipher as BufferSource,
      ),
    );
  } catch {
    throw new LoadError('wrongPassword');
  }
}
