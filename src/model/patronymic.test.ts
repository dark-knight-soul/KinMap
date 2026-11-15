import { describe, expect, it } from 'vitest';
import { addPerson, createTree } from './ops';
import { genderPatronymic, patronymicFrom, patronymicSuggestions, uzPatronymicFrom } from './patronymic';
import type { TreeData } from './types';

describe('отчество по имени отца', () => {
  it.each([
    ['Иван', 'Иванович', 'Ивановна'],
    ['Сергей', 'Сергеевич', 'Сергеевна'],
    ['Николай', 'Николаевич', 'Николаевна'],
    ['Валерий', 'Валерьевич', 'Валерьевна'],
    ['Игорь', 'Игоревич', 'Игоревна'],
    ['Карим', 'Каримович', 'Каримовна'],
    ['Али', 'Алиевич', 'Алиевна'],
    ['Муса', 'Мусаевич', 'Мусаевна'],
    ['Илья', 'Ильич', 'Ильинична'],
    ['Пётр', 'Петрович', 'Петровна'],
    ['Karim', 'Karimovich', 'Karimovna'],
    ['Ali', 'Aliyevich', 'Aliyevna'],
  ])('%s → %s / %s', (father, m, f) => {
    expect(patronymicFrom(father, 'M')).toBe(m);
    expect(patronymicFrom(father, 'F')).toBe(f);
  });

  it('без имени или пола — пусто', () => {
    expect(patronymicFrom('', 'M')).toBe('');
    expect(patronymicFrom('Иван', 'U')).toBe('');
  });

  it('узбекская форма', () => {
    expect(uzPatronymicFrom('Карим', 'M')).toBe('Карим ўғли');
    expect(uzPatronymicFrom('Karim', 'F')).toBe('Karim qizi');
  });
});

describe('род отчества', () => {
  it('меняет окончание', () => {
    expect(genderPatronymic('Иванович', 'F')).toBe('Ивановна');
    expect(genderPatronymic('Сергеевна', 'M')).toBe('Сергеевич');
    expect(genderPatronymic('Karimovna', 'M')).toBe('Karimovich');
    expect(genderPatronymic('Карим ўғли', 'F')).toBe('Карим қизи');
  });
  it('уже в нужном роде — без изменений', () => {
    expect(genderPatronymic('Иванович', 'M')).toBe('Иванович');
  });
  it('незнакомое окончание — null', () => {
    expect(genderPatronymic('Ильич', 'F')).toBeNull();
  });
});

describe('варианты для списка', () => {
  const tree = (): TreeData => {
    let t = createTree('Тест');
    t = addPerson(t, { sex: 'M', names: { given: 'Рустам', patronymic: 'Каримович' } }).tree;
    t = addPerson(t, { sex: 'F', names: { given: 'Лола' } }).tree;
    return t;
  };

  it('сначала от отца, потом от мужчин древа и записанные отчества', () => {
    const list = patronymicSuggestions(tree(), 'F', { father: 'Иван' });
    expect(list[0]).toBe('Ивановна');
    expect(list).toContain('Рустамовна');
    expect(list).toContain('Каримовна');
    expect(list).not.toContain('Каримович');
  });

  it('пол не указан — обе формы', () => {
    const list = patronymicSuggestions(tree(), 'U', { father: 'Иван' });
    expect(list.slice(0, 2)).toEqual(['Иванович', 'Ивановна']);
  });

  it('без повторов', () => {
    const list = patronymicSuggestions(tree(), 'M', { father: 'Рустам' });
    expect(list.filter((x) => x === 'Рустамович')).toHaveLength(1);
  });
});
