import type { BloodSegment, Kinship, Step } from './kinship';
import type { PersonId, Sex, TreeData, UnionStatus } from './types';
import { nameKinshipUz, stepLabelUz } from './kinshipUz';

export { bloodTermUz } from './kinshipUz';

// Названия родства по найденной цепочке (см. kinship.ts) — по-русски и по-английски.
// Термин отвечает на вопрос «кем B приходится A».
//
// Русский:
//   кровные — отец, дедушка, прапрадедушка; дядя, двоюродный дедушка; племянник,
//   внучатый племянник; двоюродный/троюродный… брат; единокровный/единоутробный брат;
//   через брак — муж/жена, тесть/тёща, свёкор/свекровь, зять, невестка, шурин,
//   свояченица, деверь, золовка, свояк, ятровка, сват/сватья, отчим/мачеха,
//   пасынок/падчерица, сводный брат/сестра.
//   Если точного слова нет — описание с родительным падежом: «сын брата жены».
// Английский: father, great-grandmother, first cousin once removed, brother-in-law…
// Узбекский — в kinshipUz.ts (aka/uka, amaki/tog‘a, qaynota, quda…).

export type KinLang = 'ru' | 'en' | 'uz';

export interface KinshipName {
  /** Готовый термин или описание */
  term: string;
  /** true — точное слово, false — составное описание */
  exact: boolean;
}

// ─── Русский ────────────────────────────────────────────────────────────────

const pick = (g: Sex, m: string, f: string, u = `${m}/${f}`) => (g === 'M' ? m : g === 'F' ? f : u);
const pra = (n: number) => 'пра'.repeat(Math.max(0, n));

const COUSIN_STEMS = ['', '', 'двоюродн', 'троюродн', 'четвероюродн', 'пятиюродн', 'шестиюродн', 'семиюродн', 'восьмиюродн', 'девятиюродн', 'десятиюродн'];

/** «двоюродный», «троюродная»… для степени k (1 — пусто) */
function cousinAdj(k: number, g: Sex): string {
  if (k <= 1) return '';
  const stem = COUSIN_STEMS[k] ?? `${k}-юродн`;
  return stem + (g === 'F' ? 'ая' : 'ый');
}

const join = (...words: string[]) => words.filter(Boolean).join(' ');

function ancestorRu(n: number, g: Sex): string {
  if (n === 1) return pick(g, 'отец', 'мать', 'родитель');
  if (n > 7) return `предок в ${n}-м поколении`;
  return pra(n - 2) + pick(g, 'дедушка', 'бабушка', 'дедушка/бабушка');
}

function descendantRu(n: number, g: Sex): string {
  if (n === 1) return pick(g, 'сын', 'дочь', 'ребёнок');
  if (n > 7) return `потомок в ${n}-м поколении`;
  return pra(n - 2) + pick(g, 'внук', 'внучка', 'внук/внучка');
}

/** Кровный термин по числу поколений вверх (a) и вниз (b) */
export function bloodTermRu(a: number, b: number, g: Sex, half = false, halfVia: Sex = 'U'): string {
  if (a === 0 && b === 0) return 'тот же человек';
  if (b === 0) return ancestorRu(a, g);
  if (a === 0) return descendantRu(b, g);
  if (a === b) {
    if (a === 1) {
      const noun = pick(g, 'брат', 'сестра', 'брат/сестра');
      if (!half) return noun;
      // Общий отец — единокровные, общая мать — единоутробные
      const adj = halfVia === 'M' ? 'единокровн' : halfVia === 'F' ? 'единоутробн' : 'неполнородн';
      return join(adj + (g === 'F' ? 'ая' : 'ый'), noun);
    }
    return join(cousinAdj(a, g), pick(g, 'брат', 'сестра', 'брат/сестра'));
  }
  if (a > b) {
    const d = a - b;
    if (d === 1) return join(cousinAdj(b, g), pick(g, 'дядя', 'тётя', 'дядя/тётя'));
    // Брат/сестра деда и дальше: «двоюродный дедушка», «троюродная бабушка»
    return join(cousinAdj(b + 1, g), ancestorRu(d, g));
  }
  const d = b - a;
  if (d === 1) return join(cousinAdj(a, g), pick(g, 'племянник', 'племянница', 'племянник/племянница'));
  // Внук брата: «внучатый племянник», «правнучатая племянница»
  return join(
    cousinAdj(a, g),
    pra(d - 2) + (g === 'F' ? 'внучатая' : 'внучатый'),
    pick(g, 'племянник', 'племянница', 'племянник/племянница'),
  );
}

