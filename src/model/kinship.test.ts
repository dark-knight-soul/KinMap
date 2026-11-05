import { describe, expect, it } from 'vitest';
import { createDemoTree } from './demo';
import { bloodRelations, findKinship } from './kinship';
import { bloodTermEn, bloodTermRu, nameKinship, type KinLang } from './kinshipTerms';
import { addPerson, createTree, linkChild, linkParent, linkPartners } from './ops';
import type { Sex, TreeData, UnionStatus } from './types';

// «Кем B приходится A»
function relation(tree: TreeData, a: string, b: string, lang: KinLang = 'ru') {
  const k = findKinship(tree, a, b);
  return k ? nameKinship(tree, k, lang).term : null;
}

describe('кровные термины (таблица)', () => {
  it.each([
    [1, 0, 'M', 'отец'],
    [2, 0, 'F', 'бабушка'],
    [3, 0, 'M', 'прадедушка'],
    [5, 0, 'M', 'прапрапрадедушка'],
    [8, 0, 'M', 'предок в 8-м поколении'],
    [0, 1, 'F', 'дочь'],
    [0, 3, 'M', 'правнук'],
    [1, 1, 'F', 'сестра'],
    [2, 1, 'M', 'дядя'],
    [2, 1, 'F', 'тётя'],
    [3, 1, 'M', 'двоюродный дедушка'],
    [3, 1, 'F', 'двоюродная бабушка'],
    [4, 1, 'M', 'двоюродный прадедушка'],
    [1, 2, 'M', 'племянник'],
    [1, 3, 'F', 'внучатая племянница'],
    [1, 4, 'M', 'правнучатый племянник'],
    [2, 2, 'M', 'двоюродный брат'],
    [3, 3, 'F', 'троюродная сестра'],
    [4, 4, 'M', 'четвероюродный брат'],
    [3, 2, 'M', 'двоюродный дядя'],
    [4, 2, 'M', 'троюродный дедушка'],
    [2, 3, 'F', 'двоюродная племянница'],
    [2, 4, 'M', 'двоюродный внучатый племянник'],
    [2, 2, 'U', 'двоюродный брат/сестра'],
  ] as [number, number, Sex, string][])('(%i вверх, %i вниз, %s) → %s', (a, b, g, term) => {
    expect(bloodTermRu(a, b, g)).toBe(term);
  });

  it('единокровные и единоутробные', () => {
    expect(bloodTermRu(1, 1, 'M', true, 'M')).toBe('единокровный брат');
    expect(bloodTermRu(1, 1, 'F', true, 'F')).toBe('единоутробная сестра');
  });

  it.each([
    [3, 0, 'M', 'great-grandfather'],
    [0, 2, 'F', 'granddaughter'],
    [2, 1, 'F', 'aunt'],
    [3, 1, 'M', 'great-uncle'],
    [1, 3, 'F', 'great-niece'],
    [2, 2, 'M', 'first cousin'],
    [3, 2, 'M', 'first cousin once removed'],
    [4, 2, 'F', 'first cousin twice removed'],
    [3, 3, 'M', 'second cousin'],
  ] as [number, number, Sex, string][])('en (%i, %i, %s) → %s', (a, b, g, term) => {
    expect(bloodTermEn(a, b, g)).toBe(term);
  });
});

