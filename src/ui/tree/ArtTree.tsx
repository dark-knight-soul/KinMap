import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ART_GHOST_R,
  ROOTS_ANCHOR,
  TRUNK_H,
  branchWidth,
  trunkHalf,
  type ArtGhost,
  type ArtNode,
  type ArtTreeLayout,
} from '../../layout/artTreeLayout';
import { GROVE_HUES, GROVE_STUMP_H, type GroveData } from '../../layout/artGroveLayout';
import type { RelativeKind } from '../useAddRelative';
import type { MediaStore } from '../../file/format';
import { avatarGeometry } from '../../file/images';
import type { Person, TreeData } from '../../model/types';
import { select, setFocus, useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { lifespan, shownNames } from '../format';
import { urlFor } from '../media';
import { contextMenuHandlers } from './cardEvents';
import type { Viewport } from './PanZoom';

// Художественное «Дерево»: ствол, изогнутые ветви, люди — круглые «листья».
// Раскладка — в layout/artTreeLayout.ts, здесь только рисование.

const SPOUSE_R = 22;
/** Радиусы кружков, для которых нужны маски обрезки фото */
const CLIP_RADII = [38, 32, 28, 26, SPOUSE_R];
const NO_MEDIA: MediaStore = {};
/** Больше стольких людей — без декоративных листьев (ради скорости) */
const LEAVES_LIMIT = 1500;
/** Форма листа: от черенка (0,0) вправо */
const LEAF = 'M0 0 C 6 -7, 16 -8, 24 0 C 16 8, 6 7, 0 0 Z';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const initials = (p: Person) => {
  const n = shownNames(p);
  return [n.given, n.surname].map((x) => x?.trim()[0] ?? '').join('').toUpperCase() || '?';
};
const givenSurname = (p: Person) => {
  const n = shownNames(p);
  return [n.given, n.surname].filter(Boolean).join(' ');
};

type Pt = [number, number];

/** Опорные точки изогнутой ветви: выходит по направлению родителя, входит по направлению ребёнка */
function branchPoints(parent: ArtNode, child: ArtNode): [Pt, Pt, Pt, Pt] {
  const d = Math.hypot(child.x - parent.x, child.y - parent.y);
  const c1: Pt = [parent.x + Math.cos(parent.angle) * d * 0.45, parent.y + Math.sin(parent.angle) * d * 0.45];
  const c2: Pt = [child.x - Math.cos(child.angle) * d * 0.35, child.y - Math.sin(child.angle) * d * 0.35];
  return [[parent.x, parent.y], c1, c2, [child.x, child.y]];
}

const f1 = (n: number) => n.toFixed(1);
function branchPath(parent: ArtNode, child: ArtNode): string {
  const [a, b, c, d] = branchPoints(parent, child);
  return `M ${f1(a[0])} ${f1(a[1])} C ${f1(b[0])} ${f1(b[1])}, ${f1(c[0])} ${f1(c[1])}, ${f1(d[0])} ${f1(d[1])}`;
}

/** Точка на ветви (t от 0 до 1) и направление в ней — для листьев вдоль ветвей */
function pointOnBranch(parent: ArtNode, child: ArtNode, t: number): { x: number; y: number; angle: number } {
  const [a, b, c, d] = branchPoints(parent, child);
  const u = 1 - t;
  const at = (i: 0 | 1) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i];
  const dt = (i: 0 | 1) => 3 * u * u * (b[i] - a[i]) + 6 * u * t * (c[i] - b[i]) + 3 * t * t * (d[i] - c[i]);
  return { x: at(0), y: at(1), angle: Math.atan2(dt(1), dt(0)) };
}

/** Ствол с корнями: ширина вверху — по толщине ветвей, книзу расширяется */
function trunkPath(top: number): string {
  const h = TRUNK_H;
  const mid = top * 1.25;
  const base = top * 1.9;
  return [
    `M ${-top} -6`,
    `C ${-top} ${h * 0.35}, ${-mid} ${h * 0.7}, ${-base} ${h - 6}`,
    // Корни слева
    `Q ${-base - 28} ${h + 6} ${-base - 58} ${h + 14}`,
    `Q ${-base - 10} ${h + 10} ${-top * 0.6} ${h + 12}`,
    `L ${top * 0.6} ${h + 12}`,
    // Корни справа
    `Q ${base + 10} ${h + 10} ${base + 58} ${h + 14}`,
    `Q ${base + 28} ${h + 6} ${base} ${h - 6}`,
    `C ${mid} ${h * 0.7}, ${top} ${h * 0.35}, ${top} -6`,
    'Z',
  ].join(' ');
}