function spouseRu(status: UnionStatus, g: Sex): string {
  if (status === 'divorced') return pick(g, 'бывший муж', 'бывшая жена', 'бывший супруг');
  if (status === 'partners') return pick(g, 'партнёр', 'партнёрша', 'партнёр');
  return pick(g, 'муж', 'жена', 'супруг');
}

// Родительный падеж — для описаний «сын брата жены»
const NOUN_GEN: Record<string, string> = {
  отец: 'отца',
  мать: 'матери',
  дочь: 'дочери',
  сын: 'сына',
  брат: 'брата',
  муж: 'мужа',
  ребёнок: 'ребёнка',
  родитель: 'родителя',
  партнёр: 'партнёра',
  свёкор: 'свёкра',
  свекровь: 'свекрови',
  тесть: 'тестя',
  зять: 'зятя',
  деверь: 'деверя',
  пасынок: 'пасынка',
  супруг: 'супруга',
  предок: 'предка',
  потомок: 'потомка',
};
const HUSHING = /[гкхжшщч]$/;

function genitiveWord(w: string): string {
  if (w.includes('/')) return w.split('/').map(genitiveWord).join('/');
  const pre = w.match(/^(пра)+/)?.[0] ?? '';
  const base = w.slice(pre.length);
  if (NOUN_GEN[base]) return pre + NOUN_GEN[base];
  if (/(ый|ой)$/.test(base)) return pre + base.slice(0, -2) + 'ого';
  if (/ий$/.test(base)) return pre + base.slice(0, -2) + 'его';
  if (/ая$/.test(base)) return pre + base.slice(0, -2) + (HUSHING.test(base.slice(0, -2)) ? 'ей' : 'ой');
  if (/а$/.test(base)) return pre + base.slice(0, -1) + (HUSHING.test(base.slice(0, -1)) ? 'и' : 'ы');
  if (/я$/.test(base)) return pre + base.slice(0, -1) + 'и';
  if (/[бвгджзклмнпрстфхцчшщ]$/.test(base)) return pre + base + 'а';
  return w; // числа, «в», «поколении» и т.п.
}

const genitive = (term: string) =>
  term.startsWith('предок в') || term.startsWith('потомок в')
    ? genitiveWord(term.split(' ')[0]!) + term.slice(term.indexOf(' '))
    : term.split(' ').map(genitiveWord).join(' ');

// ─── Английский ─────────────────────────────────────────────────────────────

const pickEn = (g: Sex, m: string, f: string, u: string) => (g === 'M' ? m : g === 'F' ? f : u);
const ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = (n: number) => ORD[n] ?? `${n}th`;
const greats = (n: number) => (n <= 0 ? '' : n <= 3 ? 'great-'.repeat(n) : `${n}× great-`);

export function bloodTermEn(a: number, b: number, g: Sex, half = false): string {
  if (a === 0 && b === 0) return 'the same person';
  if (b === 0) {
    if (a === 1) return pickEn(g, 'father', 'mother', 'parent');
    return greats(a - 2) + pickEn(g, 'grandfather', 'grandmother', 'grandparent');
  }
  if (a === 0) {
    if (b === 1) return pickEn(g, 'son', 'daughter', 'child');
    return greats(b - 2) + pickEn(g, 'grandson', 'granddaughter', 'grandchild');
  }
  if (a === 1 && b === 1) return (half ? 'half-' : '') + pickEn(g, 'brother', 'sister', 'sibling');
  if (b === 1) return greats(a - 2) + pickEn(g, 'uncle', 'aunt', 'uncle/aunt');
  if (a === 1) return greats(b - 2) + pickEn(g, 'nephew', 'niece', 'nephew/niece');
  const degree = Math.min(a, b) - 1;
  const removed = Math.abs(a - b);
  const rem = removed === 0 ? '' : removed === 1 ? ' once removed' : removed === 2 ? ' twice removed' : ` ${removed} times removed`;
  return `${ordinal(degree)} cousin${rem}`;
}

