import { unzipSync } from 'fflate';
import { newFamilyId, newPersonId } from '../model/ids';
import { createTree } from '../model/ops';
import type {
  ChildRelation,
  Family,
  FamilyChild,
  FuzzyDate,
  GedcomExtra,
  GedNode,
  LifeEvent,
  Person,
  PersonId,
  PersonNames,
  Sex,
  TreeData,
} from '../model/types';
import { normalizeTree } from '../model/validate';
import { fromGedcomDate } from './dates';
import { decodeGedcom, type GedEncoding } from './encoding';
import { child, children, parseLines, pointer } from './lines';

// Импорт GEDCOM 5.5.1 / 7.0 и GEDZIP (.gdz — архив с GEDCOM и фото).
//
// Что разбираем: людей (имена, пол, рождение, смерть, профессия, примечания, фото),
// семьи (пары, дети, брак, развод, усыновление). Всё остальное — источники, адреса,
// собственные теги программ — не выбрасываем: храним как есть и возвращаем при экспорте.

export interface ImportReport {
  version: string;
  encoding: GedEncoding;
  /** Программа, создавшая файл (HEAD.SOUR) */
  source?: string;
  people: number;
  families: number;
  /** Фото, найденные в архиве / упомянутые, но отсутствующие */
  photos: number;
  photosMissing: number;
  /** Даты, сохранённые текстом (не удалось разобрать или другой календарь) */
  datesAsText: number;
  /** Незнакомые теги, сохранённые для экспорта: тег → сколько раз */
  preserved: Record<string, number>;
  badLines: number;
}

export interface PendingPhoto {
  personId: PersonId;
  bytes: Uint8Array;
  name: string;
  caption?: string;
}

export interface ImportResult {
  tree: TreeData;
  report: ImportReport;
  /** Фото из GEDZIP — UI их сожмёт и добавит людям */
  photos: PendingPhoto[];
}

export class GedcomError extends Error {
  constructor(public code: 'notGedcom' | 'noPeople') {
    super(code);
    this.name = 'GedcomError';
  }
}

/** Похоже ли содержимое на GEDCOM (или архив с ним) */
export function looksLikeGedcom(bytes: Uint8Array, fileName = ''): boolean {
  if (/\.(ged|gedcom|gdz)$/i.test(fileName)) return true;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 64)).replace(/[\u0000﻿ï»¿ÿþ]/g, '');
  return /^\s*0\s+HEAD/.test(head);
}

/** Импорт файла: GEDCOM-текст или zip-архив (GEDZIP) */
export function importGedcomFile(bytes: Uint8Array, fileName: string): ImportResult {
  // zip начинается с «PK»
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new GedcomError('notGedcom');
    }
    const gedName =
      Object.keys(files).find((n) => n.toLowerCase() === 'gedcom.ged') ??
      Object.keys(files).find((n) => /\.ged(com)?$/i.test(n));
    if (!gedName) throw new GedcomError('notGedcom');
    return importGedcom(files[gedName]!, fileName, files);
  }
  return importGedcom(bytes, fileName);
}

const PATRONYMIC = /(вич|вна|ична|чна|ич|оглы|оглу|кызы|угли|qizi|o['ʻ‘]g['ʻ‘]?li)$/i;

