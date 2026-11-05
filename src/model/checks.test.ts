import { describe, expect, it } from 'vitest';
import { computeIssues, dateRange } from './checks';
import { parseFuzzyDate } from './dates';
import { createDemoTree } from './demo';
import { addPerson, createTree, linkChild, linkPartners, updatePerson } from './ops';
import type { Sex, TreeData } from './types';

// Мини-древо: мать, отец, ребёнок с заданными датами
function family(opts: {
  mother?: [string?, string?];
  father?: [string?, string?];
  child?: string;
  child2?: string;
  marriage?: string;
}) {
  let tree = createTree('Т');
  const add = (sex: Sex, given: string, born?: string, died?: string) => {
    const r = addPerson(tree, {
      sex,
      names: { given, surname: 'Т' },
      birth: born ? { date: parseFuzzyDate(born) } : undefined,
      death: died ? { date: parseFuzzyDate(died) } : undefined,
    });
    tree = r.tree;
    return r.id;
  };
  const m = add('F', 'Мать', ...(opts.mother ?? []));
  const f = add('M', 'Отец', ...(opts.father ?? []));
  const c = add('U', 'Ребёнок', opts.child);
  const fam = linkPartners(tree, m, f);
  tree = linkChild(fam.tree, m, c, { familyId: fam.familyId }).tree;
  let c2: string | undefined;
  if (opts.child2) {
    c2 = add('U', 'Второй', opts.child2);
    tree = linkChild(tree, m, c2, { familyId: fam.familyId }).tree;
  }
  if (opts.marriage) {
    const fm = tree.families[fam.familyId]!;
    tree = { ...tree, families: { [fm.id]: { ...fm, marriage: { date: parseFuzzyDate(opts.marriage) } } } };
  }
  return { tree, m, f, c, c2 };
}

const codes = (tree: TreeData) => computeIssues(tree).map((i) => i.code).sort();

describe('диапазоны дат', () => {
  it('год, месяц, «около», «до», «между»', () => {
    const [a, b] = dateRange(parseFuzzyDate('1950'))!;
    expect(b - a).toBeGreaterThan(360);
    const [c, d] = dateRange(parseFuzzyDate('ок. 1950'))!;
    expect(c).toBeLessThan(a);
    expect(d).toBeGreaterThan(b);
    expect(dateRange(parseFuzzyDate('до 1950'))![0]).toBe(-Infinity);
    expect(dateRange(parseFuzzyDate('после 1950'))![1]).toBe(Infinity);
    expect(dateRange({ text: 'зимой' })).toBeNull();
  });
});

describe('проверки', () => {
  it('нормальная семья — без замечаний', () => {
    expect(codes(family({ mother: ['1950'], father: ['1948'], child: '1975', marriage: '1973' }).tree)).toEqual([]);
  });

  it('демо-семья — без замечаний', () => {
    expect(computeIssues(createDemoTree('Д'))).toEqual([]);
  });

  it('мать младше 12 лет при рождении ребёнка', () => {
    expect(codes(family({ mother: ['1965'], child: '1970' }).tree)).toEqual(['parentTooYoung']);
  });

  it('неточные даты не дают ложных тревог', () => {
    // «ок. 1960» может означать 1957 — тогда матери 13 лет, ошибки нет наверняка
    expect(codes(family({ mother: ['ок. 1960'], child: '1970' }).tree)).toEqual([]);
    expect(codes(family({ mother: ['до 1965'], child: '1970' }).tree)).toEqual([]);
  });

  it('мать слишком старая, отец слишком старый', () => {
    expect(codes(family({ mother: ['1900'], child: '1970' }).tree)).toEqual(['motherTooOld']);
    expect(codes(family({ father: ['1870'], child: '1970' }).tree)).toEqual(['fatherTooOld']);
  });

  it('смерть раньше рождения и слишком долгая жизнь', () => {
    expect(codes(family({ mother: ['1950', '1940'] }).tree)).toEqual(['deathBeforeBirth']);
    expect(codes(family({ mother: ['1800', '1950'] }).tree)).toEqual(['tooOld']);
  });

  it('родился после смерти матери; после смерти отца — допустимо до ~10 месяцев', () => {
    expect(codes(family({ mother: ['1950', '1979'], child: '1980' }).tree)).toEqual(['bornAfterMotherDeath']);
    expect(codes(family({ father: ['1950', '01.03.1980'], child: '01.10.1980' }).tree)).toEqual([]);
    expect(codes(family({ father: ['1950', '1978'], child: '1980' }).tree)).toEqual(['bornAfterFatherDeath']);
  });

  it('брак до рождения, слишком рано, после смерти', () => {
    expect(codes(family({ mother: ['1950'], marriage: '1940' }).tree)).toEqual(['marriageBeforeBirth']);
    expect(codes(family({ mother: ['1950'], marriage: '1960' }).tree)).toEqual(['marriedTooYoung']);
    expect(codes(family({ mother: ['1950', '1970'], marriage: '1975' }).tree)).toEqual(['marriageAfterDeath']);
  });

  it('дети одной матери с разницей 5 месяцев — замечание; близнецы — нет', () => {
    expect(codes(family({ mother: ['1950'], child: '01.01.1980', child2: '01.06.1980' }).tree)).toEqual([
      'siblingsTooClose',
    ]);
    expect(codes(family({ mother: ['1950'], child: '01.01.1980', child2: '01.01.1980' }).tree)).toEqual([]);
  });

  it('возможный дубликат; отец и сын-тёзка — не дубликат', () => {
    let tree = createTree('Т');
    for (let i = 0; i < 2; i++) {
      tree = addPerson(tree, { names: { given: 'Иван', surname: 'Петров' }, birth: { date: { date: { y: 1950 } } } }).tree;
    }
    expect(codes(tree)).toEqual(['possibleDuplicate']);
  });

  it('«это не ошибка» скрывает замечание', () => {
    const { tree, m } = family({ mother: ['1965'], child: '1970' });
    const issue = computeIssues(tree)[0]!;
    const fixed = updatePerson(tree, m, (p) => ({ ...p, ignoredChecks: [issue.key] }));
    expect(computeIssues(fixed)).toEqual([]);
  });

  it('зацикленные данные — ошибка «свой же предок»', () => {
    const tree: TreeData = {
      ...createTree('Т'),
      people: { A: { id: 'A', sex: 'M', names: {} }, B: { id: 'B', sex: 'M', names: {} } },
      families: {
        F1: { id: 'F1', partners: ['A'], status: 'unknown', children: [{ id: 'B', relation: 'birth' }] },
        F2: { id: 'F2', partners: ['B'], status: 'unknown', children: [{ id: 'A', relation: 'birth' }] },
      },
    };
    expect(codes(tree)).toEqual(['ownAncestor', 'ownAncestor']);
  });
});
