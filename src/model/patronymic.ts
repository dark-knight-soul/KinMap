import type { PersonId, Sex, TreeData } from './types';

// Отчество по имени отца: «Иван → Иванович / Ивановна», «Сергей → Сергеевич»,
// «Карим → Каримович», «Али → Алиевич», латиницей «Karim → Karimovich / Karimovna».
// Для узбекского интерфейса дополнительно предлагаем «Карим ўғли / Карим қизи».

const CYRILLIC = /[а-яёўқғҳ]/i;

// Имена, у которых отчество образуется не по общему правилу: [мужское, женское]
const EXCEPTIONS: Record<string, [string, string]> = {
  лев: ['Львович', 'Львовна'],
  пётр: ['Петрович', 'Петровна'],
  петр: ['Петрович', 'Петровна'],
  павел: ['Павлович', 'Павловна'],
  яков: ['Яковлевич', 'Яковлевна'],
  михаил: ['Михайлович', 'Михайловна'],
  илья: ['Ильич', 'Ильинична'],
  лука: ['Лукич', 'Лукинична'],
  фома: ['Фомич', 'Фоминична'],
  кузьма: ['Кузьмич', 'Кузьминична'],
  никита: ['Никитич', 'Никитична'],
  савва: ['Саввич', 'Саввична'],
  дмитрий: ['Дмитриевич', 'Дмитриевна'],
  георгий: ['Георгиевич', 'Георгиевна'],
};

/** Основа и окончания [мужское, женское] для кириллического имени */
function cyrillicParts(name: string): [string, string, string] {
  const low = name.toLocaleLowerCase();
  // Валерий → Валерьевич
  if (/ий$/.test(low)) return [name.slice(0, -2), 'ьевич', 'ьевна'];
  // Сергей → Сергеевич, Николай → Николаевич
  if (/[аеёиоуыэюя]й$/.test(low)) return [name.slice(0, -1), 'евич', 'евна'];
  // Игорь → Игоревич
  if (/ь$/.test(low)) return [name.slice(0, -1), 'евич', 'евна'];
  // Муса → Мусаевич, Али → Алиевич, Мусо → Мусоевич
  if (/[аеёиоуыэюя]$/.test(low)) return [name, 'евич', 'евна'];
  // После шипящих и «ц» — «-евич»
  if (/[жчшщц]$/.test(low)) return [name, 'евич', 'евна'];
  return [name, 'ович', 'овна'];
}

/** Отчество по имени отца; пустая строка, если имени нет или пол неизвестен */
export function patronymicFrom(fatherGiven: string | undefined, sex: Sex): string {
  // Берём только первое имя: «Абдулла Карим» → «Абдулла»
  const name = (fatherGiven ?? '').trim().split(/\s+/)[0] ?? '';
  if (!name || sex === 'U') return '';
  const i = sex === 'M' ? 0 : 1;
  const exc = EXCEPTIONS[name.toLocaleLowerCase()];
  if (exc) return exc[i];
  if (CYRILLIC.test(name)) {
    const [base, m, f] = cyrillicParts(name);
    return base + (i === 0 ? m : f);
  }
  // Латиница (узбекская и др.): Karim → Karimovich, Ali → Aliyevich
  if (/[aeiouy]$/i.test(name)) return name + (i === 0 ? 'yevich' : 'yevna');
  return name + (i === 0 ? 'ovich' : 'ovna');
}

/** Узбекская форма: «Карим ўғли / Карим қизи», «Karim o‘g‘li / Karim qizi» */
export function uzPatronymicFrom(fatherGiven: string | undefined, sex: Sex): string {
  const name = (fatherGiven ?? '').trim().split(/\s+/)[0] ?? '';
  if (!name || sex === 'U') return '';
  if (CYRILLIC.test(name)) return `${name} ${sex === 'M' ? 'ўғли' : 'қизи'}`;
  return `${name} ${sex === 'M' ? 'o‘g‘li' : 'qizi'}`;
}

// Перевод готового отчества в другой род: Иванович ↔ Ивановна, Karimovich ↔ Karimovna
const TO_FEMALE: [RegExp, string][] = [
  [/(ов|ев)ич$/i, '$1на'],
  [/(ov|ev)ich$/i, '$1na'],
  [/ ўғли$/i, ' қизи'],
  [/ o['‘’`]g['‘’`]li$/i, ' qizi'],
];
const TO_MALE: [RegExp, string][] = [
  [/(ов|ев)на$/i, '$1ич'],
  [/(ov|ev)na$/i, '$1ich'],
  [/ қизи$/i, ' ўғли'],
  [/ qizi$/i, ' o‘g‘li'],
];

/** Отчество в нужном роде; если правило не подходит — null */
export function genderPatronymic(patronymic: string, sex: Sex): string | null {
  const s = patronymic.trim();
  if (!s) return null;
  if (sex === 'U') return s;
  const [own, other] = sex === 'M' ? [TO_MALE, TO_FEMALE] : [TO_FEMALE, TO_MALE];
  // Уже в нужном роде
  if (other.some(([re]) => re.test(s))) return s;
  for (const [re, to] of own) if (re.test(s)) return s.replace(re, to);
  return null;
}

/**
 * Варианты отчества для выпадающего списка:
 * сначала — от отца (если знаем), потом от имён всех мужчин древа и уже записанные отчества.
 */
export function patronymicSuggestions(
  tree: TreeData,
  sex: Sex,
  opts: { father?: string; uzbek?: boolean; exclude?: PersonId } = {},
): string[] {
  const sexes: Sex[] = sex === 'U' ? ['M', 'F'] : [sex];
  const fromName = (name: string | undefined) =>
    sexes.flatMap((s) => [patronymicFrom(name, s), opts.uzbek ? uzPatronymicFrom(name, s) : '']);

  const first = fromName(opts.father);
  const rest: string[] = [];
  for (const p of Object.values(tree.people)) {
    if (p.id === opts.exclude) continue;
    if (p.sex === 'M') rest.push(...fromName(p.names.given));
    const own = p.names.patronymic?.trim();
    if (own) for (const s of sexes) rest.push(genderPatronymic(own, s) ?? (p.sex === s || p.sex === 'U' ? own : ''));
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string) => {
    const key = v.toLocaleLowerCase();
    if (!v || seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  first.forEach(push);
  rest.sort((a, b) => a.localeCompare(b)).forEach(push);
  return out;
}