export function ArtTreeContent({
  tree,
  layout,
  vp,
  selectedId,
  focusId,
  tints,
  print = false,
  onQuickAdd,
}: {
  tree: TreeData;
  layout: ArtTreeLayout;
  vp: Viewport;
  selectedId?: string;
  /** Человек в центре схемы — если дерево растёт от его предка, он подсвечен */
  focusId?: string;
  /** Пустые места «+ отец / + мать» в родословном дереве */
  onQuickAdd?: (personId: string, kind: RelativeKind) => void;
  tints?: Map<string, string>;
  print?: boolean;
}) {
  const { t } = useTranslation();
  const media = useApp((s) => s.session?.media ?? NO_MEDIA);
  const highlight = useUi((s) => s.highlight);
  const pathIds = useMemo(() => (highlight && !print ? new Set(highlight.ids) : null), [highlight, print]);
  const byKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout]);
  const simple = !print && vp.scale < 0.3;
  const visible = (n: ArtNode, pad = 80) => n.x + pad >= vp.minX && n.x - pad <= vp.maxX && n.y + pad >= vp.minY && n.y - pad <= vp.maxY;
  const nodes = layout.nodes.filter((n) => visible(n));
  const visibleXY = (x: number, y: number, pad = 80) => x + pad >= vp.minX && x - pad <= vp.maxX && y + pad >= vp.minY && y - pad <= vp.maxY;
  const leaves = !simple && layout.nodes.length <= LEAVES_LIMIT;
  const root = layout.nodes[0];
  const trunk = trunkHalf(root?.weight ?? 1);
  // Облака кроны — только у видимых и когда людей не слишком много
  const crown = layout.nodes.length <= LEAVES_LIMIT ? layout.nodes.filter((n) => visible(n, layout.crownR + 40)) : [];
  // Корни (режим «Полный»): узлы под землёй и точка у основания ствола, откуда они растут
  const underByKey = useMemo(() => new Map(layout.under.map((n) => [n.key, n])), [layout]);
  const anchor: ArtNode = { key: ROOTS_ANCHOR, personId: '', gen: 0, x: 0, y: TRUNK_H + 10, r: 0, angle: Math.PI / 2, spouses: [], hasChildren: true, weight: 1 };
  const under = layout.under.filter((n) => visible(n));
  const earth = layout.under.length
    ? (() => {
        const xs = layout.under.map((n) => n.x);
        const left = Math.min(-trunk * 3, ...xs) - 120;
        const right = Math.max(trunk * 3, ...xs) + 120;
        const bottom = Math.max(...layout.under.map((n) => n.y)) + 80;
        return { x: left, w: right - left, h: bottom - TRUNK_H - 8 };
      })()
    : null;
  const labels = useMemo(
    () =>
      placeLabels([...nodes, ...under], vp.scale, print, {
        focusId,
        selectedId,
        founders: layout.grove?.founders,
        chars: layout.grove ? 11 : 16,
      }),
    [nodes, under, vp.scale, print, focusId, selectedId, layout.grove],
  );
  const photoUrl = (p: Person | undefined) => {
    const ph = p?.photos?.[0];
    const bytes = ph ? media[ph.id] : undefined;
    return ph && bytes ? urlFor(bytes, ph.mime) : undefined;
  };

  const person = (n: ArtNode) => {
    const p = tree.people[n.personId];
    if (!p) return null;
    return (
      <ArtPerson
        key={n.key}
        n={n}
        person={p}
        photo={photoUrl(p)}
        tint={tints?.get(p.id)}
        selected={p.id === selectedId}
        focus={!print && p.id === focusId && p.id !== layout.rootId}
        path={pathIds ? (pathIds.has(p.id) ? 'in' : 'out') : undefined}
        label={labels.get(n.key)}
        moreAbove={!n.under && (layout.mode === 'ancestors' || layout.mode === 'full')}
        spouses={simple ? [] : n.spouses.map((id) => ({ person: tree.people[id]!, photo: photoUrl(tree.people[id]) }))}
      />
    );
  };

  if (layout.grove) {
    return (
      <g className="art-tree">
        <ClipDefs />
        <Grove grove={layout.grove} vp={vp} dimmed={!!pathIds} />
        {leaves && (
          <g className="art-leaves" aria-hidden="true">
            {nodes.map((n) => (
              <Leaves key={n.key} n={n} />
            ))}
          </g>
        )}
        {nodes.map(person)}
      </g>
    );
  }

  return (
    <g className="art-tree">
      <defs>
        {CLIP_RADII.map((r) => (
          <clipPath key={r} id={`km-art-${r}`}>
            <circle cx={r} cy={r} r={r} />
          </clipPath>
        ))}
        <radialGradient id="km-art-ground">
          <stop offset="0" className="art-ground-in" />
          <stop offset="1" className="art-ground-out" />
        </radialGradient>
      </defs>
      {/* Крона: мягкие «облака» листвы вокруг людей; прозрачность — у группы целиком,
          поэтому там, где облака перекрываются, цвет не темнеет */}
      {crown.length > 0 && (
        <g aria-hidden="true">
          <g className="art-crown">
            {crown.map((n) => (
              <circle key={n.key} cx={n.x} cy={n.y} r={layout.crownR} />
            ))}
          </g>
        </g>
      )}
      {/* Режим «Полный»: потомки — в корнях, под землёй */}
      {earth && <rect className="art-earth" x={earth.x} y={TRUNK_H + 8} width={earth.w} height={earth.h} rx={48} />}
      <ellipse cx={0} cy={TRUNK_H + 14} rx={Math.max(260, trunk * 14)} ry={34} fill="url(#km-art-ground)" />
      <path className="art-trunk" d={trunkPath(trunk)} />
      {/* Родословное дерево: где чей род */}
      {(layout.mode === 'ancestors' || layout.mode === 'full' || (layout.mode === 'clan' && !layout.rootId)) &&
        !simple &&
        layout.nodes.length > 1 && (
        <g className="art-sides" aria-hidden="true">
          <text x={-trunk * 1.6 - 30} y={TRUNK_H * 0.72} textAnchor="end">
            ← {t('tree.fatherSide')}
          </text>
          <text x={trunk * 1.6 + 30} y={TRUNK_H * 0.72} textAnchor="start">
            {t('tree.motherSide')} →
          </text>
        </g>
      )}
      {/* Ветви: толщина — по числу потомков; рисуем все, чьи концы рядом с экраном */}
      <g className={pathIds ? 'art-branches dimmed' : 'art-branches'}>
        {layout.nodes.map((n) => {
          const parent = n.parentKey ? byKey.get(n.parentKey) : undefined;
          if (!parent || (!visible(n, 400) && !visible(parent, 400))) return null;
          return <path key={n.key} d={branchPath(parent, n)} className="art-branch" strokeWidth={branchWidth(n.weight)} />;
        })}
      </g>
      {layout.under.length > 0 && (
        <g className={pathIds ? 'art-branches dimmed' : 'art-branches'}>
          {layout.under.map((n) => {
            const parent = n.parentKey === ROOTS_ANCHOR ? anchor : n.parentKey ? underByKey.get(n.parentKey) : undefined;
            if (!parent || (!visible(n, 400) && !visible(parent, 400))) return null;
            return <path key={n.key} d={branchPath(parent, n)} className="art-root-branch" strokeWidth={branchWidth(n.weight) * 0.8} />;
          })}
        </g>
      )}
      {/* Пустые места для неизвестных родителей: по клику — добавить */}
      {!print && onQuickAdd && !simple && layout.ghosts.length > 0 && (
        <g className="art-ghosts">
          {layout.ghosts.map((g) => {
            const parent = byKey.get(g.parentKey);
            if (!parent || (!visibleXY(g.x, g.y) && !visible(parent))) return null;
            const label = t(g.kind === 'father' ? 'relations.addFather' : 'relations.addMother');
            return g.small ? (
              <GhostDot key={g.key} g={g} parent={parent} label={label} onAdd={onQuickAdd} />
            ) : (
              <Ghost key={g.key} g={g} parent={parent} label={label} onAdd={onQuickAdd} />
            );
          })}
        </g>
      )}
      {leaves && (
        <g className="art-leaves" aria-hidden="true">
          {nodes.map((n) => {
            if (n.gen === 0) return null;
            const parent = n.parentKey ? byKey.get(n.parentKey) : undefined;
            return <Leaves key={n.key} n={n} parent={parent} />;
          })}
        </g>
      )}
      {[...nodes, ...under].map(person)}
    </g>
  );
}

