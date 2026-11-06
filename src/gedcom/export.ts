import { strToU8, zipSync, type Zippable } from 'fflate';
import type { MediaStore } from '../file/format';
import { parentFamiliesOf, isLiving } from '../model/queries';
import type { Family, GedNode, LifeEvent, Person, TreeData } from '../model/types';
import { eventToGedcom, sortEvents } from '../model/events';
import { toGedcomDate } from './dates';
import { writeNodes } from './lines';

// Экспорт в GEDCOM 5.5.1 (максимальная совместимость: MyHeritage, Geni, Ancestry,
// FamilySearch, Gramps) и 7.0 (новый стандарт). Кодировка — всегда UTF-8.
//
// Скрытие живых (по умолчанию включено): у живых остаются только пол, фамилия
// и связи, имя заменяется на «Living», даты, места, заметки, фото и сохранённые
// поля (там могут быть адреса) — убираются.

export type GedcomVersion = '5.5.1' | '7.0';

export interface ExportOptions {
  version: GedcomVersion;
  hideLiving: boolean;
  /** Положить фото в архив (5.5.1 — .zip, 7.0 — .gdz) */
  includePhotos: boolean;
  appVersion: string;
  currentYear?: number;
}

export interface ExportResult {
  bytes: Uint8Array;
  extension: 'ged' | 'zip' | 'gdz';
  livingHidden: number;
}

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const LIVING_NAME = 'Living';

export function exportGedcom(tree: TreeData, media: MediaStore, opts: ExportOptions): ExportResult {
  const v7 = opts.version === '7.0';
  const people = Object.values(tree.people);
  const hidden = new Set(opts.hideLiving ? people.filter((p) => isLiving(p, opts.currentYear)).map((p) => p.id) : []);

  // Идентификаторы: исходные из GEDCOM (если уникальны) — чтобы ссылки в сохранённых полях не сломались
  const used = new Set<string>();
  for (const r of tree.gedcomRecords ?? []) if (r.xref) used.add(r.xref);
  const ids = new Map<string, string>();
  const assign = (id: string, original: string | undefined, prefix: string) => {
    let x = original && !used.has(original) ? original : undefined;
    for (let n = ids.size + 1; !x; n++) if (!used.has(`${prefix}${n}`)) x = `${prefix}${n}`;
    used.add(x);
    ids.set(id, x);
  };
  for (const p of people) assign(p.id, p.gedcom?.xref, 'I');
  for (const f of Object.values(tree.families)) assign(f.id, f.gedcom?.xref, 'F');

  const records: GedNode[] = [header(tree, opts)];
  const files: Zippable = {};
  const objects: GedNode[] = [];

  for (const p of people) {
    const priv = hidden.has(p.id);
    const node: GedNode = { tag: 'INDI', xref: ids.get(p.id), children: [] };
    const c = node.children!;
    c.push(nameNode(p, priv, v7));
    if (!priv && p.names.birthSurname) {
      c.push({
        tag: 'NAME',
        value: `${[p.names.given, p.names.patronymic].filter(Boolean).join(' ')} /${p.names.birthSurname}/`.trim(),
        children: [{ tag: 'TYPE', value: v7 ? 'BIRTH' : 'birth' }],
      });
    }
    c.push({ tag: 'SEX', value: p.sex === 'U' ? 'U' : p.sex });
    if (!priv) {
      pushEvent(c, 'BIRT', p.birth, p.gedcom?.events?.BIRT, v7);
      if (p.death || p.gedcom?.events?.DEAT) pushEvent(c, 'DEAT', p.death, p.gedcom?.events?.DEAT, v7);
      else if (p.living === false) c.push({ tag: 'DEAT', value: 'Y' });
      if (p.occupation) c.push({ tag: 'OCCU', value: p.occupation });
      for (const e of sortEvents(p.events ?? [])) c.push(eventToGedcom(e, dateNode(e.date, v7)));
      if (p.notes) c.push({ tag: 'NOTE', value: p.notes });
      if (opts.includePhotos) {
        for (const ph of p.photos ?? []) {
          const bytes = media[ph.id];
          if (!bytes) continue;
          const path = `photos/${ph.id}.${EXT[ph.mime] ?? 'jpg'}`;
          files[path] = [bytes, { level: 0 }];
          const file: GedNode = {
            tag: 'FILE',
            value: path,
            children: [{ tag: 'FORM', value: v7 ? ph.mime : (EXT[ph.mime] ?? 'jpg') }],
          };
          if (ph.caption) file.children!.push({ tag: 'TITL', value: ph.caption });
          if (v7) {
            const ox = `O${objects.length + 1}`;
            objects.push({ tag: 'OBJE', xref: ox, children: [file] });
            c.push({ tag: 'OBJE', value: `@${ox}@` });
          } else {
            c.push({ tag: 'OBJE', children: [file] });
          }
        }
      }
    }
    // Ссылки на семьи
    for (const f of parentFamiliesOf(tree, p.id)) {
      const rel = f.children.find((x) => x.id === p.id)!.relation;
      const famc: GedNode = { tag: 'FAMC', value: `@${ids.get(f.id)}@` };
      if (rel === 'adopted' || rel === 'foster') famc.children = [{ tag: 'PEDI', value: v7 ? rel.toUpperCase() : rel }];
      else if (rel === 'birth' && !v7) famc.children = [{ tag: 'PEDI', value: 'birth' }];
      c.push(famc);
    }
    for (const f of Object.values(tree.families)) {
      if (f.partners.includes(p.id)) c.push({ tag: 'FAMS', value: `@${ids.get(f.id)}@` });
    }
    if (!priv && p.gedcom?.extra) c.push(...p.gedcom.extra);
    records.push(node);
  }

  for (const f of Object.values(tree.families)) records.push(familyNode(tree, f, ids, hidden, v7));
  records.push(...objects);
  records.push(...(tree.gedcomRecords ?? []));
  records.push({ tag: 'TRLR' });

  const text = writeNodes(records, { allowConc: !v7, maxLine: v7 ? undefined : 255 }).join('\r\n') + '\r\n';
  // 7.0 требует UTF-8; метка BOM помогает старым Windows-программам понять кодировку 5.5.1
  const ged = strToU8((v7 ? '' : '﻿') + text);

  if (opts.includePhotos && Object.keys(files).length) {
    const zip = zipSync({ ...files, [v7 ? 'gedcom.ged' : `${safeName(tree.name)}.ged`]: ged });
    return { bytes: zip, extension: v7 ? 'gdz' : 'zip', livingHidden: hidden.size };
  }
  return { bytes: ged, extension: 'ged', livingHidden: hidden.size };
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80) || 'tree';

