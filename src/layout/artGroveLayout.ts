import { approxYear } from '../model/dates';
import { countDescendants } from '../model/generations';
import { parentsOf } from '../model/queries';
import type { PersonId, TreeData } from '../model/types';
import { artTreeRoot, type ArtNode, type ArtTreeLayout } from './artTreeLayout';
import type { Bounds } from './types';

// «Весь род» в виде «рощи»: ВСЕ люди файла, каждый ровно один раз.
//
// Поколения — горизонтальные ярусы: старшие внизу (у земли), младшие вверху.
// «Гнездо» — человек и все его супруги в одну строку; каждый человек входит ровно в одно гнездо,
// поэтому повторов и пунктирных ссылок нет. Ветвь идёт от середины пары родителей к ребёнку.
// Брак потомков разных родоначальников — гнездо, в которое приходят две ветви (к каждому партнёру своя).
// Под каждым родоначальником — короткий пенёк. Ветви окрашены по роду (родоначальнику).
//
// Шаги: гнёзда → ярусы (самый длинный путь, родоначальники подтягиваются к детям) →
// «пустышки» на длинных ветвях → порядок в ярусах (барицентры, меньше пересечений) →
// порядок внутри гнезда → x (притяжение к соседям без наложений) → y по ярусу → ветви.

export const GROVE_R = 26;
export const GROVE_FOCUS_R = 32;
/** Между центрами партнёров в гнезде */
const PAIR = 92;
/** Между гнёздами в ярусе */
const GAP = 56;
/** Между ярусами */
export const GROVE_STEP = 180;
/** «Пустышка» на ветви через несколько ярусов */
const DUMMY_W = 24;
const DUMMY_GAP = 16;
/** Между несвязанными группами людей */
const GROUP_GAP = 300;
/** Ярус шире стольких гнёзд — гнёзда чередуются чуть выше/ниже, чтобы подписи не слипались */
const WIDE_TIER = 14;
const STUMP_H = 70;
export const GROVE_HUES = 8;

export interface GroveLink {
  key: string;
  d: string;
  width: number;
  /** Номер цвета рода (0…GROVE_HUES-1) */
  hue: number;
  kind: 'child' | 'couple';
  dashed?: boolean;
  /** Линия от человека в центре к его предкам — рисуется поверх и толще */
  onPath?: boolean;
}

export interface GroveStump {
  key: string;
  x: number;
  /** Верх пенька (низ кружков родоначальника) */
  y: number;
  hue: number;
}