/** Маски обрезки фото для всех радиусов кружков */
function ClipDefs() {
  return (
    <defs>
      {CLIP_RADII.map((r) => (
        <clipPath key={r} id={`km-art-${r}`}>
          <circle cx={r} cy={r} r={r} />
        </clipPath>
      ))}
      <radialGradient id="km-art-ground">
        <stop offset="0" className="art-ground-in" />
        <stop offset="1" className="art-ground-out" />
      </radialGradient>
    </defs>
  );
}

/** «Весь род»: облака крон гнёзд, пеньки родоначальников, ветви по цвету рода */
function Grove({ grove, vp, dimmed }: { grove: GroveData; vp: Viewport; dimmed: boolean }) {
  const near = (x: number, y: number, pad: number) => x + pad >= vp.minX && x - pad <= vp.maxX && y + pad >= vp.minY && y - pad <= vp.maxY;
  const links = [...grove.links].sort((a, b) => Number(!!a.onPath) - Number(!!b.onPath));
  return (
    <>
      <g className="art-crown" aria-hidden="true">
        {grove.blobs
          .filter((b) => near(b.x, b.y, b.rx + 40))
          .map((b) => (
            <ellipse key={b.key} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} />
          ))}
      </g>
      <g aria-hidden="true">
        {grove.stumps
          .filter((st) => near(st.x, st.y, 200))
          .map((st) => (
            <g key={st.key}>
              <ellipse cx={st.x} cy={st.y + GROVE_STUMP_H} rx={90} ry={14} fill="url(#km-art-ground)" />
              <path className="art-trunk" d={stumpPath(st.x, st.y)} />
            </g>
          ))}
      </g>
      <g className={dimmed ? 'art-branches dimmed' : 'art-branches'}>
        {links.map((l) => (
          <path
            key={l.key}
            d={l.d}
            className={['grove-link', `hue-${l.hue % GROVE_HUES}`, l.kind, l.onPath && 'on-path', l.dashed && 'dashed'].filter(Boolean).join(' ')}
            strokeWidth={l.onPath ? Math.max(5, l.width * 0.6 + 2) : l.width}
          />
        ))}
      </g>
    </>
  );
}