function header(tree: TreeData, opts: ExportOptions): GedNode {
  const now = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const date = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  const sour: GedNode = {
    tag: 'SOUR',
    value: 'KINMAP',
    children: [
      { tag: 'VERS', value: opts.appVersion },
      { tag: 'NAME', value: 'KinMap' },
    ],
  };
  if (opts.version === '7.0') {
    return {
      tag: 'HEAD',
      children: [
        { tag: 'GEDC', children: [{ tag: 'VERS', value: '7.0' }] },
        sour,
        { tag: 'DATE', value: date },
        { tag: 'NOTE', value: tree.name },
      ],
    };
  }
  return {
    tag: 'HEAD',
    children: [
      sour,
      { tag: 'DATE', value: date },
      { tag: 'GEDC', children: [{ tag: 'VERS', value: '5.5.1' }, { tag: 'FORM', value: 'LINEAGE-LINKED' }] },
      { tag: 'CHAR', value: 'UTF-8' },
      { tag: 'NOTE', value: tree.name },
    ],
  };
}

function nameNode(p: Person, priv: boolean, v7: boolean): GedNode {
  const n = p.names;
  const given = priv ? LIVING_NAME : [n.given, n.patronymic].filter(Boolean).join(' ');
  const node: GedNode = { tag: 'NAME', value: `${given} /${n.surname ?? ''}/`.trim(), children: [] };
  if (!priv && n.given) node.children!.push({ tag: 'GIVN', value: n.given });
  if (n.surname) node.children!.push({ tag: 'SURN', value: n.surname });
  // Отчество — собственным тегом (стандарт его не знает); в 7.0 такие теги тоже допустимы
  if (!priv && n.patronymic) node.children!.push({ tag: '_PATR', value: n.patronymic });
  if (priv && v7) node.children!.push({ tag: 'TYPE', value: 'OTHER', children: [{ tag: 'PHRASE', value: 'Living person — hidden' }] });
  if (!node.children!.length) delete node.children;
  return node;
}

