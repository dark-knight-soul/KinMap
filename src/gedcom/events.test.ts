import { strFromU8, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { formatFuzzyDate } from '../model/dates';
import { createDemoTree } from '../model/demo';
import { eventTypeFromGedcom, sortEvents } from '../model/events';
import { packTree, unpackTree } from '../file/format';
import type { Person, TreeData } from '../model/types';
import { exportGedcom, type ExportOptions } from './export';
import { importGedcomFile } from './import';

// События жизни: перенос через GEDCOM и через файл .kinmap.

const OPTS: ExportOptions = { version: '5.5.1', hideLiving: false, includePhotos: false, appVersion: 'test', currentYear: 2026 };
const byGiven = (tree: TreeData, given: string, surname?: string) =>
  Object.values(tree.people).find((p) => p.names.given === given && (!surname || p.names.surname === surname))!;
/** События без id и в порядке дат — для сравнения */
const evs = (p: Person) =>
  sortEvents(p.events ?? []).map(({ id: _id, ...rest }) => ({ ...rest, date: formatFuzzyDate(rest.date, 'ru') || undefined }));

describe('события жизни', () => {
  const demo = createDemoTree('Демо');

  it.each(['5.5.1', '7.0'] as const)('GEDCOM %s: экспорт → импорт без потерь', (version) => {
    const out = exportGedcom(demo, {}, { ...OPTS, version });
    const text = strFromU8(out.bytes);
    expect(text).toContain('1 EDUC Механический техникум');
    expect(text).toContain('2 TYPE Military Service');
    expect(text).toContain('1 RETI');
    const back = importGedcomFile(out.bytes, 'demo.ged').tree;
    for (const [given, surname] of [['Пётр', 'Демидов'], ['Иван', 'Демидов'], ['Сергей', 'Демидов'], ['Гульнара'], ['Алексей']] as const) {
      expect(evs(byGiven(back, given, surname)), given).toEqual(evs(byGiven(demo, given, surname)));
    }
    // Профессия-строка и событие «работа» не смешиваются
    expect(byGiven(back, 'Пётр', 'Демидов').occupation).toBeUndefined();
  });

  it('импорт из других программ: свои теги, EVEN с типом, похороны и крещение рядом с рождением', () => {
    const ged = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Иван /Петров/',
      '1 BIRT',
      '2 DATE 1920',
      '1 BAPM',
      '2 DATE 1920',
      '2 PLAC Тула',
      '1 DEAT',
      '2 DATE 1990',
      '1 BURI',
      '2 PLAC Ваганьковское кладбище',
      '1 _MILT Армия',
      '2 DATE FROM 1941 TO 1945',
      '1 EVEN Медаль за отвагу',
      '2 TYPE Award',
      '2 DATE 1943',
      '1 EVEN',
      '2 TYPE Рыбалка с дедом',
      '2 NOTE Каждое лето',
      '2 SOUR @S1@',
      '1 OCCU Слесарь',
      '1 OCCU Мастер цеха',
      '2 DATE 1960',
      '0 @S1@ SOUR',
      '1 TITL Письма',
      '0 TRLR',
    ].join('\n');
    const tree = importGedcomFile(strToU8(ged), 'x.ged').tree;
    const p = Object.values(tree.people)[0]!;
    expect(p.occupation).toBe('Слесарь');
    const list = sortEvents(p.events ?? []);
    // По годам: 1920, 1941, 1943, 1960; без даты — в конце, в исходном порядке
    expect(list.map((e) => e.type)).toEqual(['baptism', 'military', 'award', 'work', 'burial', 'other']);
    const find = (t: string) => p.events!.find((e) => e.type === t)!;
    expect(find('award').title).toBe('Медаль за отвагу');
    expect(find('military').title).toBe('Армия');
    expect(find('burial').place).toBe('Ваганьковское кладбище');
    expect(find('other')).toMatchObject({ title: 'Рыбалка с дедом', note: 'Каждое лето' });
    expect(find('other').gedcom?.[0]).toMatchObject({ tag: 'SOUR', value: '@S1@' });
    expect(find('work').title).toBe('Мастер цеха');
    // Источник события возвращается при экспорте
    expect(strFromU8(exportGedcom(tree, {}, OPTS).bytes)).toMatch(/1 EVEN\r\n2 TYPE Рыбалка с дедом\r\n2 NOTE Каждое лето\r\n2 SOUR @S1@/);
  });

  it('файл .kinmap: события сохраняются, мусор отбрасывается', () => {
    const p = byGiven(demo, 'Иван', 'Демидов');
    const broken: TreeData = {
      ...demo,
      people: {
        ...demo.people,
        [p.id]: { ...p, events: [...p.events!, { id: 'x', type: 'хакер' as never }, { nope: 1 } as never] },
      },
    };
    const back = unpackTree(packTree(broken)).tree;
    expect(evs(back.people[p.id]!)).toEqual(evs(p));
  });

  it('тип по тегу GEDCOM', () => {
    expect(eventTypeFromGedcom('EDUC')).toBe('education');
    expect(eventTypeFromGedcom('EVEN', 'Military Service')).toBe('military');
    expect(eventTypeFromGedcom('EVEN', 'Служба в армии')).toBe('military');
    expect(eventTypeFromGedcom('EVEN', 'Орден Ленина')).toBe('award');
    expect(eventTypeFromGedcom('EVEN', 'Свадьба друга')).toBe('other');
    expect(eventTypeFromGedcom('NAME')).toBeUndefined();
  });
});