export interface GroveBlob {
  key: string;
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface GroveData {
  links: GroveLink[];
  stumps: GroveStump[];
  blobs: GroveBlob[];
  /** Родоначальники — им подпись показываем даже при мелком масштабе */
  founders: PersonId[];
}

interface Unit {
  id: number;
  members: PersonId[];
  group: number;
  rank: number;
  hue: number;
  /** Порядок обхода — начальный порядок в ярусе */
  seq: number;
}

interface Edge {
  from: number;
  to: number;
  child: PersonId;
  parents: PersonId[];
  dashed: boolean;
  removed?: boolean;
  /** Цепочка узлов яруса: [гнездо родителей, пустышки…, гнездо ребёнка] */
  chain: LNode[];
}

/** Узел яруса: гнездо или пустышка */
interface LNode {
  unit?: Unit;
  edge?: Edge;
  rank: number;
  width: number;
  x: number;
  order: number;
  /** Соседи в ярусе ниже и выше (для порядка и притяжения) */
  down: LNode[];
  up: LNode[];
}

export function layoutArtGrove(tree: TreeData, focusId: PersonId): ArtTreeLayout {
  const people = Object.keys(tree.people);
  const empty: ArtTreeLayout = {
    mode: 'clan',
    rootId: '',
    nodes: [],
    ghosts: [],
    under: [],
    bounds: { minX: -200, minY: -200, maxX: 200, maxY: 100 },
    crownR: 0,
    grove: { links: [], stumps: [], blobs: [], founders: [] },
  };
  if (!people.length) return empty;
  const birth = (id: PersonId) => approxYear(tree.people[id]?.birth?.date) ?? 99999;

  // ── 1. Гнёзда: партнёры каждой семьи — вместе (система непересекающихся множеств) ──
  const parent = new Map<PersonId, PersonId>(people.map((p) => [p, p]));
  const find = (p: PersonId): PersonId => {
    let r = p;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = p;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const families = Object.values(tree.families);
  for (const f of families) {
    const ps = f.partners.filter((p) => tree.people[p]);
    for (let i = 1; i < ps.length; i++) parent.set(find(ps[i]!), find(ps[0]!));
  }
  const unitByRoot = new Map<PersonId, Unit>();
  const units: Unit[] = [];
  const unitOf = new Map<PersonId, Unit>();
  for (const p of [...people].sort((a, b) => birth(a) - birth(b))) {
    const r = find(p);
    let u = unitByRoot.get(r);
    if (!u) {
      u = { id: units.length, members: [], group: -1, rank: 0, hue: 0, seq: 0 };
      units.push(u);
      unitByRoot.set(r, u);
    }
    u.members.push(p);
    unitOf.set(p, u);
  }

  // ── 2. Рёбра «семья родителей → ребёнок» ──
  const edges: Edge[] = [];
  for (const f of families) {
    const ps = f.partners.filter((p) => tree.people[p]);
    if (!ps.length) continue;
    const from = unitOf.get(ps[0]!)!;
    for (const c of f.children) {
      if (!tree.people[c.id]) continue;
      const to = unitOf.get(c.id)!;
      if (to === from) continue; // ошибка в данных: ребёнок — супруг своего родителя
      edges.push({ from: from.id, to: to.id, child: c.id, parents: ps, dashed: c.relation !== 'birth', chain: [] });
    }
  }
  const outE = units.map(() => [] as Edge[]);
  const inE = units.map(() => [] as Edge[]);
  for (const e of edges) {
    outE[e.from]!.push(e);
    inE[e.to]!.push(e);
  }

  // ── 3. Группы связанных людей ──
  let groups = 0;
  for (const u of units) {
    if (u.group >= 0) continue;
    const stack = [u];
    u.group = groups;
    while (stack.length) {
      const x = stack.pop()!;
      for (const e of [...outE[x.id]!, ...inE[x.id]!]) {
        const y = units[e.from === x.id ? e.to : e.from]!;
        if (y.group < 0) {
          y.group = groups;
          stack.push(y);
        }
      }
    }
    groups++;
  }

  // ── 4. Разрыв циклов (человек записан своим же предком) ──
  const state = new Uint8Array(units.length); // 0 — не был, 1 — в обходе, 2 — готов
  const dfs = (start: Unit) => {
    const stack: [Unit, number][] = [[start, 0]];
    state[start.id] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [u, i] = top;
      const out = outE[u.id]!;
      if (i >= out.length) {
        state[u.id] = 2;
        stack.pop();
        continue;
      }
      top[1]++;
      const e = out[i]!;
      if (e.removed) continue;
      if (state[e.to] === 1) e.removed = true;
      else if (state[e.to] === 0) {
        state[e.to] = 1;
        stack.push([units[e.to]!, 0]);
      }
    }
  };
  for (const u of units) if (!state[u.id]) dfs(u);
  const live = (list: Edge[]) => list.filter((e) => !e.removed);

  // ── 5. Ярусы: самый длинный путь от родоначальников ──
  const indeg = units.map((u) => live(inE[u.id]!).length);
  const topo: Unit[] = units.filter((u) => indeg[u.id] === 0);
  for (let i = 0; i < topo.length; i++) {
    const u = topo[i]!;
    for (const e of live(outE[u.id]!)) {
      const v = units[e.to]!;
      v.rank = Math.max(v.rank, u.rank + 1);
      if (--indeg[v.id]! === 0) topo.push(v);
    }
  }
  // Родоначальников подтягиваем к детям: Исроил — сразу под Джамолом, а не на уровне древних предков
  for (const u of [...topo].reverse()) {
    if (live(inE[u.id]!).length) continue;
    const kids = live(outE[u.id]!).map((e) => units[e.to]!.rank);
    if (kids.length) u.rank = Math.min(...kids) - 1;
  }
  const founders = units.filter((u) => !live(inE[u.id]!).length && live(outE[u.id]!).length);

  // ── 6. Начальный порядок: обход от старшего предка человека в центре по отцу ──
  const trunk = tree.people[focusId] ? unitOf.get(artTreeRoot(tree, focusId, true).root)! : units[0]!;
  let seq = 0;
  const seen = new Set<number>();
  const order = (start: Unit) => {
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      u.seq = seq++;
      // Соседи: сначала дети (по году рождения), потом родители супругов (род отца раньше)
      const kids = live(outE[u.id]!)
        .sort((a, b) => birth(a.child) - birth(b.child))
        .map((e) => units[e.to]!);
      const parents = live(inE[u.id]!)
        .sort((a, b) => sexRank(tree, a.child) - sexRank(tree, b.child))
        .map((e) => units[e.from]!);
      // Стек — последний пришедший обходится первым, поэтому кладём в обратном порядке
      for (const n of [...kids, ...parents].reverse()) if (!seen.has(n.id)) stack.push(n);
    }
  };
  order(trunk);
  for (const u of units) if (!seen.has(u.id)) order(u);