/** Узел DATE: точная дата или фраза (в 7.0 — DATE.PHRASE, в 5.5.1 — текст в скобках) */
function dateNode(date: LifeEvent['date'], v7: boolean): GedNode | undefined {
  const d = toGedcomDate(date);
  if (d.value) return { tag: 'DATE', value: d.value };
  if (d.phrase) return v7 ? { tag: 'DATE', children: [{ tag: 'PHRASE', value: d.phrase }] } : { tag: 'DATE', value: `(${d.phrase})` };
  return undefined;
}

function pushEvent(out: GedNode[], tag: string, ev: LifeEvent | undefined, extra: GedNode[] | undefined, v7: boolean): void {
  if (!ev && !extra?.length) return;
  const node: GedNode = { tag, children: [] };
  const d = toGedcomDate(ev?.date);
  if (d.value) node.children!.push({ tag: 'DATE', value: d.value });
  else if (d.phrase) {
    node.children!.push(v7 ? { tag: 'DATE', children: [{ tag: 'PHRASE', value: d.phrase }] } : { tag: 'DATE', value: `(${d.phrase})` });
  }
  if (ev?.place) node.children!.push({ tag: 'PLAC', value: ev.place });
  if (extra) node.children!.push(...extra);
  // Событие без подробностей: «1 BIRT Y» — «известно, что было»
  if (!node.children!.length) {
    delete node.children;
    node.value = 'Y';
  }
  out.push(node);
}

function familyNode(tree: TreeData, f: Family, ids: Map<string, string>, hidden: Set<string>, v7: boolean): GedNode {
  const node: GedNode = { tag: 'FAM', xref: ids.get(f.id), children: [] };
  const c = node.children!;
  // HUSB/WIFE по полу; если пол неизвестен — первый HUSB, второй WIFE
  const sorted = [...f.partners].sort((a, b) => order(tree, a) - order(tree, b));
  sorted.forEach((pid, i) => {
    const sex = tree.people[pid]?.sex;
    const tag = sex === 'F' ? 'WIFE' : sex === 'M' ? 'HUSB' : i === 0 ? 'HUSB' : 'WIFE';
    c.push({ tag, value: `@${ids.get(pid)}@` });
  });
  for (const ch of f.children) c.push({ tag: 'CHIL', value: `@${ids.get(ch.id)}@` });
  // У пары живых людей даты брака тоже скрываем
  const priv = f.partners.some((p) => hidden.has(p));
  if (f.status === 'married' || f.status === 'divorced' || f.status === 'widowed' || f.marriage) {
    if (priv) c.push({ tag: 'MARR', value: 'Y' });
    else pushEvent(c, 'MARR', f.marriage ?? {}, f.gedcom?.events?.MARR, v7);
    if (!c.some((x) => x.tag === 'MARR')) c.push({ tag: 'MARR', value: 'Y' });
  }
  if (f.status === 'divorced') {
    if (priv) c.push({ tag: 'DIV', value: 'Y' });
    else {
      pushEvent(c, 'DIV', f.divorce ?? {}, f.gedcom?.events?.DIV, v7);
      if (!c.some((x) => x.tag === 'DIV')) c.push({ tag: 'DIV', value: 'Y' });
    }
  }
  // В GEDCOM нет статуса «вдовство» и «партнёры» — пишем свой тег, другие программы его пропустят
  if (f.status === 'widowed' || f.status === 'partners') c.push({ tag: '_KM_STATUS', value: f.status });
  if (!priv && f.gedcom?.extra) c.push(...f.gedcom.extra);
  return node;
}

const order = (tree: TreeData, id: string) => ({ M: 0, U: 1, F: 2 })[tree.people[id]?.sex ?? 'U'];
