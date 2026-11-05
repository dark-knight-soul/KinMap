import type { GedNode } from '../model/types';

// Чтение и запись строк GEDCOM.
// Строка: «уровень [@ссылка@] ТЕГ [значение]», например «1 BIRT», «2 DATE 12 MAR 1950».
// Длинный текст продолжается строками CONT (с новой строки) и CONC (слитно, только 5.5.1).

const LINE = /^\s*(\d{1,2})\s+(?:@([^@]+)@\s+)?([A-Za-z0-9_]+)(?: (.*))?$/;

export interface ParseResult {
  records: GedNode[];
  /** Номера строк, которые не удалось разобрать */
  badLines: number[];
}

export function parseLines(text: string): ParseResult {
  const records: GedNode[] = [];
  const badLines: number[] = [];
  const stack: { level: number; node: GedNode }[] = [];

  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const m = raw.match(LINE);
    if (!m) {
      badLines.push(i + 1);
      return;
    }
    const level = Number(m[1]);
    const tag = m[3]!.toUpperCase();
    const value = m[4];

    // Продолжение значения предыдущего узла
    if ((tag === 'CONT' || tag === 'CONC') && stack.length) {
      const parent = stack[stack.length - 1]!;
      if (level === parent.level + 1) {
        parent.node.value = (parent.node.value ?? '') + (tag === 'CONT' ? '\n' : '') + (value ?? '');
        return;
      }
    }

    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const node: GedNode = { tag };
    if (m[2]) node.xref = m[2];
    if (value !== undefined && value !== '') node.value = value;

    if (level === 0 || !stack.length) {
      records.push(node);
      stack.length = 0;
    } else {
      const parent = stack[stack.length - 1]!.node;
      (parent.children ??= []).push(node);
    }
    stack.push({ level, node });
  });

  return { records, badLines };
}

/** Ссылка в значении «@I12@» → «I12» */
export const pointer = (value: string | undefined) => value?.match(/^@([^@]+)@$/)?.[1];

/** Первый дочерний узел с тегом */
export const child = (n: GedNode | undefined, tag: string) => n?.children?.find((c) => c.tag === tag);
export const children = (n: GedNode | undefined, tag: string) => n?.children?.filter((c) => c.tag === tag) ?? [];

// ─── Запись ─────────────────────────────────────────────────────────────────

export interface WriteOptions {
  /** 5.5.1: строки не длиннее 255 символов, длинное — через CONC */
  maxLine?: number;
  /** 7.0 запрещает CONC */
  allowConc: boolean;
}

export function writeNodes(nodes: GedNode[], opts: WriteOptions, level = 0, out: string[] = []): string[] {
  for (const n of nodes) {
    const head = `${level}${n.xref ? ` @${n.xref}@` : ''} ${n.tag}`;
    const [first = '', ...rest] = (n.value ?? '').split(/\r\n|\r|\n/);
    pushValue(out, head, first, level + 1, opts);
    for (const line of rest) pushValue(out, `${level + 1} CONT`, line, level + 1, opts);
    if (n.children) writeNodes(n.children, opts, level + 1, out);
  }
  return out;
}

function pushValue(out: string[], head: string, value: string, contLevel: number, opts: WriteOptions): void {
  const max = opts.maxLine;
  if (!max || !opts.allowConc || head.length + 1 + value.length <= max) {
    out.push(value ? `${head} ${value}` : head);
    return;
  }
  // Режем так, чтобы не оставлять пробел на краю куска (некоторые программы его теряют)
  let rest = value;
  let prefix = head;
  while (rest.length) {
    const room = max - prefix.length - 1;
    let cut = Math.min(room, rest.length);
    if (cut < rest.length) {
      while (cut > 1 && (rest[cut - 1] === ' ' || rest[cut] === ' ')) cut--;
    }
    out.push(`${prefix} ${rest.slice(0, cut)}`);
    rest = rest.slice(cut);
    prefix = `${contLevel} CONC`;
  }
}
