import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { formatFuzzyDate } from '../model/dates';
import { createDemoTree } from '../model/demo';
import { fullName, parentsOf, spousesOf } from '../model/queries';
import type { Person, TreeData } from '../model/types';
import { fromGedcomDate, toGedcomDate } from './dates';
import { decodeAnsel, decodeGedcom, detectEncoding } from './encoding';
import { exportGedcom, type ExportOptions } from './export';
import { importGedcom, importGedcomFile, looksLikeGedcom } from './import';
import { parseLines, writeNodes } from './lines';

const fixture = (name: string) => new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../test-data/gedcom', name)));
const person = (tree: TreeData, given: string) => {
  const p = Object.values(tree.people).find((x) => x.names.given === given);
  if (!p) throw new Error(`нет ${given}`);
  return p;
};
const date = (p: Person | undefined, kind: 'birth' | 'death') => formatFuzzyDate(p?.[kind]?.date, 'ru');
const OPTS: ExportOptions = { version: '5.5.1', hideLiving: false, includePhotos: false, appVersion: 'test', currentYear: 2026 };

/** Перевод строки в Windows-1251 (только для теста) */
function cp1251(s: string): Uint8Array {
  return Uint8Array.from([...s].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c < 0x80) return c;
    if (c >= 0x410 && c <= 0x44f) return c - 0x410 + 0xc0;
    if (ch === 'Ё') return 0xa8;
    if (ch === 'ё') return 0xb8;
    return 0x3f;
  }));
}

describe('строки GEDCOM', () => {
  it('уровни, ссылки, CONT и CONC', () => {
    const { records, badLines } = parseLines('0 @I1@ INDI\n1 NAME Ivan /Ivanov/\n1 NOTE Нача\n2 CONC ло\n2 CONT вторая строка\n1 BIRT\n2 DATE 1950\nмусор\n0 TRLR');
    expect(records).toHaveLength(2);
    const indi = records[0]!;
    expect(indi.xref).toBe('I1');
    expect(indi.children!.find((c) => c.tag === 'NOTE')!.value).toBe('Начало\nвторая строка');
    expect(indi.children!.find((c) => c.tag === 'BIRT')!.children![0]).toEqual({ tag: 'DATE', value: '1950' });
    expect(badLines).toEqual([8]);
  });

  it('длинный текст режется на строки ≤255 и собирается обратно', () => {
    const long = 'слово '.repeat(200).trim();
    const lines = writeNodes([{ tag: 'NOTE', value: long }], { allowConc: true, maxLine: 255 });
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(255);
    expect(parseLines(lines.join('\n')).records[0]!.value).toBe(long);
  });
});

describe('кодировки', () => {
  it('UTF-8 с BOM и без, UTF-16', () => {
    expect(detectEncoding(strToU8('﻿0 HEAD'))).toBe('utf-8');
    const utf16 = new Uint8Array([0xff, 0xfe, ...[...'0 HEAD'].flatMap((c) => [c.charCodeAt(0), 0])]);
    expect(decodeGedcom(utf16).text).toBe('0 HEAD');
  });

  it('Windows-1251, даже если в заголовке написано ANSI', () => {
    const bytes = cp1251('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME Пётр Ильич /Чайкин/\n0 TRLR');
    expect(detectEncoding(bytes)).toBe('windows-1251');
    expect(decodeGedcom(bytes).text).toContain('Пётр Ильич /Чайкин/');
  });

  it('ANSEL: знак ударения идёт перед буквой', () => {
    // «José Müller»: 0xE2 — акут, 0xE8 — умлаут
    expect(decodeAnsel(new Uint8Array([0x4a, 0x6f, 0x73, 0xe2, 0x65, 0x20, 0x4d, 0xe8, 0x75, 0x6c, 0x6c, 0x65, 0x72]))).toBe('José Müller');
    expect(decodeAnsel(new Uint8Array([0xa1, 0xb1]))).toBe('Łł');
  });

  it('заголовок говорит ANSEL, а внутри UTF-8 — верим содержимому', () => {
    expect(detectEncoding(strToU8('0 HEAD\n1 CHAR ANSEL\n1 NOTE Ёлка'))).toBe('utf-8');
  });
});

