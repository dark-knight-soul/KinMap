import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TRUNK_H, type ArtNode, type ArtTreeLayout } from '../../layout/artTreeLayout';
import type { MediaStore } from '../../file/format';
import { avatarGeometry } from '../../file/images';
import type { Person, TreeData } from '../../model/types';
import { select, setFocus, useApp } from '../../state/store';
import { useUi } from '../../state/ui';
import { lifespan } from '../format';
import { urlFor } from '../media';
import { contextMenuHandlers } from './cardEvents';
import type { Viewport } from './PanZoom';

// Художественное «Дерево»: ствол, изогнутые ветви, люди — круглые «листья».
// Раскладка — в layout/artTreeLayout.ts, здесь только рисование.

const SPOUSE_R = 13;
const NO_MEDIA: MediaStore = {};
/** Больше стольких людей — без декоративных листьев (ради скорости) */
const LEAVES_LIMIT = 1500;
/** Форма листа: от черенка (0,0) вправо */
const LEAF = 'M0 0 C 6 -7, 16 -8, 24 0 C 16 8, 6 7, 0 0 Z';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const initials = (p: Person) => [p.names.given, p.names.surname].map((x) => x?.trim()[0] ?? '').join('').toUpperCase() || '?';

/** Изогнутая ветвь от родителя к ребёнку: выходит по направлению родителя, входит по направлению ребёнка */
function branchPath(parent: ArtNode, child: ArtNode): string {
  const d = Math.hypot(child.x - parent.x, child.y - parent.y);
  const ux = Math.cos(parent.angle);
  const uy = Math.sin(parent.angle);
  const vx = Math.cos(child.angle);
  const vy = Math.sin(child.angle);
  const c1 = [parent.x + ux * d * 0.45, parent.y + uy * d * 0.45];
  const c2 = [child.x - vx * d * 0.35, child.y - vy * d * 0.35];
  return `M ${parent.x.toFixed(1)} ${parent.y.toFixed(1)} C ${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)}, ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)}, ${child.x.toFixed(1)} ${child.y.toFixed(1)}`;
}

/** Ствол и корни: сужается кверху */
const TRUNK = `M -16 0 C -17 70, -24 ${TRUNK_H - 50}, -40 ${TRUNK_H} Q -62 ${TRUNK_H + 10} -86 ${TRUNK_H + 16} L 86 ${TRUNK_H + 16} Q 62 ${TRUNK_H + 10} 40 ${TRUNK_H} C 24 ${TRUNK_H - 50}, 17 70, 16 0 Z`;

export function ArtTreeContent({
  tree,
  layout,
  vp,
  selectedId,
  tints,
  print = false,
}: {
  tree: TreeData;
  layout: ArtTreeLayout;
  vp: Viewport;
  selectedId?: string;
  tints?: Map<string, string>;
  print?: boolean;
}) {
  const media = useApp((s) => s.session?.media ?? NO_MEDIA);
  const highlight = useUi((s) => s.highlight);
  const pathIds = useMemo(() => (highlight && !print ? new Set(highlight.ids) : null), [highlight, print]);
  const byKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout]);
  const simple = !print && vp.scale < 0.3;
  const visible = (n: ArtNode, pad = 80) => n.x + pad >= vp.minX && n.x - pad <= vp.maxX && n.y + pad >= vp.minY && n.y - pad <= vp.maxY;
  const nodes = layout.nodes.filter((n) => visible(n));
  const leaves = !simple && layout.nodes.length <= LEAVES_LIMIT;
  const photoUrl = (p: Person | undefined) => {
    const ph = p?.photos?.[0];
    const bytes = ph ? media[ph.id] : undefined;
    return ph && bytes ? urlFor(bytes, ph.mime) : undefined;
  };

  return (
    <g className="art-tree">
      <defs>
        {[38, 28, SPOUSE_R].map((r) => (
          <clipPath key={r} id={`km-art-${r}`}>
            <circle cx={r} cy={r} r={r} />
          </clipPath>
        ))}
      </defs>
      <ellipse className="art-ground" cx={0} cy={TRUNK_H + 18} rx={240} ry={20} />
      <path className="art-trunk" d={TRUNK} />
      {/* Ветви: рисуем все, чьи концы рядом с экраном */}
      <g className={pathIds ? 'art-branches dimmed' : 'art-branches'}>
        {layout.nodes.map((n) => {
          const parent = n.parentKey ? byKey.get(n.parentKey) : undefined;
          if (!parent || (!visible(n, 400) && !visible(parent, 400))) return null;
          return <path key={n.key} d={branchPath(parent, n)} className="art-branch" strokeWidth={Math.max(3, 20 - (n.gen - 1) * 5)} />;
        })}
      </g>
      {leaves && (
        <g className="art-leaves" aria-hidden="true">
          {nodes.map((n) => (n.gen === 0 ? null : <Leaves key={n.key} n={n} />))}
        </g>
      )}
      {nodes.map((n) => {
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
            simple={simple}
            path={pathIds ? (pathIds.has(p.id) ? 'in' : 'out') : undefined}
            spouses={simple ? [] : n.spouses.map((id) => ({ person: tree.people[id]!, photo: photoUrl(tree.people[id]) }))}
          />
        );
      })}
    </g>
  );
}

