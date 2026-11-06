import { approxYear } from './dates';
import type { BloodSegment, Kinship } from './kinship';
import type { PersonId, Sex, TreeData, UnionStatus } from './types';

// Узбекские термины родства (латиница). Отвечают на вопрос «кем B приходится A».
//
// В узбекском, в отличие от русского, важно:
//  - старше или младше: aka (старший брат), uka (младший), opa (старшая сестра), singil (младшая);
//  - по отцу или по матери: amaki / amma — брат / сестра отца, tog‘a / xola — брат / сестра матери;
//    двоюродные: amakivachcha, ammavachcha, tog‘avachcha, xolavachcha;
//  - свойство: qaynota / qaynona (родители супруга), qaynag‘a / qaynini (старший / младший брат супруга),
//    qaynopa / qaynsingil (сестры супруга), kuyov / kelin (зять / невестка), quda / qudag‘ay (сват / сватья),
//    boja (мужья сестёр), ovsin (жёны братьев), pochcha (муж старшей сестры), kelinoyi (жена старшего брата).
// Если точного слова нет — описание цепочкой с притяжательными окончаниями:
//   «xotinining ukasining o‘g‘li» (сын младшего брата жены).
//
// ВАЖНО: термины составлены по словарям и требуют проверки носителем языка.

const pick = (g: Sex, m: string, f: string, u: string) => (g === 'M' ? m : g === 'F' ? f : u);

/** Притяжательная форма 3-го лица: ota → otasi, o‘g‘il → o‘g‘li, sherik → sherigi */
export function possessive(word: string): string {
  if (word.includes('/')) return word.split('/').map(possessive).join('/');
  const space = word.lastIndexOf(' ');
  if (space >= 0) return word.slice(0, space + 1) + possessive(word.slice(space + 1));
  if (word.endsWith('o‘rtog‘i')) return word; // «turmush o‘rtog‘i» уже в нужной форме
  if (word.endsWith('o‘g‘il')) return word.slice(0, -'o‘g‘il'.length) + 'o‘g‘li';
  if (word.endsWith('singil')) return word.slice(0, -'singil'.length) + 'singlisi';
  if (/[aeiou]$/.test(word)) return word + 'si';
  if (/k$/.test(word) && word.length > 3) return word.slice(0, -1) + 'gi';
  if (/q$/.test(word) && word.length > 3) return word.slice(0, -1) + 'g‘i';
  return word + 'i';
}

/** Цепочка слов → описание: [xotin, uka, o‘g‘il] → «xotinining ukasining o‘g‘li» */
export function chain(words: string[]): string {
  if (words.length === 1) return words[0]!;
  return words.map((w, i) => (i < words.length - 1 ? `${possessive(w)}ning` : possessive(w))).join(' ');
}

interface Ctx {
  sex: (id: PersonId) => Sex;
  /** -1 — первый старше второго, 1 — младше, 0 — неизвестно */
  age: (a: PersonId, b: PersonId) => number;
}

function ancestor(n: number, g: Sex): string {
  if (n === 1) return pick(g, 'ota', 'ona', 'ota-ona');
  if (n === 2) return pick(g, 'bobo', 'buvi', 'bobo/buvi');
  if (n === 3) return pick(g, 'katta bobo', 'katta buvi', 'katta bobo/buvi');
  return `${n}-avlod ajdodi`;
}

function descendant(n: number, g: Sex): string {
  if (n === 1) return pick(g, 'o‘g‘il', 'qiz', 'farzand');
  if (n === 2) return 'nevara';
  if (n === 3) return 'chevara';
  if (n === 4) return 'evara';
  return `${n}-avlod avlodi`;
}

/** Брат / сестра: старший или младший */
function sibling(g: Sex, older: number): string {
  if (g === 'M') return older < 0 ? 'aka' : older > 0 ? 'uka' : 'aka/uka';
  if (g === 'F') return older < 0 ? 'opa' : older > 0 ? 'singil' : 'opa/singil';
  return 'aka-uka/opa-singil';
}

/** Брат/сестра родителя: по отцу — amaki/amma, по матери — tog‘a/xola */
function parentSibling(viaParent: Sex, g: Sex): string {
  if (viaParent === 'M') return pick(g, 'amaki', 'amma', 'amaki/amma');
  if (viaParent === 'F') return pick(g, 'tog‘a', 'xola', 'tog‘a/xola');
  return pick(g, 'amaki/tog‘a', 'amma/xola', 'amaki/amma/tog‘a/xola');
}