/** Пенёк под родоначальником: расширяется книзу, с корешками */
function stumpPath(x: number, top: number): string {
  const h = GROVE_STUMP_H;
  const w = 12;
  return [
    `M ${x - w} ${top}`,
    `C ${x - w} ${top + h * 0.5}, ${x - w * 1.6} ${top + h * 0.8}, ${x - w * 2.6} ${top + h}`,
    `L ${x + w * 2.6} ${top + h}`,
    `C ${x + w * 1.6} ${top + h * 0.8}, ${x + w} ${top + h * 0.5}, ${x + w} ${top}`,
    'Z',
  ].join(' ');
}

interface LabelSpec {
  /** Размер шрифта имени (в единицах схемы) */
  font: number;
  years: boolean;
  /** До скольких знаков обрезать имя */
  chars: number;
}

/**
 * Какие подписи показать и каким шрифтом — по масштабу:
 *   ≥ 0.55 — имя и годы;  0.3…0.55 — только имя, шрифт крупнее (чтобы на экране было ≥ 11px);
 *   < 0.3 — только у главных (человек в центре, выбранный, родоначальники).
 * Расставляем по важности и пропускаем подписи, которые налезли бы на уже поставленные.
 */
function placeLabels(
  nodes: ArtNode[],
  scale: number,
  print: boolean,
  opts: { focusId?: string; selectedId?: string; founders?: string[]; chars: number },
): Map<string, LabelSpec> {
  const out = new Map<string, LabelSpec>();
  const founders = new Set(opts.founders ?? []);
  const important = (n: ArtNode) =>
    n.personId === opts.focusId ? 0 : n.personId === opts.selectedId ? 1 : founders.has(n.personId) || n.gen === 0 ? 2 : 3;
  const level = print || scale >= 0.55 ? 'full' : scale >= 0.3 ? 'name' : 'key';
  const font = level === 'full' ? 14 : level === 'name' ? Math.min(24, Math.max(12, 11 / scale)) : Math.min(60, 11 / scale);
  const sorted = [...nodes].sort((a, b) => important(a) - important(b) || b.weight - a.weight);
  const boxes: [number, number, number, number][] = [];
  for (const n of sorted) {
    if (level === 'key' && important(n) > 2) continue;
    const years = level === 'full';
    // Ширина и высота подложки — примерно по длине имени (как в ArtPerson)
    const w = opts.chars * font * 0.6 + 18;
    const h = years ? font * 2.6 : font * 1.6;
    const box: [number, number, number, number] = [n.x - w / 2, n.y + n.r + 5, n.x + w / 2, n.y + n.r + 5 + h];
    if (!print && boxes.some((b) => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) continue;
    boxes.push(box);
    out.set(n.key, { font, years, chars: opts.chars });
  }
  return out;
}

/** Пустое место для неизвестного отца или матери: пунктирная веточка и кружок «+» */
function Ghost({
  g,
  parent,
  label,
  onAdd,
}: {
  g: ArtGhost;
  parent: ArtNode;
  label: string;
  onAdd: (personId: string, kind: RelativeKind) => void;
}) {
  // Веточка короче обычной: от человека в сторону пустого места
  const d = `M ${f1(parent.x)} ${f1(parent.y)} L ${f1(g.x)} ${f1(g.y)}`;
  return (
    <g className="art-ghost" role="button" aria-label={label} onClick={(e) => (e.stopPropagation(), onAdd(g.childId, g.kind))}>
      <path d={d} className="art-ghost-branch" />
      <circle cx={g.x} cy={g.y} r={ART_GHOST_R} className="art-ghost-disc" />
      <text x={g.x} y={g.y + 6} textAnchor="middle" className="art-ghost-plus">
        +
      </text>
      <text x={g.x} y={g.y + ART_GHOST_R + 15} textAnchor="middle" className="art-ghost-label">
        {label.replace(/^\+\s*/, '')}
      </text>
    </g>
  );
}

/** Неизвестный дальний предок — маленькая точка «+» у человека, без места в кроне */
function GhostDot({
  g,
  parent,
  label,
  onAdd,
}: {
  g: ArtGhost;
  parent: ArtNode;
  label: string;
  onAdd: (personId: string, kind: RelativeKind) => void;
}) {
  // Отец — левее, мать — правее, над кружком
  const dx = (g.kind === 'father' ? -1 : 1) * (parent.r * 0.55);
  const x = parent.x + dx;
  const y = parent.y - parent.r - 10;
  return (
    <g className="art-ghost dot" role="button" aria-label={label} onClick={(e) => (e.stopPropagation(), onAdd(g.childId, g.kind))}>
      <title>{label}</title>
      <circle cx={x} cy={y} r={8} className="art-ghost-disc" />
      <text x={x} y={y + 4} textAnchor="middle" className="art-ghost-plus small">
        +
      </text>
    </g>
  );
}

/** Листья вокруг человека (на концах ветвей — пышнее) и пара листиков на середине ветви */
function Leaves({ n, parent }: { n: ArtNode; parent?: ArtNode }) {
  // В «роще» ветви идут снизу, листья — сверху кружка
  const count = n.hasChildren ? 4 : 7;
  const out = [];
  if (parent) {
    for (const [i, t] of [0.45, 0.65].entries()) {
      const pt = pointOnBranch(parent, n, t);
      const side = i % 2 ? -1 : 1;
      const a = pt.angle + side * 0.9;
      out.push(
        <path
          key={`b${i}`}
          d={LEAF}
          className={i ? 'art-leaf alt' : 'art-leaf'}
          transform={`translate(${f1(pt.x)} ${f1(pt.y)}) rotate(${f1((a * 180) / Math.PI)}) scale(0.85)`}
        />,
      );
    }
  }
  for (let i = 0; i < count; i++) {
    // Детерминированный «случайный» разброс — от порядкового номера
    const spread = n.hasChildren ? 1.6 : 2.6;
    const a = n.angle + (i / (count - 1) - 0.5) * spread + ((n.gen * 7 + i * 13) % 5) * 0.04;
    const dist = n.r - 4;
    const x = n.x + Math.cos(a) * dist;
    const y = n.y + Math.sin(a) * dist;
    const scale = 0.9 + ((i * 5 + n.gen) % 3) * 0.15;
    out.push(
      <path
        key={i}
        d={LEAF}
        className={i % 2 ? 'art-leaf alt' : 'art-leaf'}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((a * 180) / Math.PI).toFixed(1)}) scale(${scale})`}
      />,
    );
  }
  return <>{out}</>;
}

const ArtPerson = memo(function ArtPerson({
  n,
  person,
  photo,
  tint,
  selected,
  focus,
  path,
  spouses,
  moreAbove,
  label: spec,
}: {
  n: ArtNode;
  person: Person;
  photo?: string;
  tint?: string;
  selected: boolean;
  focus: boolean;
  path?: 'in' | 'out';
  spouses: { person: Person; photo?: string }[];
  /** Подпись под кружком (нет — не показываем: мелкий масштаб или налезла бы на соседнюю) */
  label?: LabelSpec;
  /** «Есть ещё» — предки (стрелка вверх) или потомки (вниз) */
  moreAbove: boolean;
}) {
  const { t } = useTranslation();
  const years = lifespan(person);
  const name = givenSurname(person) || t('common.unnamed');
  const label = cut(shownNames(person).given ?? t('common.unnamed'), spec?.chars ?? 16);
  const font = spec?.font ?? 14;
  const showYears = !!spec?.years && !!years;
  // Ширина подложки подписи — примерно по длине текста
  const labelW = Math.max(label.length * font * 0.6, showYears ? years.length * font * 0.46 : 0) + 18;
  const cls = [
    'art-person',
    `card-${person.sex}`,
    selected && 'selected',
    focus && 'focus',
    n.gen === 0 && 'root',
    n.duplicate && 'duplicate',
    path === 'in' && 'in-path',
    path === 'out' && 'dimmed',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <g className={cls} transform={`translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`}>
      {spouses.map((s, i) => {
        // Супруги — маленькие кружки по бокам (первый справа, второй слева…), чуть ниже середины,
        // чтобы не закрывать подпись под кружком
        const side = i % 2 ? -1 : 1;
        const k = Math.floor(i / 2);
        const sx = side * (n.r + SPOUSE_R - 2 + k * (SPOUSE_R * 2 + 3));
        const sy = -n.r * 0.15;
        return (
          <g
            key={s.person.id}
            className={`art-spouse card-${s.person.sex}`}
            transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`}
            onClick={(e) => (e.stopPropagation(), select(s.person.id))}
            onDoubleClick={(e) => (e.stopPropagation(), setFocus(s.person.id))}
            {...contextMenuHandlers(s.person.id)}
          >
            <title>{givenSurname(s.person)}</title>
            <circle r={SPOUSE_R} className="art-disc" />
            {s.photo ? (
              <svg x={-SPOUSE_R} y={-SPOUSE_R} width={SPOUSE_R * 2} height={SPOUSE_R * 2} overflow="hidden">
                <image href={s.photo} {...avatarGeometry(s.person.photos![0]!, SPOUSE_R * 2)} clipPath={`url(#km-art-${SPOUSE_R})`} preserveAspectRatio="none" />
              </svg>
            ) : (
              <text className="art-initials" y={5} textAnchor="middle" fontSize={13}>
                {initials(s.person)}
              </text>
            )}
          </g>
        );
      })}
      <g
        className="art-main"
        role="button"
        aria-label={name}
        onClick={() => select(person.id)}
        onDoubleClick={() => setFocus(person.id)}
        {...contextMenuHandlers(person.id)}
      >
        <title>{years ? `${name} (${years})` : name}</title>
        <circle r={n.r + 5} className="art-halo" />
        <circle r={n.r} className="art-disc" style={tint ? { stroke: tint } : undefined} />
        {photo ? (
          <svg x={-n.r} y={-n.r} width={n.r * 2} height={n.r * 2} overflow="hidden">
            <image href={photo} {...avatarGeometry(person.photos![0]!, n.r * 2)} clipPath={`url(#km-art-${n.r})`} preserveAspectRatio="none" />
          </svg>
        ) : (
          <text className="art-initials" y={n.r * 0.22} textAnchor="middle" fontSize={n.r * 0.62}>
            {initials(person)}
          </text>
        )}
      </g>
      {spec && (
        <g className="art-label">
          <rect
            className="art-label-bg"
            x={-labelW / 2}
            y={n.r + 5}
            width={labelW}
            height={showYears ? font * 2.6 : font * 1.6}
            rx={font * 0.65}
          />
          <text className="art-name" y={n.r + 5 + font * 1.15} textAnchor="middle" fontSize={font}>
            {label}
          </text>
          {showYears && (
            <text className="art-years" y={n.r + 5 + font * 2.15} textAnchor="middle" fontSize={font * 0.82}>
              {years}
            </text>
          )}
        </g>
      )}
      {n.more && (
        <g
          className="more"
          onClick={(e) => (e.stopPropagation(), setFocus(person.id))}
          transform={`translate(0 ${n.under ? n.r + 50 : -n.r - 4})`}
        >
          <title>{t(moreAbove ? 'tree.moreAbove' : 'tree.moreBelow')}</title>
          <circle r={9} />
          <text y={4} textAnchor="middle">
            {n.under ? '▼' : '▲'}
          </text>
        </g>
      )}
    </g>
  );
});