describe('даты GEDCOM', () => {
  it.each([
    ['12 MAR 1950', '12.03.1950'],
    ['ABT 1950', 'ок. 1950'],
    ['EST 1950', 'ок. 1950'],
    ['CAL 1950', 'ок. 1950'],
    ['BEF 1920', 'до 1920'],
    ['AFT 1945', 'после 1945'],
    ['BET 1900 AND 1905', 'между 1900 и 1905'],
    ['FROM 1902 TO 1903', 'между 1902 и 1903'],
    ['INT 1924 (around the summer)', '1924'],
    ['@#DGREGORIAN@ 1 JAN 1900', '01.01.1900'],
    ['10 FEB 1700/01', '10.02.1701'],
    ['(во время войны)', 'во время войны'],
    ['@#DJULIAN@ 1 JAN 1960', '@#DJULIAN@ 1 JAN 1960'],
  ])('%s → %s', (g, ru) => {
    expect(formatFuzzyDate(fromGedcomDate(g), 'ru')).toBe(ru);
  });

  it('обратно', () => {
    expect(toGedcomDate(fromGedcomDate('BET 1900 AND 1905'))).toEqual({ value: 'BET 1900 AND 1905' });
    expect(toGedcomDate({ q: 'about', date: { y: 1950, m: 3 } })).toEqual({ value: 'ABT MAR 1950' });
    expect(toGedcomDate({ text: 'зимой' })).toEqual({ phrase: 'зимой' });
  });
});

describe('импорт: файл в стиле MyHeritage (5.5.1)', () => {
  const { tree, report } = importGedcomFile(fixture('myheritage-like.ged'), 'Семья.ged');
  const mikhail = person(tree, 'Михаил');

  it('люди, семьи, отчёт', () => {
    expect(tree.name).toBe('Семья');
    expect(report).toMatchObject({ version: '5.5.1', encoding: 'utf-8', source: 'MYHERITAGE', people: 6, families: 2, photosMissing: 1 });
    // Считаются поля верхнего уровня записей (третий _UID — внутри записи источника)
    expect(report.preserved).toMatchObject({ _UPD: 1, RIN: 2, _UID: 2, SOUR: 2 });
  });

  it('имя, отчество (из «Михаил Андреевич»), даты, место, профессия, примечание', () => {
    expect(mikhail.names).toEqual({ given: 'Михаил', patronymic: 'Андреевич', surname: 'Вымыслов' });
    expect(date(mikhail, 'birth')).toBe('05.06.1931');
    expect(mikhail.birth?.place).toBe('Казань, Россия');
    expect(date(mikhail, 'death')).toBe('между 1990 и 1995');
    expect(mikhail.occupation).toBe('Инженер-строитель');
    expect(mikhail.notes).toBe('Михаил Андреевич строил мосты по всему Поволжью. После выхода на пенсию работал над книгой воспоминаний.\nКнига так и не была издана.');
    // Ссылка на источник у рождения сохранена
    expect(mikhail.gedcom?.events?.BIRT?.[0]).toMatchObject({ tag: 'SOUR', value: '@S1@' });
  });

  it('девичья фамилия, «умерла» без даты, приёмная дочь, развод', () => {
    const vera = person(tree, 'Вера');
    expect(vera.names.birthSurname).toBe('Придуманова');
    expect(vera.living).toBe(false);
    const olga = person(tree, 'Ольга');
    expect(parentsOf(tree, olga.id).map((p) => p.relation)).toEqual(['adopted', 'adopted']);
    const andrey = person(tree, 'Андрей');
    expect(spousesOf(tree, andrey.id)[0]!.family.status).toBe('divorced');
  });
});