/** Двоюродные: дети amaki → amakivachcha, amma → ammavachcha, tog‘a → tog‘avachcha, xola → xolavachcha */
function cousin(viaParent: Sex, viaSibling: Sex): string {
  const base = parentSibling(viaParent, viaSibling);
  if (base.includes('/')) return base.split('/').map((b) => `${b}vachcha`).join('/');
  return `${base}vachcha`;
}

/**
 * Кровное родство по участку цепочки: ids — люди от A (начало) до B (конец),
 * сначала a шагов вверх, затем b шагов вниз. Возвращает слова цепочки (одно слово — точный термин).
 */
function bloodWords(ids: PersonId[], a: number, b: number, ctx: Ctx, half = false, halfVia: Sex = 'U'): { words: string[]; exact: boolean } {
  const start = ids[0]!;
  const end = ids[ids.length - 1]!;
  const g = ctx.sex(end);
  if (a === 0 && b === 0) return { words: ['o‘zi'], exact: true };
  if (b === 0) return { words: [ancestor(a, g)], exact: a < 4 };
  if (a === 0) return { words: [descendant(b, g)], exact: b < 5 };
  if (a === 1 && b === 1) {
    const term = sibling(g, ctx.age(end, start));
    // Неполнородные: общий отец — «ota bir», общая мать — «ona bir»
    const note = half ? (halfVia === 'M' ? ' (ota bir)' : halfVia === 'F' ? ' (ona bir)' : ' (ota yoki ona bir)') : '';
    return { words: [term + note], exact: true };
  }
  if (a === 2 && b === 1) return { words: [parentSibling(ctx.sex(ids[1]!), g)], exact: true };
  if (a === 1 && b === 2) return { words: ['jiyan'], exact: true };
  if (a === 2 && b === 2) return { words: [cousin(ctx.sex(ids[1]!), ctx.sex(ids[3]!))], exact: true };
  // Остальное — описанием. Если B «ниже» — отщепляем последний шаг вниз: «jiyanining o‘g‘li»
  if (b > a) {
    const inner = bloodWords(ids.slice(0, -1), a, b - 1, ctx);
    return { words: [...inner.words, descendant(1, g)], exact: false };
  }
  // Иначе отщепляем первый шаг вверх: «otasining amakisi»
  const inner = bloodWords(ids.slice(1), a - 1, b, ctx);
  return { words: [ancestor(1, ctx.sex(ids[1]!)), ...inner.words], exact: false };
}

/** Простой термин без цепочки (без сведений о возрасте и линии) — для списка «также» */
export function bloodTermUz(a: number, b: number, g: Sex): string {
  const ids = Array.from({ length: a + b + 1 }, (_, i) => `#${i}`);
  const ctx: Ctx = { sex: (id) => (id === ids[ids.length - 1] ? g : 'U'), age: () => 0 };
  return chain(bloodWords(ids, a, b, ctx).words);
}

export function spouseUz(status: UnionStatus, g: Sex): string {
  if (status === 'divorced') return pick(g, 'sobiq er', 'sobiq xotin', 'sobiq turmush o‘rtog‘i');
  if (status === 'partners') return 'sherik';
  return pick(g, 'er', 'xotin', 'turmush o‘rtog‘i');
}

export function stepLabelUz(kind: 'up' | 'down' | 'spouse', status: UnionStatus | undefined, g: Sex): string {
  if (kind === 'spouse') return spouseUz(status ?? 'unknown', g);
  return kind === 'up' ? ancestor(1, g) : descendant(1, g);
}

const isSeg = (s: BloodSegment | undefined, up: number, down: number) => !!s && s.up === up && s.down === down;

/** Люди каждого кровного участка цепочки (участки разделены шагами «супруг») */
function segmentIds(k: Kinship): PersonId[][] {
  const out: PersonId[][] = [];
  let pos = 0;
  for (const s of k.segments) {
    const len = s.up + s.down;
    out.push(k.path.slice(pos, pos + len + 1));
    pos += len + 1;
  }
  return out;
}

