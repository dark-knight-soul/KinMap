// Модель данных KinMap. Устроена близко к GEDCOM, чтобы импорт/экспорт (этап 6)
// не терял информацию:
//  - Person — человек;
//  - Family — союз (пара или один родитель) и дети этого союза.
// Сводные братья/сёстры и отчимы/мачехи отдельно не хранятся — они вычисляются
// из структуры семей (ребёнок одного союза + другой брак его родителя).

export type PersonId = string;
export type FamilyId = string;

/** Пол: M — мужской, F — женский, U — неизвестен */
export type Sex = 'M' | 'F' | 'U';

/** Часть даты: год обязателен, месяц и день — если известны */
export interface DatePart {
  y: number;
  m?: number;
  d?: number;
}

/**
 * Неточная дата, как в генеалогии: «около 1950», «до 1920», «между 1900 и 1905».
 * Если текст не удалось разобрать — он хранится как есть в `text`, чтобы ничего не потерять.
 */
export interface FuzzyDate {
  q?: 'about' | 'before' | 'after' | 'between';
  date?: DatePart;
  /** Вторая граница — только для q = 'between' */
  date2?: DatePart;
  /** Исходный текст, который не удалось разобрать */
  text?: string;
}

/** Событие жизни: дата и место */
export interface LifeEvent {
  date?: FuzzyDate;
  place?: string;
}

export interface PersonNames {
  given?: string;
  patronymic?: string;
  surname?: string;
  /** Фамилия при рождении (девичья) */
  birthSurname?: string;
}

export interface Person {
  id: PersonId;
  sex: Sex;
  names: PersonNames;
  birth?: LifeEvent;
  death?: LifeEvent;
  /**
   * Ручная отметка «жив/умер». undefined — определять автоматически
   * (нужно для скрытия живых при экспорте, этап 6).
   */
  living?: boolean;
  /** Биография и заметки (этап 4) */
  notes?: string;
}

/** Как ребёнок связан с союзом */
export type ChildRelation = 'birth' | 'adopted' | 'foster' | 'unknown';

export interface FamilyChild {
  id: PersonId;
  relation: ChildRelation;
}

/** Статус союза */
export type UnionStatus = 'married' | 'partners' | 'divorced' | 'widowed' | 'unknown';

export interface Family {
  id: FamilyId;
  /** 0–2 партнёра. Один — если второй родитель неизвестен */
  partners: PersonId[];
  status: UnionStatus;
  marriage?: LifeEvent;
  divorce?: LifeEvent;
  children: FamilyChild[];
}

/** Текущая версия формата данных. Повышаем при несовместимых изменениях + пишем миграцию */
export const TREE_FORMAT_VERSION = 1;

export interface TreeData {
  format: 'kinmap';
  version: number;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  people: Record<PersonId, Person>;
  families: Record<FamilyId, Family>;
  /** С кого начинать показ древа */
  rootPersonId?: PersonId;
}
