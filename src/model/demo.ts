import { parseFuzzyDate } from './dates';
import { addPerson, createTree, linkChild, linkPartners } from './ops';
import type { ChildRelation, FamilyId, PersonId, Sex, TreeData, UnionStatus } from './types';

// Демонстрационная семья — ВЫДУМАННАЯ (совпадения с реальными людьми случайны).
// Нужна для кнопки «Посмотреть пример» и для тестов схемы.
// В ней есть сложные случаи: повторный брак, развод, единокровный брат, близнецы,
// приёмный ребёнок, 5 поколений.

export function createDemoTree(name: string): TreeData {
  let tree = createTree(name);

  const person = (
    given: string,
    surname: string,
    sex: Sex,
    born?: string,
    died?: string,
    place?: string,
    patronymic?: string,
  ): PersonId => {
    const r = addPerson(tree, {
      sex,
      names: { given, surname, patronymic },
      birth: born ? { date: parseFuzzyDate(born), place } : undefined,
      death: died ? { date: parseFuzzyDate(died) } : undefined,
    });
    tree = r.tree;
    return r.id;
  };
  const couple = (a: PersonId, b: PersonId, status: UnionStatus = 'married', married?: string): FamilyId => {
    const r = linkPartners(tree, a, b, status);
    tree = r.tree;
    if (married) {
      const f = tree.families[r.familyId]!;
      tree = { ...tree, families: { ...tree.families, [f.id]: { ...f, marriage: { date: parseFuzzyDate(married) } } } };
    }
    return r.familyId;
  };
  const kids = (family: FamilyId, parent: PersonId, children: PersonId[], relation: ChildRelation = 'birth') => {
    for (const c of children) tree = linkChild(tree, parent, c, { familyId: family, relation }).tree;
  };

  // Главный человек — его ставим первым, чтобы он стал корнем древа
  const alexey = person('Алексей', 'Демидов', 'M', '14.02.1985', undefined, 'Самарканд', 'Сергеевич');

  // Прадеды и прабабушки
  const petr = person('Пётр', 'Демидов', 'M', '1900', '1968', 'Тула');
  const anna = person('Анна', 'Демидова', 'F', 'ок. 1903', '1980', 'Тула');
  const grigory = person('Григорий', 'Соколов', 'M', '1898', '1942', 'Орёл');
  const maria = person('Мария', 'Соколова', 'F', '1901', '1975');
  const fedor = person('Фёдор', 'Каримов', 'M', 'до 1905', '1970', 'Бухара');
  const zoya = person('Зоя', 'Каримова', 'F', '1907', '1989', 'Бухара');
  const nikolay = person('Николай', 'Белов', 'M', '1902', '1961');
  const olga0 = person('Ольга', 'Белова', 'F', '1906', '1990');

  // Деды и бабушки
  const ivan = person('Иван', 'Демидов', 'M', '03.05.1925', '1999', 'Тула', 'Петрович');
  const valentina = person('Валентина', 'Орлова', 'F', '1926', '2004');
  const elena = person('Елена', 'Демидова', 'F', '1928', '2010', 'Орёл', 'Григорьевна');
  const timur = person('Тимур', 'Каримов', 'M', '1927', '2001', 'Бухара', 'Фёдорович');
  const nina = person('Нина', 'Каримова', 'F', '1930', '2015', undefined, 'Николаевна');

  // Родители, их братья и сёстры
  const viktor = person('Виктор', 'Демидов', 'M', '1948', undefined, 'Тула', 'Иванович');
  const sergey = person('Сергей', 'Демидов', 'M', '21.09.1952', undefined, 'Ташкент', 'Иванович');
  const tatyana = person('Татьяна', 'Ковалёва', 'F', '1955', undefined, 'Ташкент', 'Ивановна');
  const andrey = person('Андрей', 'Ковалёв', 'M', '1953');
  const gulnara = person('Гульнара', 'Демидова', 'F', '1957', undefined, 'Самарканд', 'Тимуровна');
  const rustam = person('Рустам', 'Каримов', 'M', '1960', undefined, 'Самарканд', 'Тимурович');
  const lola = person('Лола', 'Каримова', 'F', '1963');

  // Поколение главного человека
  const olga = person('Ольга', 'Лебедева', 'F', '10.06.1988', undefined, 'Ташкент', 'Сергеевна');
  const irina = person('Ирина', 'Демидова', 'F', '10.06.1988', undefined, 'Ташкент', 'Сергеевна');
  const maxim = person('Максим', 'Демидов', 'M', '1995', undefined, undefined, 'Сергеевич');
  const dmitry = person('Дмитрий', 'Ковалёв', 'M', '1980', undefined, undefined, 'Андреевич');
  const aziz = person('Азиз', 'Каримов', 'M', '1990', undefined, undefined, 'Рустамович');
  const kira = person('Кира', 'Новикова', 'F', '1986');
  const marina = person('Марина', 'Демидова', 'F', '1987');
  const pavel = person('Павел', 'Лебедев', 'M', '1986');

  // Дети
  const artem = person('Артём', 'Демидов', 'M', '2012', undefined, undefined, 'Алексеевич');
  const sofia = person('София', 'Демидова', 'F', '2015', undefined, undefined, 'Алексеевна');
  const dasha = person('Дарья', 'Лебедева', 'F', '2014', undefined, undefined, 'Павловна');

  // Связи
  kids(couple(petr, anna, 'married', '1922'), petr, [ivan]);
  kids(couple(grigory, maria, 'widowed'), grigory, [elena]);
  kids(couple(fedor, zoya), fedor, [timur]);
  kids(couple(nikolay, olga0), nikolay, [nina]);

  kids(couple(ivan, valentina, 'divorced', '1947'), ivan, [viktor]);
  kids(couple(ivan, elena, 'married', '1950'), ivan, [sergey, tatyana]);
  kids(couple(timur, nina, 'married', '1955'), timur, [gulnara, rustam]);

  kids(couple(sergey, gulnara, 'married', '1983'), sergey, [alexey, olga, irina]);
  kids(tree.families[Object.keys(tree.families).at(-1)!]!.id, sergey, [maxim], 'adopted');
  kids(couple(tatyana, andrey), tatyana, [dmitry]);
  kids(couple(rustam, lola), rustam, [aziz]);

  couple(alexey, kira, 'divorced', '2007');
  kids(couple(alexey, marina, 'married', '2011'), alexey, [artem, sofia]);
  kids(couple(olga, pavel, 'married', '2012'), olga, [dasha]);

  return { ...tree, rootPersonId: alexey };
}