export function nameKinshipUz(tree: TreeData, k: Kinship): { term: string; exact: boolean } {
  const ctx: Ctx = {
    sex: (id) => tree.people[id]?.sex ?? 'U',
    age: (x, y) => {
      const a = approxYear(tree.people[x]?.birth?.date);
      const b = approxYear(tree.people[y]?.birth?.date);
      if (a === undefined || b === undefined || a === b) return 0;
      return a < b ? -1 : 1;
    },
  };
  const segs = k.segments;
  const ids = segmentIds(k);

  if (segs.length === 1) {
    const s = segs[0]!;
    const r = bloodWords(ids[0]!, s.up, s.down, ctx, s.half, s.top ? ctx.sex(s.top) : 'U');
    let term = chain(r.words);
    if (s.adopted) {
      if (s.up === 1 && s.down === 0) term = `asrab olgan ${term}`;
      else if (s.up === 0 && s.down === 1) term = `asrandi ${term}`;
      else term = `${term} (asrab olish orqali)`;
    }
    return { term, exact: r.exact };
  }

  const exact = exactAffinityUz(k, ctx);
  if (exact) return { term: exact, exact: true };

  // Описание цепочкой: кровные участки и браки по порядку от A
  const words: string[] = [];
  segs.forEach((s, i) => {
    if (s.up || s.down) words.push(...bloodWords(ids[i]!, s.up, s.down, ctx, s.half).words);
    if (i < k.marriages.length) words.push(spouseUz(k.marriages[i]!, ctx.sex(segs[i + 1]!.start)));
  });
  return { term: chain(words), exact: false };
}

function exactAffinityUz(k: Kinship, ctx: Ctx): string | null {
  const [x, y, z] = k.segments;
  const B = k.segments[k.segments.length - 1]!.end;
  const A = k.segments[0]!.start;
  const gB = ctx.sex(B);
  const status = k.marriages[0]!;

  if (k.segments.length === 2) {
    if (isSeg(x, 0, 0) && isSeg(y, 0, 0)) return spouseUz(status, gB);
    if (status === 'divorced' || status === 'partners') return null;
    const spouse = y!.start;
    // Родители супруга
    if (isSeg(x, 0, 0) && isSeg(y, 1, 0)) return pick(gB, 'qaynota', 'qaynona', 'qaynota/qaynona');
    // Дети супруга
    if (isSeg(x, 0, 0) && isSeg(y, 0, 1)) return pick(gB, 'o‘gay o‘g‘il', 'o‘gay qiz', 'o‘gay farzand');
    // Братья и сёстры супруга — старше или младше самого супруга
    if (isSeg(x, 0, 0) && isSeg(y, 1, 1)) {
      const older = ctx.age(B, spouse);
      if (gB === 'M') return older < 0 ? 'qaynag‘a' : older > 0 ? 'qaynini' : 'qaynag‘a/qaynini';
      if (gB === 'F') return older < 0 ? 'qaynopa' : older > 0 ? 'qaynsingil' : 'qaynopa/qaynsingil';
      return null;
    }
    // Супруг родителя
    if (isSeg(x, 1, 0) && isSeg(y, 0, 0)) return pick(gB, 'o‘gay ota', 'o‘gay ona', 'o‘gay ota/ona');
    // Супруг ребёнка
    if (isSeg(x, 0, 1) && isSeg(y, 0, 0)) return pick(gB, 'kuyov', 'kelin', 'kuyov/kelin');
    // Супруг брата/сестры: жена старшего брата — kelinoyi, младшего — kelin;
    // муж старшей сестры — pochcha, младшей — kuyov
    if (isSeg(x, 1, 1) && isSeg(y, 0, 0)) {
      const sib = x!.end;
      const older = ctx.age(sib, A);
      if (gB === 'F') return older < 0 ? 'kelinoyi' : older > 0 ? 'kelin' : 'kelinoyi/kelin';
      if (gB === 'M') return older < 0 ? 'pochcha' : older > 0 ? 'kuyov' : 'pochcha/kuyov';
      return null;
    }
    // Родители супруга ребёнка — сваты
    if (isSeg(x, 0, 1) && isSeg(y, 1, 0)) return pick(gB, 'quda', 'qudag‘ay', 'quda/qudag‘ay');
    // Ребёнок супруга родителя — сводные
    if (isSeg(x, 1, 0) && isSeg(y, 0, 1)) return `o‘gay ${sibling(gB, ctx.age(B, A))}`;
  }

  if (k.segments.length === 3 && k.marriages.every((m) => m !== 'divorced' && m !== 'partners')) {
    // Мужья сестёр — boja; жёны братьев — ovsin
    if (isSeg(x, 0, 0) && isSeg(y, 1, 1) && isSeg(z, 0, 0)) {
      const gSpouse = ctx.sex(y!.start);
      const gSibling = ctx.sex(y!.end);
      const gA = ctx.sex(A);
      if (gSpouse === 'F' && gSibling === 'F' && gB === 'M' && gA !== 'F') return 'boja';
      if (gSpouse === 'M' && gSibling === 'M' && gB === 'F' && gA !== 'M') return 'ovsin';
    }
  }
  return null;
}