describe('демо-семья', () => {
  const demo = createDemoTree('Д');
  const id = (name: string) => {
    const p = Object.values(demo.people).find((x) => `${x.names.given} ${x.names.surname}`.startsWith(name));
    if (!p) throw new Error(name);
    return p.id;
  };
  const rel = (a: string, b: string, lang?: KinLang) => relation(demo, id(a), id(b), lang);

  it.each([
    ['Алексей', 'Сергей', 'отец'],
    ['Алексей', 'Гульнара', 'мать'],
    ['Алексей', 'Иван', 'дедушка'],
    ['Алексей', 'Пётр', 'прадедушка'],
    ['Алексей', 'Ольга Лебедева', 'сестра'],
    ['Алексей', 'Максим', 'брат (по усыновлению)'],
    ['Сергей', 'Максим', 'приёмный сын'],
    ['Максим', 'Сергей', 'приёмный отец'],
    ['Алексей', 'Татьяна', 'тётя'],
    ['Алексей', 'Рустам', 'дядя'],
    ['Алексей', 'Дмитрий', 'двоюродный брат'],
    ['Алексей', 'Азиз', 'двоюродный брат'],
    ['Алексей', 'Дарья', 'племянница'],
    ['Алексей', 'Артём', 'сын'],
    ['Иван', 'Дарья', 'правнучка'],
    ['Артём', 'Дмитрий', 'двоюродный дядя'],
    ['Сергей', 'Виктор', 'единокровный брат'],
    ['Алексей', 'Марина', 'жена'],
    ['Алексей', 'Кира', 'бывшая жена'],
    ['Алексей', 'Павел', 'зять'],
    ['Виктор', 'Елена', 'мачеха'],
    ['Марина', 'Сергей', 'свёкор'],
    ['Марина', 'Гульнара', 'свекровь'],
    ['Марина', 'Ольга Лебедева', 'золовка'],
    ['Сергей', 'Марина', 'невестка'],
    ['Сергей', 'Павел', 'зять'],
    // Нет отдельного слова — описание с родительным падежом
    ['Марина', 'Иван', 'дедушка мужа'],
    ['Сергей', 'Кира', 'бывшая жена сына'],
    ['Павел', 'Марина', 'жена брата жены'],
  ])('%s → %s: %s', (a, b, term) => {
    expect(rel(a, b)).toBe(term);
  });

  it.each([
    ['Алексей', 'Пётр', 'great-grandfather'],
    ['Артём', 'Дмитрий', 'first cousin once removed'],
    ['Сергей', 'Марина', 'daughter-in-law'],
    ['Сергей', 'Виктор', 'half-brother'],
    ['Алексей', 'Кира', 'ex-wife'],
    ['Марина', 'Иван', "husband's grandfather"],
  ])('en: %s → %s: %s', (a, b, term) => {
    expect(rel(a, b, 'en')).toBe(term);
  });

  it('тот же человек и чужие люди', () => {
    expect(rel('Алексей', 'Алексей')).toBe('тот же человек');
    const t = addPerson(demo, { names: { given: 'Чужой' } });
    expect(relation(t.tree, id('Алексей'), t.id)).toBeNull();
  });
});

describe('родство через брак', () => {
  // Отдельная выдуманная семья со всеми «свойственниками»
  let tree = createTree('Т');
  const p: Record<string, string> = {};
  const add = (key: string, sex: Sex) => {
    const r = addPerson(tree, { sex, names: { given: key } });
    tree = r.tree;
    p[key] = r.id;
  };
  const marry = (a: string, b: string, status: UnionStatus = 'married') => {
    const r = linkPartners(tree, p[a]!, p[b]!, status);
    tree = r.tree;
    return r.familyId;
  };
  const kids = (fam: string, parent: string, ...children: string[]) => {
    for (const c of children) tree = linkChild(tree, p[parent]!, p[c]!, { familyId: fam }).tree;
  };

  (
    [
      ['Муж', 'M'], ['Жена', 'F'], ['ТестьЖ', 'M'], ['ТёщаЖ', 'F'], ['БратЖены', 'M'], ['СестраЖены', 'F'],
      ['МужСестры', 'M'], ['ОтецМужа', 'M'], ['МатьМужа', 'F'], ['БратМужа', 'M'], ['СестраМужа', 'F'],
      ['ЖенаБрата', 'F'], ['Сын', 'M'], ['ЖенаСына', 'F'], ['СватО', 'M'], ['СватьяМ', 'F'],
      ['Бывший', 'M'], ['СынЖены', 'M'], ['Мачеха', 'F'], ['СынМачехи', 'M'], ['ОтецСынаМачехи', 'M'],
    ] as [string, Sex][]
  ).forEach(([k, s]) => add(k, s));

  kids(marry('ТестьЖ', 'ТёщаЖ'), 'ТестьЖ', 'Жена', 'БратЖены', 'СестраЖены');
  marry('СестраЖены', 'МужСестры');
  const hp = marry('ОтецМужа', 'МатьМужа', 'divorced');
  kids(hp, 'ОтецМужа', 'Муж', 'БратМужа', 'СестраМужа');
  marry('БратМужа', 'ЖенаБрата');
  kids(marry('Муж', 'Жена'), 'Муж', 'Сын');
  kids(marry('СватО', 'СватьяМ'), 'СватО', 'ЖенаСына');
  marry('Сын', 'ЖенаСына');
  kids(marry('Жена', 'Бывший', 'divorced'), 'Жена', 'СынЖены');
  marry('ОтецМужа', 'Мачеха');
  kids(marry('Мачеха', 'ОтецСынаМачехи', 'divorced'), 'Мачеха', 'СынМачехи');

  const rel = (a: string, b: string, lang?: KinLang) => relation(tree, p[a]!, p[b]!, lang);

  it.each([
    ['Муж', 'ТестьЖ', 'тесть'],
    ['Муж', 'ТёщаЖ', 'тёща'],
    ['Муж', 'БратЖены', 'шурин'],
    ['Муж', 'СестраЖены', 'свояченица'],
    ['Муж', 'МужСестры', 'свояк'],
    ['Жена', 'ОтецМужа', 'свёкор'],
    ['Жена', 'МатьМужа', 'свекровь'],
    ['Жена', 'БратМужа', 'деверь'],
    ['Жена', 'СестраМужа', 'золовка'],
    ['Жена', 'ЖенаБрата', 'ятровка'],
    ['ТестьЖ', 'Муж', 'зять'],
    ['Муж', 'ЖенаСына', 'невестка'],
    ['Муж', 'СватО', 'сват'],
    ['Муж', 'СватьяМ', 'сватья'],
    ['Муж', 'СынЖены', 'пасынок'],
    ['СынЖены', 'Муж', 'отчим'],
    ['Сын', 'СынЖены', 'единоутробный брат'],
    ['Муж', 'Мачеха', 'мачеха'],
    ['Муж', 'СынМачехи', 'сводный брат'],
  ])('%s → %s: %s', (a, b, term) => {
    expect(rel(a, b)).toBe(term);
  });

  it.each([
    ['Муж', 'ТестьЖ', 'father-in-law'],
    ['Муж', 'БратЖены', 'brother-in-law'],
    ['Муж', 'МужСестры', 'brother-in-law'],
    ['Муж', 'СынЖены', 'stepson'],
    ['Муж', 'СынМачехи', 'stepbrother'],
    ['Муж', 'СватО', "son's wife's father"],
  ])('en: %s → %s: %s', (a, b, term) => {
    expect(rel(a, b, 'en')).toBe(term);
  });

  it('кровное родство важнее родства через брак', () => {
    // Брат мужа — он же и «муж сестры жены»? Нет: сначала ищется кровь
    expect(rel('БратМужа', 'Муж')).toBe('брат');
  });
});

