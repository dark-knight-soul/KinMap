import type { Sex } from './types';

// Род фамилии: «Иванов → Иванова», «Невский → Невская», «Толстой → Толстая» и обратно.
// Работает для русских и узбекских фамилий на -ов/-ев/-ин (Каримов → Каримова).
// Несклоняемые фамилии (Шевченко, Цой, Грин, Бах) не трогаем.

const RULES: [RegExp, string, string][] = [
  // [мужское окончание, мужская замена, женская замена] — проверяются по порядку
  [/(ск|цк)ий$/i, '$1ий', '$1ая'],
  [/(ов|ев|ёв|ин|ын)$/i, '$1', '$1а'],
  // «-ой» — только у длинных фамилий (Толстой, Трубецкой), иначе испортим «Цой», «Хой»
  [/(?<=^.{3,})ой$/i, 'ой', 'ая'],
];

const FEMALE_RULES: [RegExp, string][] = [
  [/(ск|цк)ая$/i, '$1ий'],
  [/(ов|ев|ёв|ин|ын)а$/i, '$1'],
];

/** Фамилия в нужном роде; если правило не подходит — без изменений */
export function genderSurname(surname: string, sex: Sex): string {
  const s = surname.trim();
  if (!s || sex === 'U') return surname;
  if (sex === 'F') {
    // Уже женская форма — оставляем
    if (FEMALE_RULES.some(([re]) => re.test(s))) return surname;
    for (const [re, , female] of RULES) if (re.test(s)) return s.replace(re, female);
    return surname;
  }
  for (const [re, male] of FEMALE_RULES) if (re.test(s)) return s.replace(re, male);
  return surname;
}
