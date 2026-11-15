import { describe, expect, it } from 'vitest';
import { exportGedcom } from '../gedcom/export';
import { importGedcomFile } from '../gedcom/import';
import { autoVariant, namesIn, suggestLang, transliterate } from './nameVariants';
import { addPerson, createTree } from './ops';
import { joinName, matchesQuery } from './queries';
import type { Person } from './types';
import { normalizeTree } from './validate';

const person = (): Person => ({
  id: 'p1',
  sex: 'M',
  names: {
    given: 'Иван',
    patronymic: 'Петрович',
    surname: 'Демидов',
    variants: [{ lang: 'en', given: 'Ivan', surname: 'Demidov' }],
  },
});

describe('транслитерация', () => {
  it.each([
    ['Ўткир Қаҳҳоров', 'uz', 'Oʻtkir Qahhorov'],
    ['Шерзод Ғуломович', 'uz', 'Sherzod Gʻulomovich'],
    ['Елена Сергеевна', 'uz', 'Yelena Sergeyevna'],
    ['Хуршид', 'uz', 'Xurshid'],
    ['Хуршид', 'en', 'Khurshid'],
    ['Жасур', 'en', 'Zhasur'],
    ['Юлия', 'en', 'Yuliya'],
  ])('%s → %s: %s', (src, lang, out) => {
    expect(transliterate(src, lang)).toBe(out);
  });

  it.each([
    ['Oʻtkir Qahhorov', 'uz-Cyrl', 'Ўткир Қаҳҳоров'],
    ["G'ulomov Sherzod", 'uz-Cyrl', 'Ғуломов Шерзод'],
    ['Shoxrux Ergashev', 'ru', 'Шохрух Эргашев'],
    ['Qahhorov', 'ru', 'Каххоров'],
  ])('%s → %s: %s', (src, lang, out) => {
    expect(transliterate(src, lang)).toBe(out);
  });

  it('пару, для которой правил нет, не трогаем', () => {
    expect(transliterate('Иван', 'ar')).toBeNull();
    expect(transliterate('Ivan', 'en')).toBeNull();
  });

  it('вариант заполняется по основному имени', () => {
    expect(autoVariant({ given: 'Иван', patronymic: 'Петрович', surname: 'Демидов' }, 'uz')).toEqual({
      lang: 'uz',
      given: 'Ivan',
      patronymic: 'Petrovich',
      surname: 'Demidov',
    });
  });

  it('язык нового варианта: кириллица → латиница, латиница → русский', () => {
    expect(suggestLang({ given: 'Иван' }, [], 'ru')).toBe('uz');
    expect(suggestLang({ given: 'Иван' }, ['uz'], 'ru')).toBe('en');
    expect(suggestLang({ given: 'Karim' }, [], 'uz')).toBe('ru');
  });
});

describe('показ и поиск', () => {
  it('на языке варианта — его поля поверх основного имени', () => {
    expect(joinName(namesIn(person(), 'en'))).toBe('Ivan Petrovich Demidov');
    expect(joinName(namesIn(person(), 'ru'))).toBe('Иван Петрович Демидов');
    expect(joinName(namesIn(person(), undefined))).toBe('Иван Петрович Демидов');
  });

  it('поиск находит по варианту', () => {
    expect(matchesQuery(person(), 'ivan demidov')).toBe(true);
  });
});

describe('сохранение', () => {
  it('варианты переживают чтение файла; пустые и без языка отбрасываются', () => {
    let t = createTree('Т');
    t = addPerson(t, { sex: 'M', names: person().names }).tree;
    const raw = JSON.parse(JSON.stringify(t));
    const id = Object.keys(raw.people)[0]!;
    raw.people[id].names.variants.push({ lang: 'uz' }, { given: 'Без языка' }, 'мусор');
    const { tree } = normalizeTree(raw);
    expect(tree.people[id]!.names.variants).toEqual([{ lang: 'en', given: 'Ivan', surname: 'Demidov' }]);
  });

  it.each(['5.5.1', '7.0'] as const)('GEDCOM %s: варианты выгружаются и читаются обратно', (version) => {
    let t = createTree('Т');
    t = addPerson(t, {
      sex: 'M',
      names: {
        given: 'Иван',
        patronymic: 'Петрович',
        surname: 'Демидов',
        variants: [{ lang: 'uz', given: 'Ivan', patronymic: 'Petrovich', surname: 'Demidov' }],
      },
    }).tree;
    const out = exportGedcom(t, {}, { version, hideLiving: false, includePhotos: false, appVersion: 'test', currentYear: 2026 });
    const back = Object.values(importGedcomFile(out.bytes, 'x.ged').tree.people)[0]!;
    expect(back.names.given).toBe('Иван');
    expect(back.names.variants).toEqual([{ lang: 'uz', given: 'Ivan', patronymic: 'Petrovich', surname: 'Demidov' }]);
  });
});
