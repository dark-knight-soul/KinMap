import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { addPerson, createTree, linkParent } from '../model/ops';
import { LoadError, normalizeTree } from '../model/validate';
import { decryptWithKey, deriveKey, encrypt, isEncrypted, readHint } from './crypto';
import { deserializeTree, packTree, serializeTree, unpackTree } from './format';

// Для скорости тестов — мало повторов PBKDF2 (в приложении 600 000)
const FAST = { iterations: 1000 };

function sampleTree() {
  let tree = createTree('Семья Тестовых');
  const a = addPerson(tree, { sex: 'M', names: { given: 'Иван', surname: 'Тестов' }, birth: { date: { date: { y: 1950 } } } });
  const b = addPerson(a.tree, { sex: 'M', names: { given: 'Пётр', surname: 'Тестов' } });
  tree = linkParent(b.tree, b.id, a.id).tree;
  return tree;
}

async function expectLoadError(p: Promise<unknown> | (() => unknown), code: string) {
  try {
    await (typeof p === 'function' ? p() : p);
  } catch (e) {
    expect(e).toBeInstanceOf(LoadError);
    expect((e as LoadError).code).toBe(code);
    return;
  }
  throw new Error(`ожидалась ошибка ${code}`);
}

describe('файл .kinmap', () => {
  it('сохранили → открыли — то же самое древо', () => {
    const tree = sampleTree();
    const { tree: loaded, warnings } = unpackTree(packTree(tree));
    expect(loaded).toEqual(tree);
    expect(warnings).toEqual([]);
  });

  it('файл — zip, внутри mimetype и kinmap.json', () => {
    const bytes = packTree(sampleTree());
    expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
  });

  it('простой JSON тоже открывается', () => {
    const tree = sampleTree();
    expect(unpackTree(strToU8(JSON.stringify(tree))).tree).toEqual(tree);
  });

  it('чужие и битые файлы дают понятную ошибку', async () => {
    await expectLoadError(() => unpackTree(strToU8('привет')), 'notKinmap');
    await expectLoadError(() => unpackTree(strToU8('{"format":"other"}')), 'notKinmap');
    await expectLoadError(() => unpackTree(strToU8('{"format":"kinmap","version":99}')), 'tooNew');
    await expectLoadError(() => unpackTree(new Uint8Array([0x50, 0x4b, 1, 2, 3])), 'corrupt');
    await expectLoadError(() => unpackTree(zipSync({ 'other.txt': strToU8('x') })), 'notKinmap');
  });
});

describe('фото в файле', () => {
  const withPhoto = () => {
    const base = sampleTree();
    const id = Object.keys(base.people)[0]!;
    const photo = { id: 'ph1abc', mime: 'image/webp', w: 10, h: 20, caption: 'Свадьба', crop: { x: 0, y: 0.1, size: 1 } };
    return { tree: { ...base, people: { ...base.people, [id]: { ...base.people[id]!, photos: [photo] } } }, id };
  };
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);

  it('фото сохраняется и открывается вместе с древом', async () => {
    const { tree } = withPhoto();
    const loaded = unpackTree(packTree(tree, { ph1abc: bytes, лишнее: new Uint8Array([9]) }));
    expect(loaded.tree).toEqual(tree);
    expect(loaded.media).toEqual({ ph1abc: bytes });
    expect(loaded.warnings).toEqual([]);
  });

  it('фото внутри зашифрованного файла', async () => {
    const { tree } = withPhoto();
    const key = await deriveKey('пароль', FAST);
    const loaded = await deserializeTree(await serializeTree(tree, key, { ph1abc: bytes }), 'пароль');
    expect(loaded.media.ph1abc).toEqual(bytes);
  });

  it('пропавшее фото — ссылка убирается, предупреждение', () => {
    const { tree, id } = withPhoto();
    const loaded = unpackTree(packTree(tree, {}));
    expect(loaded.tree.people[id]?.photos).toBeUndefined();
    expect(loaded.warnings).toEqual(['missingPhotos']);
  });

  it('опасный id фото (путь) не принимается', () => {
    const { tree, id } = withPhoto();
    const bad = { ...tree, people: { ...tree.people, [id]: { ...tree.people[id]!, photos: [{ id: '../../x', mime: 'image/webp', w: 1, h: 1 }] } } };
    expect(unpackTree(strToU8(JSON.stringify(bad))).tree.people[id]?.photos).toBeUndefined();
  });
});

describe('починка данных при открытии', () => {
  it('битые ссылки, лишние партнёры и мусор убираются с предупреждением', () => {
    const { tree, warnings } = normalizeTree({
      format: 'kinmap',
      version: 1,
      name: 'Т',
      people: {
        P1: { sex: 'X', names: { given: 'А' } },
        P2: { names: { given: 'Б' } },
        P3: { names: { given: 'В' } },
        P4: { names: { given: 'Г' } },
        bad: 'строка',
      },
      families: {
        F1: { partners: ['P1', 'P2', 'P3'], children: [{ id: 'P4', relation: 'странная' }, { id: 'НЕТ' }] },
        F2: { partners: ['НЕТ'], children: [] },
      },
    });
    expect(tree.people.P1?.sex).toBe('U');
    expect(tree.families.F1?.partners).toEqual(['P1', 'P2']);
    expect(tree.families.F1?.children).toEqual([{ id: 'P4', relation: 'unknown' }]);
    expect(tree.families.F2).toBeUndefined();
    expect(warnings.sort()).toEqual(['badValues', 'brokenLinks', 'emptyFamilies', 'tooManyPartners']);
  });
});

describe('пароль', () => {
  it('зашифровали → расшифровали тем же паролем', async () => {
    const tree = sampleTree();
    const key = await deriveKey('секрет-123', { ...FAST, hint: 'кличка кота' });
    const bytes = await serializeTree(tree, key);
    expect(isEncrypted(bytes)).toBe(true);
    expect(readHint(bytes)).toBe('кличка кота');
    // Имени в зашифрованном файле не видно
    expect(new TextDecoder().decode(bytes)).not.toContain('Тестов');

    const loaded = await deserializeTree(bytes, 'секрет-123');
    expect(loaded.tree).toEqual(tree);
    expect(loaded.key?.hint).toBe('кличка кота');
  });

  it('без пароля и с неверным паролем — не открывается', async () => {
    const key = await deriveKey('верный', FAST);
    const bytes = await serializeTree(sampleTree(), key);
    await expectLoadError(deserializeTree(bytes), 'needsPassword');
    await expectLoadError(deserializeTree(bytes, 'неверный'), 'wrongPassword');
  });

  it('каждое сохранение шифруется по-новому (новый IV), ключ переиспользуется', async () => {
    const key = await deriveKey('пароль', FAST);
    const data = strToU8('данные');
    const a = await encrypt(data, key);
    const b = await encrypt(data, key);
    expect(a).not.toEqual(b);
    expect(await decryptWithKey(b, key)).toEqual(data);
  });

  it('подмена подсказки в заголовке обнаруживается', async () => {
    const key = await deriveKey('пароль', { ...FAST, hint: 'abc' });
    const bytes = await encrypt(strToU8('данные'), key);
    const text = new TextDecoder('latin1').decode(bytes);
    const pos = text.indexOf('"hint":"abc"') + '"hint":"'.length;
    bytes[pos] = 'x'.charCodeAt(0);
    await expectLoadError(decryptWithKey(bytes, key), 'wrongPassword');
  });
});