/**
 * Большое выдуманное древо для проверки скорости: от одной пары,
 * у каждого `childrenPer` детей и супруг. generations=7, childrenPer=3 → ≈6500 человек.
 */
export function createBigTree(generations: number, childrenPer: number): TreeData {
  // Собираем объекты напрямую: через ops каждое добавление копирует всё древо — слишком долго
  const tree = createTree('Big');
  const people: TreeData['people'] = {};
  const families: TreeData['families'] = {};
  let counter = 0;
  const add = (sex: Sex, year: number): PersonId => {
    const id = `P${++counter}`;
    people[id] = { id, sex, names: { given: `Имя${counter}`, surname: 'Тестов' }, birth: { date: { date: { y: year } } } };
    return id;
  };
  const root = add('M', 1800);
  let level = [root];
  for (let g = 1; g < generations; g++) {
    const next: PersonId[] = [];
    for (const p of level) {
      const spouse = add(people[p]!.sex === 'M' ? 'F' : 'M', 1800 + (g - 1) * 25);
      const fid = `F${counter}`;
      const children = Array.from({ length: childrenPer }, (_, i) => add(i % 2 ? 'F' : 'M', 1800 + g * 25 + i));
      families[fid] = {
        id: fid,
        partners: [p, spouse],
        status: 'married',
        children: children.map((id) => ({ id, relation: 'birth' })),
      };
      next.push(...children);
    }
    level = next;
  }
  return { ...tree, people, families, rootPersonId: root };
}