describe('импорт: Gramps (5.5.1) и GEDCOM 7.0', () => {
  it('Gramps: крещение вместо рождения, юлианская дата текстом, связи и SUBM сохранены', () => {
    const { tree, report } = importGedcomFile(fixture('gramps-like.ged'), 'family.ged');
    expect(report.people).toBe(3);
    expect(date(person(tree, 'Peter'), 'birth')).toBe('до 02.04.1925');
    expect(date(person(tree, 'John'), 'death')).toBe('@#DJULIAN@ 1 JAN 1960');
    expect(date(person(tree, 'Mary'), 'birth')).toBe('между 1902 и 1903');
    expect(person(tree, 'Peter').gedcom?.extra?.[0]).toMatchObject({ tag: 'ASSO' });
    expect(tree.gedcomRecords?.map((r) => r.tag)).toEqual(['SUBM']);
    expect(report.datesAsText).toBe(1);
  });

  it('7.0: SNOTE, PHRASE, опека, EXID и свои теги; фото из GEDZIP', () => {
    const ged = fixture('gedcom7.ged');
    const plain = importGedcomFile(ged, 'x.ged');
    const anna = person(plain.tree, 'Anna');
    expect(plain.report.version).toBe('7.0');
    expect(anna.notes).toBe('Anna loved music.\nShe played the violin.');
    expect(date(anna, 'death')).toBe('Sometime during the war');
    expect(anna.gedcom?.extra?.map((n) => n.tag)).toEqual(['EXID', '_SKYPE']);
    expect(parentsOf(plain.tree, person(plain.tree, 'Clara').id)[0]!.relation).toBe('foster');
    expect(plain.report.photosMissing).toBe(1);

    const gdz = zipSync({ 'gedcom.ged': ged, 'media/anna.jpg': new Uint8Array([1, 2, 3]) });
    const zipped = importGedcomFile(gdz, 'x.gdz');
    expect(zipped.photos).toEqual([{ personId: person(zipped.tree, 'Anna').id, bytes: new Uint8Array([1, 2, 3]), name: 'media/anna.jpg', caption: 'Anna at 20' }]);
  });

  it('файл в Windows-1251 из русской программы', () => {
    const bytes = cp1251('0 HEAD\n1 CHAR ANSI\n0 @I1@ INDI\n1 NAME Фёдор Кузьмич /Ёлкин/\n1 SEX M\n0 TRLR');
    const { tree, report } = importGedcom(bytes, 'old.ged');
    expect(report.encoding).toBe('windows-1251');
    expect(Object.values(tree.people)[0]!.names).toEqual({ given: 'Фёдор', patronymic: 'Кузьмич', surname: 'Ёлкин' });
  });

  it('распознавание GEDCOM', () => {
    expect(looksLikeGedcom(strToU8('0 HEAD\n'))).toBe(true);
    expect(looksLikeGedcom(strToU8('PK...'), 'a.gdz')).toBe(true);
    expect(looksLikeGedcom(strToU8('{"format":"kinmap"}'))).toBe(false);
  });
});

// ─── Туда и обратно ─────────────────────────────────────────────────────────

/** Сравнимый вид древа: люди по имени + даты + родители + супруги */
function snapshot(tree: TreeData) {
  const key = (p: Person) => `${fullName(p)}|${formatFuzzyDate(p.birth?.date, 'ru')}`;
  return Object.values(tree.people)
    .map((p) => ({
      who: key(p),
      sex: p.sex,
      birth: p.birth,
      death: p.death,
      birthSurname: p.names.birthSurname,
      occupation: p.occupation,
      notes: p.notes,
      parents: parentsOf(tree, p.id).map((x) => `${key(x.person)}:${x.relation}`).sort(),
      spouses: spousesOf(tree, p.id).map((x) => `${key(x.person)}:${x.family.status}:${formatFuzzyDate(x.family.marriage?.date, 'ru')}`).sort(),
    }))
    .sort((a, b) => a.who.localeCompare(b.who));
}