/** Несколько листиков вокруг «листа»-человека: на концах ветвей — пышнее */
function Leaves({ n }: { n: ArtNode }) {
  const count = n.hasChildren ? 3 : 5;
  const out = [];
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
  simple,
  path,
  spouses,
}: {
  n: ArtNode;
  person: Person;
  photo?: string;
  tint?: string;
  selected: boolean;
  simple: boolean;
  path?: 'in' | 'out';
  spouses: { person: Person; photo?: string }[];
}) {
  const { t } = useTranslation();
  const years = lifespan(person);
  const name = [person.names.given, person.names.surname].filter(Boolean).join(' ') || t('common.unnamed');
  const cls = [
    'art-person',
    `card-${person.sex}`,
    selected && 'selected',
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
        const sx = side * (n.r + SPOUSE_R - 3 + k * (SPOUSE_R * 2 + 2));
        const sy = n.r * 0.25;
        return (
          <g
            key={s.person.id}
            className={`art-spouse card-${s.person.sex}`}
            transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`}
            onClick={(e) => (e.stopPropagation(), select(s.person.id))}
            onDoubleClick={(e) => (e.stopPropagation(), setFocus(s.person.id))}
            {...contextMenuHandlers(s.person.id)}
          >
            <title>{[s.person.names.given, s.person.names.surname].filter(Boolean).join(' ')}</title>
            <circle r={SPOUSE_R} className="art-disc" />
            {s.photo ? (
              <svg x={-SPOUSE_R} y={-SPOUSE_R} width={SPOUSE_R * 2} height={SPOUSE_R * 2} overflow="hidden">
                <image href={s.photo} {...avatarGeometry(s.person.photos![0]!, SPOUSE_R * 2)} clipPath={`url(#km-art-${SPOUSE_R})`} preserveAspectRatio="none" />
              </svg>
            ) : (
              <text className="art-initials" y={4} textAnchor="middle" fontSize={10}>
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
      {!simple && (
        <>
          <text className="art-name" y={n.r + 18} textAnchor="middle">
            {cut(person.names.given ?? t('common.unnamed'), 16)}
          </text>
          {years && (
            <text className="art-years" y={n.r + 32} textAnchor="middle">
              {years}
            </text>
          )}
        </>
      )}
      {n.more && (
        <g className="more" onClick={(e) => (e.stopPropagation(), setFocus(person.id))} transform={`translate(0 ${-n.r - 4})`}>
          <title>{t('tree.moreBelow')}</title>
          <circle r={9} />
          <text y={4} textAnchor="middle">
            ▲
          </text>
        </g>
      )}
    </g>
  );
});
