// Короткие случайные идентификаторы: P… — человек, F… — семья, T… — древо.
// Используем криптостойкий генератор браузера, чтобы id не совпадали между древами
// (важно при будущем объединении древ).

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function randomId(prefix: string, length = 12): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = prefix;
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export const newPersonId = () => randomId('P');
export const newFamilyId = () => randomId('F');
export const newTreeId = () => randomId('T', 16);