function spouseEn(status: UnionStatus, g: Sex): string {
  const base = pickEn(g, 'husband', 'wife', 'spouse');
  if (status === 'divorced') return `ex-${base}`;
  if (status === 'partners') return 'partner';
  return base;
}

/** Подпись одного шага цепочки: кем следующий человек приходится предыдущему */
export function stepLabel(tree: TreeData, step: Step, lang: KinLang): string {
  const g = tree.people[step.to]?.sex ?? 'U';
  if (lang === 'uz') return stepLabelUz(step.kind, step.status, g);
  if (step.kind === 'spouse') return lang === 'ru' ? spouseRu(step.status ?? 'unknown', g) : spouseEn(step.status ?? 'unknown', g);
  const [a, b] = step.kind === 'up' ? [1, 0] : [0, 1];
  return lang === 'ru' ? bloodTermRu(a, b, g) : bloodTermEn(a, b, g);
}

// ─── Сборка термина по цепочке ──────────────────────────────────────────────

const isSeg = (s: BloodSegment | undefined, up: number, down: number) => !!s && s.up === up && s.down === down;

export function nameKinship(tree: TreeData, k: Kinship, lang: KinLang): KinshipName {
  if (lang === 'uz') return nameKinshipUz(tree, k);
  const sex = (id: PersonId): Sex => tree.people[id]?.sex ?? 'U';
  const segs = k.segments;
  const last = segs[segs.length - 1]!;
  const gB = sex(last.end);
  const blood = (s: BloodSegment) => {
    const g = sex(s.end);
    const halfVia = s.top ? sex(s.top) : 'U';
    return lang === 'ru' ? bloodTermRu(s.up, s.down, g, s.half, halfVia) : bloodTermEn(s.up, s.down, g, s.half);
  };

  // Только кровь
  if (segs.length === 1) {
    const s = segs[0]!;
    let term = blood(s);
    if (s.adopted) {
      const direct = (s.up === 1 && s.down === 0) || (s.up === 0 && s.down === 1);
      if (lang === 'ru') term = direct ? join(gB === 'F' ? 'приёмная' : 'приёмный', term) : `${term} (по усыновлению)`;
      else term = direct ? `${s.up === 1 ? 'adoptive' : 'adopted'} ${term}` : `${term} (by adoption)`;
    }
    return { term, exact: true };
  }

  const exact = lang === 'ru' ? exactAffinityRu(k, sex) : exactAffinityEn(k, sex);
  if (exact) return { term: exact, exact: true };

  // Описание по звеньям: кровные участки и браки
  const links: string[] = [];
  segs.forEach((s, i) => {
    if (s.up || s.down) links.push(blood(s));
    if (i < k.marriages.length) {
      const spouseId = segs[i + 1]!.start;
      links.push(lang === 'ru' ? spouseRu(k.marriages[i]!, sex(spouseId)) : spouseEn(k.marriages[i]!, sex(spouseId)));
    }
  });
  if (lang === 'ru') {
    // «сын брата жены»: последнее звено + остальные в родительном падеже в обратном порядке
    const [lastLink, ...rest] = [...links].reverse();
    return { term: join(lastLink!, ...rest.map(genitive)), exact: false };
  }
  // «wife's brother's son»
  return { term: links.map((l, i) => (i < links.length - 1 ? `${l}'s` : l)).join(' '), exact: false };
}