  // Цвет рода: у родоначальника свой, у остальных — от первой входящей ветви (в порядке обхода)
  founders.sort((a, b) => a.seq - b.seq).forEach((u, i) => (u.hue = i % GROVE_HUES));
  for (const u of [...units].sort((a, b) => a.rank - b.rank || a.seq - b.seq)) {
    const inc = live(inE[u.id]!).sort((a, b) => units[a.from]!.seq - units[b.from]!.seq);
    if (inc.length) u.hue = units[inc[0]!.from]!.hue;
  }

  // ── Раскладка по группам: каждая группа — своя «рощица» ──
  const groupOrder = [...Array(groups).keys()].sort((a, b) => {
    if (a === trunk.group) return -1;
    if (b === trunk.group) return 1;
    return units.filter((u) => u.group === b).length - units.filter((u) => u.group === a).length;
  });
  const placed = new Map<PersonId, { x: number; y: number; unit: Unit }>();
  const links: GroveLink[] = [];
  const stumps: GroveStump[] = [];
  const blobs: GroveBlob[] = [];
  const memberX = new Map<PersonId, number>();
  let offset = 0;

  for (const g of groupOrder) {
    const gu = units.filter((u) => u.group === g);
    const minRank = Math.min(...gu.map((u) => u.rank));
    for (const u of gu) u.rank -= minRank;
    const tiers: LNode[][] = [];
    const nodeOf = new Map<number, LNode>();
    for (const u of gu) {
      const n: LNode = { unit: u, rank: u.rank, width: (u.members.length - 1) * PAIR + 2 * GROVE_R, x: 0, order: u.seq, down: [], up: [] };
      nodeOf.set(u.id, n);
      (tiers[u.rank] ??= []).push(n);
    }
    // ── 7. Пустышки на ветвях через несколько ярусов ──
    const gEdges = edges.filter((e) => !e.removed && units[e.from]!.group === g);
    for (const e of gEdges) {
      const a = nodeOf.get(e.from)!;
      const b = nodeOf.get(e.to)!;
      e.chain = [a];
      let prev = a;
      for (let r = a.rank + 1; r < b.rank; r++) {
        const d: LNode = { edge: e, rank: r, width: DUMMY_W, x: 0, order: a.order + 0.5, down: [prev], up: [] };
        prev.up.push(d);
        (tiers[r] ??= []).push(d);
        e.chain.push(d);
        prev = d;
      }
      prev.up.push(b);
      b.down.push(prev);
      e.chain.push(b);
    }
    for (const tier of tiers) tier?.sort((p, q) => p.order - q.order);

    // ── 8. Порядок в ярусах: барицентры соседей, оставляем вариант с меньшим числом пересечений ──
    const renumber = () => tiers.forEach((t) => t?.forEach((n, i) => (n.order = i)));
    renumber();
    const crossings = () => {
      let c = 0;
      for (let r = 0; r + 1 < tiers.length; r++) {
        const segs: [number, number][] = [];
        for (const n of tiers[r] ?? []) for (const up of n.up) segs.push([n.order, up.order]);
        if (segs.length > 1500) return Infinity; // слишком большое древо — не считаем
        for (let i = 0; i < segs.length; i++)
          for (let j = i + 1; j < segs.length; j++) {
            const [a1, b1] = segs[i]!;
            const [a2, b2] = segs[j]!;
            if ((a1 - a2) * (b1 - b2) < 0) c++;
          }
      }
      return c;
    };
    const snapshot = () => tiers.map((t) => (t ? [...t] : t));
    let best = snapshot();
    let bestC = crossings();
    const bary = (list: LNode[], fallback: number) => (list.length ? list.reduce((s, n) => s + n.order, 0) / list.length : fallback);
    for (let it = 0; it < 6 && bestC > 0; it++) {
      for (let r = 1; r < tiers.length; r++) {
        tiers[r]?.sort((p, q) => bary(p.down, p.order) - bary(q.down, q.order));
        tiers[r]?.forEach((n, i) => (n.order = i));
      }
      for (let r = tiers.length - 2; r >= 0; r--) {
        tiers[r]?.sort((p, q) => bary(p.up, p.order) - bary(q.up, q.order));
        tiers[r]?.forEach((n, i) => (n.order = i));
      }
      const c = crossings();
      if (c < bestC) {
        bestC = c;
        best = snapshot();
      }
    }
    best.forEach((t, r) => (tiers[r] = t!));
    renumber();
    // Братья и сёстры — рядом: узлы с одной и той же семьёй родителей собираем вместе
    // (на место среднего из их позиций), чтобы дети одной пары не разбегались по ярусу
    for (const tier of tiers) {
      if (!tier) continue;
      const parentOf = (n: LNode) => n.down[0] ?? n;
      const pos = new Map<LNode, number[]>();
      for (const n of tier) {
        const list = pos.get(parentOf(n)) ?? [];
        list.push(n.order);
        pos.set(parentOf(n), list);
      }
      const mean = (n: LNode) => {
        const list = pos.get(parentOf(n))!;
        return list.reduce((sum, x) => sum + x, 0) / list.length;
      };
      tier.sort((p, q) => mean(p) - mean(q) || p.order - q.order);
      tier.forEach((n, i) => (n.order = i));
    }

    // ── 9. Порядок внутри гнезда: партнёр, чьи родители левее, — слева; у дважды женатого — в середине ──
    for (const u of gu) {
      if (u.members.length < 2) continue;
      const key = (p: PersonId) => {
        const e = live(inE[u.id]!).find((x) => x.child === p);
        return e ? nodeOf.get(e.from)!.order : Infinity;
      };
      const famCount = (p: PersonId) => families.filter((f) => f.partners.includes(p)).length;
      const sorted = [...u.members].sort((a, b) => key(a) - key(b) || sexRank(tree, a) - sexRank(tree, b));
      if (u.members.length >= 3) {
        const hub = [...u.members].sort((a, b) => famCount(b) - famCount(a))[0]!;
        const rest = sorted.filter((p) => p !== hub);
        const mid = Math.ceil(rest.length / 2);
        u.members = [...rest.slice(0, mid), hub, ...rest.slice(mid)];
      } else u.members = sorted;
    }

    // ── 10. X: притяжение к соседям, без наложений ──
    const offsetIn = (u: Unit, p: PersonId) => -((u.members.length - 1) * PAIR) / 2 + u.members.indexOf(p) * PAIR;
    const knotOffset = (e: Edge) => {
      const u = units[e.from]!;
      const xs = e.parents.filter((p) => unitOf.get(p) === u).map((p) => offsetIn(u, p));
      return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
    };
    // Начальная упаковка
    for (const tier of tiers) {
      let x = 0;
      for (const n of tier ?? []) {
        n.x = x + n.width / 2;
        x += n.width + (n.unit ? GAP : DUMMY_GAP);
      }
    }
    const gapOf = (a: LNode, b: LNode) => (a.unit && b.unit ? GAP : DUMMY_GAP);
    const desired = (n: LNode): number => {
      const xs: number[] = [];
      if (n.unit) {
        const u = n.unit;
        for (const e of live(inE[u.id]!)) {
          const prev = e.chain[e.chain.length - 2]!;
          const px = prev.unit ? prev.x + knotOffset(e) : prev.x;
          xs.push(px - offsetIn(u, e.child));
        }
        for (const e of live(outE[u.id]!)) {
          const next = e.chain[1]!;
          const cx = next.unit ? next.x + offsetIn(next.unit, e.child) : next.x;
          xs.push(cx - knotOffset(e));
        }
      } else {
        for (const m of [...n.down, ...n.up]) xs.push(m.unit ? m.x + (n.edge ? (m === n.edge.chain[0] ? knotOffset(n.edge) : offsetIn(m.unit, n.edge.child)) : 0) : m.x);
      }
      return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : n.x;
    };
    const settle = (tier: LNode[]) => {
      const want = tier.map(desired);
      const a = want.map((w) => w);
      for (let i = 1; i < tier.length; i++) a[i] = Math.max(a[i]!, a[i - 1]! + (tier[i - 1]!.width + tier[i]!.width) / 2 + gapOf(tier[i - 1]!, tier[i]!));
      const b = want.map((w) => w);
      for (let i = tier.length - 2; i >= 0; i--) b[i] = Math.min(b[i]!, b[i + 1]! - (tier[i]!.width + tier[i + 1]!.width) / 2 - gapOf(tier[i]!, tier[i + 1]!));
      tier.forEach((n, i) => (n.x = (a[i]! + b[i]!) / 2));
      // Последний жёсткий проход: наложений быть не может
      for (let i = 1; i < tier.length; i++) {
        const min = tier[i - 1]!.x + (tier[i - 1]!.width + tier[i]!.width) / 2 + gapOf(tier[i - 1]!, tier[i]!);
        if (tier[i]!.x < min) tier[i]!.x = min;
      }
    };
    for (let it = 0; it < 4; it++) {
      for (let r = 0; r < tiers.length; r++) if (tiers[r]?.length) settle(tiers[r]!);
      for (let r = tiers.length - 1; r >= 0; r--) if (tiers[r]?.length) settle(tiers[r]!);
    }

    // Сдвиг группы: вплотную справа от предыдущей
    const left = Math.min(...tiers.flatMap((t) => (t ?? []).map((n) => n.x - n.width / 2)));
    const right = Math.max(...tiers.flatMap((t) => (t ?? []).map((n) => n.x + n.width / 2)));
    const shift = offset - left;
    offset += right - left + GROUP_GAP;

    // ── 11. Координаты людей ──
    for (const tier of tiers) {
      (tier ?? []).forEach((n, i) => {
        n.x += shift;
        if (!n.unit) return;
        const wobble = tier!.filter((m) => m.unit).length > WIDE_TIER ? (i % 2 ? -24 : 24) : 0;
        const y = -n.rank * GROVE_STEP + wobble;
        for (const p of n.unit.members) {
          const x = n.x + offsetIn(n.unit, p);
          placed.set(p, { x, y, unit: n.unit });
          memberX.set(p, x);
        }
        blobs.push({ key: `blob-${n.unit.id}`, x: n.x, y: y - 8, rx: n.width / 2 + 25, ry: 55 });
      });
    }
    for (const u of founders.filter((f) => f.group === g)) {
      const n = nodeOf.get(u.id)!;
      stumps.push({ key: `stump-${u.id}`, x: n.x, y: placed.get(u.members[0]!)!.y + GROVE_R, hue: u.hue });
    }
    // Пары: короткая перемычка между партнёрами (пунктир — развод)
    for (const f of families) {
      const ps = f.partners.filter((p) => placed.has(p) && unitOf.get(p)!.group === g);
      if (ps.length !== 2) continue;
      const [a, b] = ps.map((p) => placed.get(p)!).sort((p, q) => p.x - q.x);
      if (!a || !b || Math.abs(a.x - b.x) > PAIR + 1) continue;
      links.push({
        key: `couple-${f.id}`,
        d: `M ${f1(a.x + GROVE_R)} ${f1(a.y)} L ${f1(b.x - GROVE_R)} ${f1(b.y)}`,
        width: 3,
        hue: a.unit.hue,
        kind: 'couple',
        dashed: f.status === 'divorced' || undefined,
      });
    }
  }