/** «Иван Петрович /Сидоров/» → имя, отчество, фамилия */
function parseName(node: GedNode): PersonNames {
  const names: PersonNames = {};
  const value = node.value ?? '';
  const m = value.match(/^(.*?)\s*\/(.*?)\/\s*(.*)$/);
  let given = (m ? m[1]! : value).trim();
  const surname = m ? m[2]!.trim() : '';
  const givn = child(node, 'GIVN')?.value?.trim();
  const surn = child(node, 'SURN')?.value?.trim();
  const patr = (child(node, '_PATR') ?? child(node, '_MIDN') ?? child(node, '_PATRONYM'))?.value?.trim();
  if (givn) given = givn;
  if (patr) {
    names.patronymic = patr;
    given = given.replace(new RegExp(`\\s*${patr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim();
  } else {
    // Русские программы пишут отчество вместе с именем: «Иван Петрович»
    const words = given.split(/\s+/);
    if (words.length >= 2 && PATRONYMIC.test(words[words.length - 1]!)) {
      names.patronymic = words.pop();
      given = words.join(' ');
    }
  }
  if (given) names.given = given;
  if (surn || surname) names.surname = surn || surname;
  return names;
}

const KNOWN_INDI = new Set(['NAME', 'SEX', 'BIRT', 'DEAT', 'OCCU', 'NOTE', 'SNOTE', 'FAMC', 'FAMS', 'OBJE', 'CHR', 'BAPM', 'BURI', 'CREM']);
const KNOWN_FAM = new Set(['HUSB', 'WIFE', 'CHIL', 'MARR', 'DIV', '_KM_STATUS']);
const KNOWN_EVENT = new Set(['DATE', 'PLAC']);
/** Записи верхнего уровня, которые мы разбираем сами (остальные сохраняем) */
const KNOWN_RECORDS = new Set(['HEAD', 'TRLR', 'INDI', 'FAM', 'NOTE', 'SNOTE', 'OBJE']);

export function importGedcom(bytes: Uint8Array, fileName: string, zipFiles?: Record<string, Uint8Array>): ImportResult {
  const { text, encoding } = decodeGedcom(bytes);
  const { records, badLines } = parseLines(text);
  const head = records.find((r) => r.tag === 'HEAD');
  if (!head && !records.some((r) => r.tag === 'INDI')) throw new GedcomError('notGedcom');

  const report: ImportReport = {
    version: child(child(head, 'GEDC'), 'VERS')?.value ?? '5.5.1',
    encoding,
    source: child(head, 'SOUR')?.value ?? undefined,
    people: 0,
    families: 0,
    photos: 0,
    photosMissing: 0,
    datesAsText: 0,
    preserved: {},
    badLines: badLines.length,
  };
  const preserve = (nodes: GedNode[]) => {
    for (const n of nodes) report.preserved[n.tag] = (report.preserved[n.tag] ?? 0) + 1;
    return nodes;
  };

  // Записи примечаний и фото — по ссылкам
  const notes = new Map<string, string>();
  const objects = new Map<string, GedNode>();
  for (const r of records) {
    if ((r.tag === 'NOTE' || r.tag === 'SNOTE') && r.xref) notes.set(r.xref, r.value ?? '');
    if (r.tag === 'OBJE' && r.xref) objects.set(r.xref, r);
  }

  const date = (n: GedNode | undefined): FuzzyDate | undefined => {
    const raw = n?.value ?? child(n, 'PHRASE')?.value;
    const d = n?.value ? fromGedcomDate(n.value) : raw ? { text: raw } : undefined;
    if (d && !d.date) report.datesAsText++;
    return d;
  };

  /** Событие: дата, место и «прочее» (источники, примечания…) */
  const event = (n: GedNode | undefined): { ev?: LifeEvent; extra: GedNode[] } => {
    if (!n) return { extra: [] };
    const ev: LifeEvent = {};
    const d = date(child(n, 'DATE'));
    if (d) ev.date = d;
    const place = child(n, 'PLAC')?.value?.trim();
    if (place) ev.place = place;
    return { ev: ev.date || ev.place ? ev : undefined, extra: preserve((n.children ?? []).filter((c) => !KNOWN_EVENT.has(c.tag))) };
  };

  const tree = createTree(fileName.replace(/\.(ged|gedcom|gdz|zip)$/i, '') || 'GEDCOM');
  const people: Record<PersonId, Person> = {};
  const byXref = new Map<string, PersonId>();
  const pendingPhotos: PendingPhoto[] = [];
  const pedigree = new Map<string, ChildRelation>(); // «xrefЧеловека|xrefСемьи» → тип связи

  for (const r of records) {
    if (r.tag !== 'INDI') continue;
    const id = newPersonId();
    if (r.xref) byXref.set(r.xref, id);
    const nameNodes = children(r, 'NAME');
    const main = nameNodes.find((n) => !/birth|maiden|aka|married/i.test(child(n, 'TYPE')?.value ?? '')) ?? nameNodes[0];
    const names = main ? parseName(main) : {};
    const birthName = nameNodes.find((n) => n !== main && /birth|maiden/i.test(child(n, 'TYPE')?.value ?? ''));
    const birthSurname = birthName ? parseName(birthName).surname : undefined;
    if (birthSurname && birthSurname !== names.surname) names.birthSurname = birthSurname;

    const sexValue = child(r, 'SEX')?.value?.trim().toUpperCase();
    const person: Person = { id, sex: sexValue === 'M' || sexValue === 'F' ? (sexValue as Sex) : 'U', names };
    const ged: GedcomExtra = {};
    if (r.xref) ged.xref = r.xref;
    const events: Record<string, GedNode[]> = {};

    // Рождение; если его нет — крещение («родился до …»)
    const birt = event(child(r, 'BIRT'));
    if (birt.ev) person.birth = birt.ev;
    if (birt.extra.length) events.BIRT = birt.extra;
    if (!person.birth) {
      const chr = event(child(r, 'CHR') ?? child(r, 'BAPM'));
      if (chr.ev?.date?.date) chr.ev.date = { q: 'before', date: chr.ev.date.date };
      if (chr.ev) person.birth = chr.ev;
    }
    // Смерть; если её нет — похороны («умер до …»). «1 DEAT Y» — умер, даты нет
    const deatNode = child(r, 'DEAT');
    const deat = event(deatNode);
    if (deat.ev) person.death = deat.ev;
    if (deat.extra.length) events.DEAT = deat.extra;
    if (!person.death) {
      const buri = event(child(r, 'BURI') ?? child(r, 'CREM'));
      if (buri.ev?.date?.date) buri.ev.date = { q: 'before', date: buri.ev.date.date };
      if (buri.ev) person.death = buri.ev;
    }
    if (deatNode && !person.death) person.living = false;

    const occu = children(r, 'OCCU').map((o) => o.value?.trim()).filter(Boolean);
    if (occu.length) person.occupation = occu.join(', ');

    const noteTexts = [...children(r, 'NOTE'), ...children(r, 'SNOTE')]
      .map((n) => notes.get(pointer(n.value) ?? '') ?? (pointer(n.value) ? '' : (n.value ?? '')))
      .map((s) => s.trim())
      .filter(Boolean);
    if (noteTexts.length) person.notes = noteTexts.join('\n\n');

    // Тип связи с родителями (усыновление)
    for (const famc of children(r, 'FAMC')) {
      const fx = pointer(famc.value);
      const pedi = child(famc, 'PEDI')?.value?.toLowerCase();
      if (fx && r.xref) {
        pedigree.set(`${r.xref}|${fx}`, pedi === 'adopted' ? 'adopted' : pedi === 'foster' ? 'foster' : 'birth');
      }
    }

    // Фото: встроенные OBJE (5.5.1) или ссылки на записи OBJE (7.0)
    for (const o of children(r, 'OBJE')) {
      const obj = pointer(o.value) ? objects.get(pointer(o.value)!) : o;
      for (const file of children(obj, 'FILE')) {
        const path = file.value?.trim() ?? '';
        const form = (child(file, 'FORM')?.value ?? child(obj, 'FORM')?.value ?? path.split('.').pop() ?? '').toLowerCase();
        if (!/jpe?g|png|webp|gif|bmp|image\//.test(form)) continue;
        const found = zipFiles ? findInZip(zipFiles, path) : undefined;
        const caption = (child(file, 'TITL') ?? child(obj, 'TITL'))?.value?.trim();
        if (found) {
          pendingPhotos.push({ personId: id, bytes: found, name: path, caption: caption || undefined });
          report.photos++;
        } else {
          report.photosMissing++;
        }
      }
    }

    const extra = preserve((r.children ?? []).filter((c) => !KNOWN_INDI.has(c.tag)));
    if (extra.length) ged.extra = extra;
    if (Object.keys(events).length) ged.events = events;
    if (Object.keys(ged).length) person.gedcom = ged;
    people[id] = person;
    report.people++;
  }

  const families: Record<string, Family> = {};
  for (const r of records) {
    if (r.tag !== 'FAM') continue;
    const partners = [...children(r, 'HUSB'), ...children(r, 'WIFE')]
      .map((n) => byXref.get(pointer(n.value) ?? ''))
      .filter((x): x is PersonId => !!x);
    const kids: FamilyChild[] = [];
    for (const c of children(r, 'CHIL')) {
      const cx = pointer(c.value);
      const cid = byXref.get(cx ?? '');
      if (!cid || kids.some((k) => k.id === cid)) continue;
      // Тип связи: INDI.FAMC.PEDI или теги Family Tree Maker (_FREL/_MREL)
      let relation = pedigree.get(`${cx}|${r.xref}`) ?? 'birth';
      const frel = (child(c, '_FREL')?.value ?? child(c, '_MREL')?.value ?? '').toLowerCase();
      if (frel.includes('adopt')) relation = 'adopted';
      else if (frel.includes('foster')) relation = 'foster';
      kids.push({ id: cid, relation });
    }
    const unique = [...new Set(partners)].slice(0, 2);
    if (unique.length + kids.length < 2) continue;

    const ged: GedcomExtra = {};
    if (r.xref) ged.xref = r.xref;
    const events: Record<string, GedNode[]> = {};
    const marr = event(child(r, 'MARR'));
    const div = event(child(r, 'DIV'));
    if (marr.extra.length) events.MARR = marr.extra;
    if (div.extra.length) events.DIV = div.extra;
    const family: Family = {
      id: newFamilyId(),
      partners: unique,
      status: child(r, 'DIV') ? 'divorced' : child(r, 'MARR') ? 'married' : 'unknown',
      children: kids,
    };
    // Свой тег KinMap: статусы, которых нет в стандарте
    const kmStatus = child(r, '_KM_STATUS')?.value?.trim();
    if (kmStatus === 'widowed' || kmStatus === 'partners') family.status = kmStatus;
    if (marr.ev) family.marriage = marr.ev;
    if (div.ev) family.divorce = div.ev;
    const extra = preserve((r.children ?? []).filter((c) => !KNOWN_FAM.has(c.tag)));
    if (extra.length) ged.extra = extra;
    if (Object.keys(events).length) ged.events = events;
    if (Object.keys(ged).length) family.gedcom = ged;
    families[family.id] = family;
    report.families++;
  }

  if (!report.people) throw new GedcomError('noPeople');

  // Незнакомые записи верхнего уровня (источники SOUR, хранилища REPO…) сохраняем
  const otherRecords = preserve(records.filter((r) => !KNOWN_RECORDS.has(r.tag)));
  // Записи примечаний, на которые ссылаются не только люди (например, источники), тоже сохраняем
  const keptNotes = records.filter(
    (r) => (r.tag === 'NOTE' || r.tag === 'SNOTE') && r.xref && JSON.stringify(otherRecords).includes(`@${r.xref}@`),
  );

  // Через normalizeTree — те же проверки, что и при открытии .kinmap
  const { tree: normalized } = normalizeTree({
    ...tree,
    people,
    families,
    rootPersonId: Object.keys(people)[0],
    gedcomRecords: [...otherRecords, ...keptNotes],
  });
  return { tree: normalized, report, photos: pendingPhotos };
}

/** Найти файл фото в архиве по пути из GEDCOM (разные слэши, регистр, только имя файла) */
function findInZip(files: Record<string, Uint8Array>, path: string): Uint8Array | undefined {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
  const target = norm(path);
  const names = Object.keys(files);
  const exact = names.find((n) => norm(n) === target);
  if (exact) return files[exact];
  const base = target.split('/').pop();
  const byName = names.find((n) => norm(n).split('/').pop() === base);
  return byName ? files[byName] : undefined;
}