function exactAffinityRu(k: Kinship, sex: (id: PersonId) => Sex): string | null {
  const [x, y, z] = k.segments;
  const gB = sex(k.segments[k.segments.length - 1]!.end);
  const status = k.marriages[0]!;

  if (k.segments.length === 2) {
    const gY = sex(y!.start); // супруг в цепочке
    if (isSeg(x, 0, 0) && isSeg(y, 0, 0)) return spouseRu(status, gB);
    if (status === 'divorced' || status === 'partners') return null;
    if (isSeg(x, 0, 0) && isSeg(y, 1, 0)) {
      if (gY === 'F') return pick(gB, 'тесть', 'тёща', 'родитель жены');
      if (gY === 'M') return pick(gB, 'свёкор', 'свекровь', 'родитель мужа');
    }
    if (isSeg(x, 0, 0) && isSeg(y, 0, 1)) return pick(gB, 'пасынок', 'падчерица', 'пасынок/падчерица');
    if (isSeg(x, 0, 0) && isSeg(y, 1, 1)) {
      if (gY === 'F') return pick(gB, 'шурин', 'свояченица', 'брат/сестра жены');
      if (gY === 'M') return pick(gB, 'деверь', 'золовка', 'брат/сестра мужа');
    }
    if (isSeg(x, 1, 0) && isSeg(y, 0, 0)) return pick(gB, 'отчим', 'мачеха', 'отчим/мачеха');
    if ((isSeg(x, 0, 1) || isSeg(x, 1, 1)) && isSeg(y, 0, 0)) return pick(gB, 'зять', 'невестка', 'зять/невестка');
    if (isSeg(x, 0, 1) && isSeg(y, 1, 0)) return pick(gB, 'сват', 'сватья', 'сват/сватья');
    if (isSeg(x, 1, 0) && isSeg(y, 0, 1)) return pick(gB, 'сводный брат', 'сводная сестра', 'сводный брат/сестра');
  }

  if (k.segments.length === 3 && k.marriages.every((m) => m !== 'divorced' && m !== 'partners')) {
    // Муж сестры жены — свояк; жена брата мужа — ятровка
    if (isSeg(x, 0, 0) && isSeg(y, 1, 1) && isSeg(z, 0, 0)) {
      const gSpouse = sex(y!.start);
      const gSibling = sex(y!.end);
      if (gSpouse === 'F' && gSibling === 'F' && gB === 'M') return 'свояк';
      if (gSpouse === 'M' && gSibling === 'M' && gB === 'F') return 'ятровка';
    }
  }
  return null;
}

function exactAffinityEn(k: Kinship, sex: (id: PersonId) => Sex): string | null {
  const [x, y, z] = k.segments;
  const gB = sex(k.segments[k.segments.length - 1]!.end);
  const status = k.marriages[0]!;
  if (k.segments.length === 2) {
    if (isSeg(x, 0, 0) && isSeg(y, 0, 0)) return spouseEn(status, gB);
    if (status === 'divorced' || status === 'partners') return null;
    if (isSeg(x, 0, 0) && isSeg(y, 1, 0)) return pickEn(gB, 'father-in-law', 'mother-in-law', 'parent-in-law');
    if (isSeg(x, 0, 0) && isSeg(y, 0, 1)) return pickEn(gB, 'stepson', 'stepdaughter', 'stepchild');
    if ((isSeg(x, 0, 0) && isSeg(y, 1, 1)) || (isSeg(x, 1, 1) && isSeg(y, 0, 0))) {
      return pickEn(gB, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
    }
    if (isSeg(x, 1, 0) && isSeg(y, 0, 0)) return pickEn(gB, 'stepfather', 'stepmother', 'step-parent');
    if (isSeg(x, 0, 1) && isSeg(y, 0, 0)) return pickEn(gB, 'son-in-law', 'daughter-in-law', 'child-in-law');
    if (isSeg(x, 1, 0) && isSeg(y, 0, 1)) return pickEn(gB, 'stepbrother', 'stepsister', 'stepsibling');
  }
  if (k.segments.length === 3 && isSeg(x, 0, 0) && isSeg(y, 1, 1) && isSeg(z, 0, 0) && k.marriages.every((m) => m !== 'divorced' && m !== 'partners')) {
    return pickEn(gB, 'brother-in-law', 'sister-in-law', 'sibling-in-law');
  }
  return null;
}