  // ── 12. Ветви: кривая от середины пары родителей вверх к ребёнку (через пустышки) ──
  const ancestors = ancestorSet(tree, focusId);
  const descCount = countDescendants(tree);
  for (const e of edges) {
    if (e.removed || !e.chain.length) continue;
    const child = placed.get(e.child);
    const parentsPlaced = e.parents.map((p) => placed.get(p)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!child || !parentsPlaced.length) continue;
    const kx = parentsPlaced.reduce((s, p) => s + p.x, 0) / parentsPlaced.length;
    const ky = parentsPlaced[0]!.y - (parentsPlaced.length === 2 ? 0 : GROVE_R);
    const pts: [number, number][] = [[kx, ky]];
    for (const d of e.chain.slice(1, -1)) pts.push([d.x, -d.rank * GROVE_STEP]);
    pts.push([child.x, child.y + GROVE_R]);
    let d = `M ${f1(pts[0]![0])} ${f1(pts[0]![1])}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const h = (y0 - y1) / 2;
      d += ` C ${f1(x0)} ${f1(y0 - h)}, ${f1(x1)} ${f1(y1 + h)}, ${f1(x1)} ${f1(y1)}`;
    }
    links.push({
      key: `edge-${e.from}-${e.child}`,
      d,
      width: Math.min(14, 3 + 2 * Math.sqrt(descCount.get(e.child) ?? 0)),
      hue: units[e.from]!.hue,
      kind: 'child',
      dashed: e.dashed || undefined,
      onPath: (ancestors.has(e.child) && e.parents.some((p) => ancestors.has(p))) || undefined,
    });
  }

  // ── Узлы для общей отрисовки ──
  const nodes: ArtNode[] = [];
  for (const [p, pos] of placed) {
    nodes.push({
      key: p,
      personId: p,
      gen: pos.unit.rank,
      x: pos.x,
      y: pos.y,
      r: p === focusId ? GROVE_FOCUS_R : GROVE_R,
      angle: -Math.PI / 2,
      spouses: [],
      hasChildren: !!live(outE[pos.unit.id]!).length,
      weight: 1 + (descCount.get(p) ?? 0),
    });
  }
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const n of nodes) {
    b.minX = Math.min(b.minX, n.x - n.r - 70);
    b.maxX = Math.max(b.maxX, n.x + n.r + 70);
    b.minY = Math.min(b.minY, n.y - n.r - 60);
    b.maxY = Math.max(b.maxY, n.y + n.r + 60);
  }
  for (const s of stumps) b.maxY = Math.max(b.maxY, s.y + STUMP_H + 30);
  return {
    ...empty,
    nodes,
    bounds: b,
    grove: { links, stumps, blobs, founders: founders.flatMap((u) => u.members) },
  };
}

export const GROVE_STUMP_H = STUMP_H;

const f1 = (n: number) => n.toFixed(1);
const sexRank = (tree: TreeData, id: PersonId) => ({ M: 0, U: 1, F: 2 })[tree.people[id]?.sex ?? 'U'];

/** Сам человек и все его предки */
function ancestorSet(tree: TreeData, id: PersonId): Set<PersonId> {
  const out = new Set<PersonId>();
  if (!tree.people[id]) return out;
  const stack = [id];
  out.add(id);
  while (stack.length) {
    for (const p of parentsOf(tree, stack.pop()!)) {
      if (out.has(p.person.id)) continue;
      out.add(p.person.id);
      stack.push(p.person.id);
    }
  }
  return out;
}