describe('экспорт → импорт: ничего не теряется', () => {
  const demo = createDemoTree('Демо');

  it.each(['5.5.1', '7.0'] as const)('демо-семья, GEDCOM %s', (version) => {
    const out = exportGedcom(demo, {}, { ...OPTS, version });
    expect(out.extension).toBe('ged');
    const text = strFromU8(out.bytes);
    if (version === '7.0') {
      expect(text).toContain('2 VERS 7.0');
      expect(text).not.toMatch(/ CONC /);
      expect(text).toContain('2 PEDI ADOPTED');
    } else {
      expect(text).toContain('1 CHAR UTF-8');
      expect(Math.max(...text.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(256);
    }
    const back = importGedcomFile(out.bytes, 'demo.ged').tree;
    expect(snapshot(back)).toEqual(snapshot(demo));
  });

  it('сохранённые поля и исходные идентификаторы возвращаются', () => {
    const first = importGedcomFile(fixture('myheritage-like.ged'), 'f.ged');
    const text = strFromU8(exportGedcom(first.tree, {}, OPTS).bytes);
    expect(text).toContain('0 @I1@ INDI');
    expect(text).toContain('1 _UID 6A2E7B1F0C9D4E5F8A7B6C5D4E3F2A1B');
    expect(text).toContain('0 @S1@ SOUR');
    expect(text).toContain('2 SOUR @S1@');
    expect(text).toContain('3 PAGE Запись № 117');
    const second = importGedcomFile(strToU8(text), 'f.ged');
    expect(snapshot(second.tree)).toEqual(snapshot(first.tree));
    expect(second.report.preserved).toEqual(first.report.preserved);
  });

  it('скрытие живых: имя «Living», без дат, мест, заметок и сохранённых полей', () => {
    const out = exportGedcom(demo, {}, { ...OPTS, hideLiving: true });
    const text = strFromU8(out.bytes);
    const back = importGedcomFile(out.bytes, 'p.ged').tree;
    const living = Object.values(back.people).filter((p) => p.names.given === 'Living');
    expect(out.livingHidden).toBe(living.length);
    expect(living.length).toBeGreaterThan(10);
    for (const p of living) {
      expect(p.birth).toBeUndefined();
      expect(p.names.patronymic).toBeUndefined();
    }
    // Связи и фамилии остались, умершие — полностью
    expect(text).toContain('Living /Демидов/');
    expect(text).not.toContain('Алексей');
    expect(text).not.toContain('Самарканд');
    expect(date(person(back, 'Пётр'), 'death')).toBe('1968');
  });

  it('фото: 5.5.1 — zip, 7.0 — gdz; при импорте фото возвращаются', () => {
    const base = createDemoTree('Ф');
    const id = Object.keys(base.people)[0]!;
    const tree = { ...base, people: { ...base.people, [id]: { ...base.people[id]!, photos: [{ id: 'phabc1', mime: 'image/webp', w: 2, h: 2, caption: 'Подпись' }] } } };
    const media = { phabc1: new Uint8Array([7, 7, 7]) };
    for (const version of ['5.5.1', '7.0'] as const) {
      const out = exportGedcom(tree, media, { ...OPTS, version, includePhotos: true });
      expect(out.extension).toBe(version === '7.0' ? 'gdz' : 'zip');
      expect(Object.keys(unzipSync(out.bytes))).toContain('photos/phabc1.webp');
      const back = importGedcomFile(out.bytes, `x.${out.extension}`);
      expect(back.photos).toHaveLength(1);
      expect(back.photos[0]).toMatchObject({ bytes: new Uint8Array([7, 7, 7]), caption: 'Подпись' });
    }
  });
});
