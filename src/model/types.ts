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

/** Тип события жизни (рождение и смерть — отдельными полями) */
export type PersonEventType =
  | 'education'
  | 'graduation'
  | 'military'
  | 'work'
  | 'residence'
  | 'award'
  | 'baptism'
  | 'burial'
  | 'emigration'
  | 'immigration'
  | 'retirement'
  | 'other';

/** Событие жизни: учёба, служба, переезд, награда… */
export interface PersonEvent {
  id: string;
  type: PersonEventType;
  date?: FuzzyDate;
  place?: string;
  /** Описание: школа, воинская часть, должность, название награды; у «другого» — что за событие */
  title?: string;
  note?: string;
  /** Незнакомые подполя GEDCOM (источники и т.п.) — возвращаются при экспорте */
  gedcom?: GedNode[];
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
  /** Биография и заметки */
  notes?: string;
  /** Профессия, занятие */
  occupation?: string;
  /** События жизни */
  events?: PersonEvent[];
  /** Фотографии. Первая — главная (на схеме и в списке) */
  photos?: PersonPhoto[];
  /** Замечания проверки, которые человек отметил «это не ошибка» */
  ignoredChecks?: string[];
  /** Данные из GEDCOM, которые KinMap не показывает, но сохраняет и возвращает при экспорте */
  gedcom?: GedcomExtra;
}

/** Узел GEDCOM: тег, значение, ссылка и вложенные узлы */
export interface GedNode {
  tag: string;
  value?: string;
  xref?: string;
  children?: GedNode[];
}

export interface GedcomExtra {
  /** Исходный идентификатор (I12, F3) — чтобы ссылки в сохранённых полях не сломались */
  xref?: string;
  /** Незнакомые поля записи (источники, адреса, свои теги программ…) */
  extra?: GedNode[];
  /** Незнакомые подполя событий: BIRT, DEAT, MARR, DIV → узлы (источники, примечания…) */
  events?: Record<string, GedNode[]>;
}

/** Обрезка для аватара: квадрат в долях от размеров фото */
export interface PhotoCrop {
  /** Левый верхний угол квадрата (доля ширины и высоты) */
  x: number;
  y: number;
  /** Сторона квадрата — доля от меньшей стороны фото */
  size: number;
}

export interface PersonPhoto {
  /** id файла фото в архиве (photos/<id>) */
  id: string;
  mime: string;
  w: number;
  h: number;
  caption?: string;
  date?: FuzzyDate;
  crop?: PhotoCrop;
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
  gedcom?: GedcomExtra;
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
  /** Записи GEDCOM верхнего уровня, которые KinMap не разбирает (источники, хранилища…) */
  gedcomRecords?: GedNode[];
}