describe('несколько связей (браки между родственниками)', () => {
  it('троюродные супруги: их ребёнок связан с прадедом двумя путями', () => {
    let tree = createTree('Т');
    const add = (g: string, sex: Sex = 'U') => {
      const r = addPerson(tree, { sex, names: { given: g } });
      tree = r.tree;
      return r.id;
    };
    const ded = add('Дед', 'M');
    const [s1, s2] = [add('Сын1', 'M'), add('Сын2', 'M')];
    tree = linkChild(tree, ded, s1).tree;
    tree = linkChild(tree, ded, s2).tree;
    const [g1, g2] = [add('Внук', 'M'), add('Внучка', 'F')];
    tree = linkChild(tree, s1, g1).tree;
    tree = linkChild(tree, s2, g2).tree;
    const [h, w] = [add('Правнук', 'M'), add('Правнучка', 'F')];
    tree = linkChild(tree, g1, h).tree;
    tree = linkParent(tree, w, g2).tree;
    // Правнук и правнучка — троюродные; поженились, у них ребёнок
    const fam = linkPartners(tree, h, w);
    tree = fam.tree;
    const child = add('Ребёнок');
    tree = linkChild(tree, h, child, { familyId: fam.familyId }).tree;

    expect(relation(tree, h, w)).toBe('троюродная сестра');
    // Дед — прапрадедушка ребёнка и через отца, и через мать: обе дороги по 4 поколения, связь одна
    expect(bloodRelations(tree, child, ded)).toEqual([{ up: 4, down: 0, via: ded }]);
    // Внук для ребёнка: дедушка (через отца) и ещё родственник через мать (через общего Деда)
    const rels = bloodRelations(tree, child, g1).map((r) => bloodTermRu(r.up, r.down, 'M'));
    expect(rels).toEqual(['дедушка', 'троюродный дедушка']);
    // Сын1: прадедушка через отца; через мать он — брат её деда
    expect(bloodRelations(tree, child, s1).map((r) => bloodTermRu(r.up, r.down, 'M'))).toEqual([
      'прадедушка',
      'двоюродный прадедушка',
    ]);
  });

  it('родные братья: одна связь, хотя общих предков много', () => {
    const demo = createDemoTree('Д');
    const id = (n: string) => Object.values(demo.people).find((p) => p.names.given === n)!.id;
    expect(bloodRelations(demo, id('Алексей'), id('Ирина'))).toHaveLength(1);
    expect(bloodRelations(demo, id('Артём'), id('Дмитрий')).map((r) => `${r.up}:${r.down}`)).toEqual(['3:2']);
  });
});
