// packages/design/src/components/OverviewSankeyFlow.tsx -- the redesigned Overview connectivity graphic
// (IP-CONSOLE-01 RD.2). A true three-column Sankey rendered from the `OverviewSankey` view model:
//   source-class rings (lane color)  ->  up to 3 VTZ corona nodes (per-VTZ, detection-driven risk)  ->
//   destination-category rings (amber), with every app on ONE shared arch.
// Ribbons flow two-stage (source->VTZ lane-colored, VTZ->dest amber), dissolve into EVERY node via a single
// radial-hole mask (rounded fade, no hard edges), and never cross (ports are ordered by the other
// endpoint's height). Presentation only: the caller supplies the resolved graph (RD.4 assembles it live).
//
// Colour is semantic-token only (INV-CONSOLE-DESIGN-SEMANTIC-COLOR): node/text colours come from token
// classes; the ribbon/halo/fill gradients reference `var(--fc-color-*)` (and `color-mix`) in their stops;
// the dissolve mask uses the `black`/`white`/`transparent` keywords. No raw hex lives here (the hex gate).
// Meaning is never colour-alone: the accessible name enumerates the sources, the VTZs + their risk, and the
// destinations. Loading and empty are honest states (INV-CONSOLE-NO-STUB).

import type { CSSProperties, ReactElement } from 'react';
import { useState } from 'react';

import {
  overviewHighlight,
  overviewHighlightSource,
  overviewVtzPage,
  sourceEdgeKey,
  destEdgeKey,
  type OverviewSankey,
  type OverviewVtzNode,
  type RiskLevel,
} from '@forge/contracts';

export interface OverviewSankeyFlowProps {
  /** The resolved Sankey, or `null` while loading (renders the skeleton). */
  readonly graph: OverviewSankey | null;
  /** True while the read is in flight; renders the skeleton regardless of `graph`. */
  readonly loading?: boolean;
  /** Which VTZ page to show (0-based; at most 3 VTZs render per page). */
  readonly vtzPage?: number;
  /** The destination class currently hovered -> the flows collapse to only what feeds it (else all). */
  readonly hoveredDest?: string | null;
  /**
   * Pointer-hover callback for the destination nodes: the class on enter, `null` on leave. The parent owns
   * {@link hoveredDest} and feeds it back, so the highlight is a controlled visual filter (the accessible
   * name already enumerates every node, so this is a mouse-only enhancement, never the sole affordance).
   */
  readonly onHoverDest?: (destClass: string | null) => void;
  /** The source class currently hovered -> the flows collapse to only the paths out of it (else all). */
  readonly hoveredSource?: string | null;
  /**
   * Pointer-hover callback for the source lanes: the class on enter, `null` on leave (the mirror of
   * {@link onHoverDest}). A mouse-only visual enhancement over the enumerated accessible name.
   */
  readonly onHoverSource?: (sourceClass: string | null) => void;
  /**
   * Open a clicked container's member list (O1.6b): a source-class lane or a destination-category ring.
   * The visible rings are mouse-clickable (a pointer enhancement over the `role=img` graphic); a
   * screen-reader + keyboard nav of real buttons renders alongside so the affordance is never mouse-only.
   */
  readonly onSelectContainer?: (container: string) => void;
}

// Fixed SVG coordinate system; the rendered size is responsive (viewBox + CSS width:100%).
const VIEW_W = 1360;
const VIEW_H = 900;
const SRC_BASE = 172;
const SRC_BULGE = 58;
const VTZ_X = 560;
const VTZ_R = 46;
const DEST_A = 1000;
const DEST_BULGE = 34;
const DEST_R = 64;
const APPX = 1120;
const APPS_BULGE = 32;
// The apps arch lists this many named destinations collapsed; the rest fan out on click ("+N more").
const APPS_COLLAPSED = 5;
const AY0 = 80;
const AY1 = 820;
// Perceptual ribbon widths so no single flow dominates.
const T_MIN = 12;
const T_MAX = 34;

/** Friendly labels for the known lane / destination classes; unknown tags are title-cased. */
const SOURCE_LABEL: Readonly<Record<string, string>> = {
  users: 'USERS',
  devices: 'DEVICES',
  agents: 'AI AGENTS',
};
const DEST_LABEL: Readonly<Record<string, string>> = {
  network: 'NETWORK',
  saas: 'SAAS APPS',
  'private-apps': 'PRIVATE APPS',
  'data-stores': 'DATA STORES',
};
const RISK_LABEL: Readonly<Record<RiskLevel, string>> = {
  green: 'Nominal',
  yellow: 'Elevated',
  red: 'Critical',
};
const RISK_MOD: Readonly<Record<RiskLevel, string>> = {
  green: 'good',
  yellow: 'caution',
  red: 'critical',
};
// The VTZ enforcement posture, shown on the zone (PR-3b). Observe (the learning default) reads as
// "Watching"; Standard/Quarantine name the applied posture.
const PROFILE_LABEL: Readonly<Record<OverviewVtzNode['profile'], string>> = {
  observe: 'Watching',
  standard: 'Standard',
  quarantine: 'Quarantine',
};
const LANE_MOD = (cls: string): string => (SOURCE_LABEL[cls] ? cls : 'muted');

function titleCase(tag: string): string {
  return tag
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}
const sourceLabel = (cls: string): string => SOURCE_LABEL[cls] ?? titleCase(cls).toUpperCase();
const destLabel = (cls: string): string => DEST_LABEL[cls] ?? titleCase(cls).toUpperCase();

/** A node's hover-tooltip count phrase, pluralized honestly (1 connection, N connections). */
const nodeTip = (count: number): string =>
  `${String(count)} ${count === 1 ? 'connection' : 'connections'}`;

/** Evenly distribute `n` vertical centers in `[top, bottom]` (single item centered). */
function distribute(n: number, top: number, bottom: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(top + bottom) / 2];
  const step = (bottom - top) / (n - 1);
  return Array.from({ length: n }, (_, i) => top + i * step);
}

/** `)` factor for the sources (0 at the ends, 1 in the middle) and `(` for the destinations/apps. */
const bulge = (rel: number): number => 1 - (2 * rel - 1) ** 2;
const sourceRingR = (count: number): number =>
  Math.max(32, Math.min(68, 30 + 1.4 * Math.sqrt(count)));
const appsArch = (y: number): number => APPX - APPS_BULGE * bulge((y - AY0) / (AY1 - AY0));

/** A point on a circle's left/right arc at vertical offset `dy` -> the ribbon leading edge is a `)`/`(`. */
function arcX(cx: number, r: number, dy: number, side: 'left' | 'right'): number {
  const cd = Math.max(-r + 3, Math.min(r - 3, dy));
  const off = Math.sqrt(r * r - cd * cd);
  return side === 'right' ? cx + off : cx - off;
}

/** A filled tangent ribbon (horizontal at both ends so it melts into the node). */
function ribbonPath(
  x0: number,
  y0: number,
  t0: number,
  x1: number,
  y1: number,
  t1: number,
): string {
  const c0 = x0 + (x1 - x0) * 0.5;
  const c1 = x1 - (x1 - x0) * 0.5;
  return (
    `M${x0},${y0 - t0 / 2} C${c0},${y0 - t0 / 2} ${c1},${y1 - t1 / 2} ${x1},${y1 - t1 / 2}` +
    ` L${x1},${y1 + t1 / 2} C${c1},${y1 + t1 / 2} ${c0},${y0 + t0 / 2} ${x0},${y0 + t0 / 2} Z`
  );
}

/** Fine corona rays (the locked VTZ ring); colour comes from the parent class, opacity from the shimmer. */
function coronaRays(cx: number, cy: number, r: number): ReactElement[] {
  const rays: ReactElement[] = [];
  for (let i = 0; i < 100; i += 1) {
    const a = (i / 100) * Math.PI * 2;
    const vary = 0.5 + 0.5 * Math.abs(Math.sin(i * 2.399) * 0.7 + Math.sin(i * 0.7) * 0.3);
    const r0 = r + 2;
    const r1 = r + 2 + 6.5 * (0.45 + 0.55 * vary);
    rays.push(
      <line
        key={i}
        className="fc-ov__ray"
        x1={cx + r0 * Math.cos(a)}
        y1={cy + r0 * Math.sin(a)}
        x2={cx + r1 * Math.cos(a)}
        y2={cy + r1 * Math.sin(a)}
        opacity={0.18 + 0.42 * vary}
      />,
    );
  }
  return rays;
}

/** Order edges so a node's ports stack by the OTHER endpoint's height -> ribbons never cross. */
function sortedPorts<T>(
  edges: readonly T[],
  otherY: (e: T) => number,
  weight: (e: T) => number,
  cy: number,
  cx: number,
  r: number,
  side: 'left' | 'right',
  px: (w: number) => number,
): Map<T, { x: number; y: number; t: number }> {
  const ordered = [...edges].sort((a, b) => otherY(a) - otherY(b));
  const total = ordered.reduce((s, e) => s + px(weight(e)), 0);
  let cursor = cy - total / 2;
  const m = new Map<T, { x: number; y: number; t: number }>();
  for (const e of ordered) {
    const t = px(weight(e));
    const dy = cursor + t / 2 - cy;
    m.set(e, { x: arcX(cx, r, dy, side), y: cy + dy, t });
    cursor += t;
  }
  return m;
}

/** The number/label centred inside a ring: softened numeric on top, spaced caps below. */
function ringText(
  x: number,
  y: number,
  count: number,
  label: string,
  labelClass: string,
): ReactElement {
  const s = String(count);
  const fs = s.length > 3 ? 20 : s.length > 2 ? 29 : 33; // -25% height, weight 300 via CSS
  return (
    <>
      <text
        className="fc-ov__count"
        x={x}
        y={y - 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={fs}
      >
        {s}
      </text>
      <text className={labelClass} x={x} y={y + fs * 0.58} textAnchor="middle" fontSize={11}>
        {label}
      </text>
    </>
  );
}

function empty(graph: OverviewSankey): boolean {
  return graph.sources.length === 0 && graph.vtzs.length === 0 && graph.destinations.length === 0;
}

function describe(graph: OverviewSankey, vtzs: readonly OverviewVtzNode[]): string {
  if (empty(graph)) return 'Connectivity flow: no connectivity observed.';
  const srcs = graph.sources.map((s) => `${sourceLabel(s.class)} ${s.count}`).join(', ') || 'none';
  const zones = vtzs.map((v) => `${v.name} ${RISK_LABEL[v.risk.level]}`).join(', ') || 'none';
  const dests =
    graph.destinations.map((d) => `${destLabel(d.class)} ${d.count}`).join(', ') || 'none';
  return `Connectivity flow. Sources: ${srcs}. Zones: ${zones}. Destinations: ${dests}.`;
}

/** A gradient stop coloured by a CSS custom property (token), optionally light-mixed toward white. */
function stop(offset: number, varName: string, opacity: number, mixWhite = 0): ReactElement {
  const color = mixWhite > 0 ? `color-mix(in srgb, ${varName} ${100 - mixWhite}%, white)` : varName;
  const style: CSSProperties = { stopColor: color, stopOpacity: opacity };
  return <stop key={`${offset}-${varName}-${mixWhite}`} offset={offset} style={style} />;
}

export function OverviewSankeyFlow({
  graph,
  loading,
  vtzPage = 0,
  hoveredDest = null,
  onHoverDest,
  hoveredSource = null,
  onHoverSource,
  onSelectContainer,
}: OverviewSankeyFlowProps): ReactElement {
  // Which destination category has its apps fanned out (top-N -> full list). Local UI state; the graph
  // is unchanged. Hooks precede the early returns below (Rules of Hooks).
  const [expandedDest, setExpandedDest] = useState<string | null>(null);
  const svgBase = {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'xMidYMid meet' as const,
  };

  if (loading || graph === null) {
    return (
      <div
        className="fc-ov fc-ov--loading"
        role="img"
        aria-label="Loading connectivity flow"
        aria-busy="true"
      >
        <svg {...svgBase} aria-hidden="true">
          <rect className="fc-ov__skeleton" x={100} y={140} width={130} height={40} rx={8} />
          <rect className="fc-ov__skeleton" x={VTZ_X - 46} y={200} width={92} height={92} rx={46} />
          <rect
            className="fc-ov__skeleton"
            x={DEST_A - 64}
            y={140}
            width={128}
            height={40}
            rx={8}
          />
        </svg>
      </div>
    );
  }

  const name = describe(graph, overviewVtzPage(graph.vtzs, vtzPage));
  if (empty(graph)) {
    return (
      <div className="fc-ov fc-ov--empty" role="img" aria-label={name}>
        <svg {...svgBase} aria-hidden="true">
          <text className="fc-ov__empty-note" x={VIEW_W / 2} y={VIEW_H / 2} textAnchor="middle">
            No connectivity observed
          </text>
        </svg>
      </div>
    );
  }

  // Layout ---------------------------------------------------------------------------------------
  const vtzs = overviewVtzPage(graph.vtzs, vtzPage);
  const vtzIds = new Set(vtzs.map((v) => v.id));
  const sourceEdges = graph.sourceEdges.filter((e) => vtzIds.has(e.vtzId));
  const destEdges = graph.destEdges.filter((e) => vtzIds.has(e.vtzId));

  const srcYs = distribute(graph.sources.length, 150, 700);
  const sources = graph.sources.map((s, i) => {
    const rel = graph.sources.length > 1 ? i / (graph.sources.length - 1) : 0.5;
    const r = sourceRingR(s.count);
    return { ...s, r, y: srcYs[i] ?? VIEW_H / 2, x: SRC_BASE + SRC_BULGE * bulge(rel) };
  });
  const vtzYs = distribute(vtzs.length, 220, 680);
  const vtzNodes = vtzs.map((v, i) => ({ ...v, x: VTZ_X, y: vtzYs[i] ?? VIEW_H / 2 }));
  const destYs = distribute(graph.destinations.length, 150, 760);
  const dests = graph.destinations.map((d, i) => {
    const y = destYs[i] ?? VIEW_H / 2;
    return { ...d, y, x: DEST_A - DEST_BULGE * bulge((y - 140) / (760 - 140 || 1)) };
  });
  const srcById = new Map(sources.map((s) => [s.class, s]));
  const vById = new Map(vtzNodes.map((v) => [v.id, v]));
  const dById = new Map(dests.map((d) => [d.class, d]));

  // Perceptual thickness across all flows.
  const weights = [...sourceEdges.map((e) => e.weight), ...destEdges.map((e) => e.weight)];
  const comp = (w: number): number => Math.sqrt(Math.max(0, w));
  const lo = weights.length ? Math.min(...weights.map(comp)) : 0;
  const hi = weights.length ? Math.max(...weights.map(comp)) : 1;
  const px = (w: number): number =>
    hi === lo ? (T_MIN + T_MAX) / 2 : T_MIN + (T_MAX - T_MIN) * ((comp(w) - lo) / (hi - lo));

  // Ports (sorted by the other endpoint's y).
  const srcOut = new Map(
    sources.map((s) => [
      s.class,
      sortedPorts(
        sourceEdges.filter((e) => e.sourceClass === s.class),
        (e) => vById.get(e.vtzId)?.y ?? 0,
        (e) => e.weight,
        s.y,
        s.x,
        s.r,
        'right',
        px,
      ),
    ]),
  );
  const vtzIn = new Map(
    vtzNodes.map((v) => [
      v.id,
      sortedPorts(
        sourceEdges.filter((e) => e.vtzId === v.id),
        (e) => srcById.get(e.sourceClass)?.y ?? 0,
        (e) => e.weight,
        v.y,
        v.x,
        VTZ_R,
        'left',
        px,
      ),
    ]),
  );
  const vtzOut = new Map(
    vtzNodes.map((v) => [
      v.id,
      sortedPorts(
        destEdges.filter((e) => e.vtzId === v.id),
        (e) => dById.get(e.destClass)?.y ?? 0,
        (e) => e.weight,
        v.y,
        v.x,
        VTZ_R,
        'right',
        px,
      ),
    ]),
  );
  const dstIn = new Map(
    dests.map((d) => [
      d.class,
      sortedPorts(
        destEdges.filter((e) => e.destClass === d.class),
        (e) => vById.get(e.vtzId)?.y ?? 0,
        (e) => e.weight,
        d.y,
        d.x,
        DEST_R,
        'left',
        px,
      ),
    ]),
  );

  // Highlight (hover a node -> keep only its contributing source->VTZ->dest paths). A hovered
  // destination and a hovered source are mirror computations; a destination hover takes precedence when
  // both are somehow set.
  const hl = hoveredDest
    ? overviewHighlight(graph, hoveredDest)
    : hoveredSource
      ? overviewHighlightSource(graph, hoveredSource)
      : null;
  const dim = (on: boolean): number => (hl && !on ? 0.12 : 1);

  // Dissolve mask: one hole per node (hidden inside the ring, rounding up to visible ~48px out).
  const holes: ReactElement[] = [];
  const holeDefs: ReactElement[] = [];
  const addHole = (cx: number, cy: number, innerR: number, holeR: number, key: string): void => {
    holeDefs.push(
      <radialGradient
        key={key}
        id={`ovh-${key}`}
        gradientUnits="userSpaceOnUse"
        cx={cx}
        cy={cy}
        r={holeR}
      >
        <stop offset={0} stopColor="black" />
        <stop offset={innerR / holeR} stopColor="black" />
        <stop offset={1} stopColor="black" stopOpacity={0} />
      </radialGradient>,
    );
    holes.push(<circle key={key} cx={cx} cy={cy} r={holeR} fill={`url(#ovh-${key})`} />);
  };
  sources.forEach((s, i) => addHole(s.x, s.y, s.r - 6, s.r + 48, `s${i}`));
  vtzNodes.forEach((v, i) => addHole(v.x, v.y, VTZ_R + 13, VTZ_R + 50, `v${i}`));
  dests.forEach((d, i) => addHole(d.x, d.y, DEST_R - 6, DEST_R + 48, `d${i}`));

  // Ribbons (source->VTZ lane-coloured; VTZ->dest amber).
  const ribbons: ReactElement[] = [];
  sourceEdges.forEach((e, i) => {
    const p0 = srcOut.get(e.sourceClass)?.get(e);
    const p1 = vtzIn.get(e.vtzId)?.get(e);
    if (!p0 || !p1) return;
    ribbons.push(
      <path
        key={`s${i}`}
        d={ribbonPath(p0.x - 6, p0.y, p0.t, p1.x + 6, p1.y, p1.t)}
        fill={`url(#ovg-${LANE_MOD(e.sourceClass)})`}
        opacity={dim(hl ? hl.sourceEdgeKeys.has(sourceEdgeKey(e)) : true)}
      />,
    );
  });
  destEdges.forEach((e, i) => {
    const p0 = vtzOut.get(e.vtzId)?.get(e);
    const p1 = dstIn.get(e.destClass)?.get(e);
    if (!p0 || !p1) return;
    ribbons.push(
      <path
        key={`d${i}`}
        d={ribbonPath(p0.x - 6, p0.y, p0.t, p1.x + 6, p1.y, p1.t)}
        fill="url(#ovg-objects)"
        opacity={dim(hl ? hl.destEdgeKeys.has(destEdgeKey(e)) : true)}
      />,
    );
  });

  return (
    <div className="fc-ov-wrap">
      <div className="fc-ov" role="img" aria-label={name}>
        <svg {...svgBase} aria-hidden="true">
          <defs>
            {(['users', 'devices', 'agents', 'objects', 'muted'] as const).map((lane) => (
              <linearGradient key={lane} id={`ovg-${lane}`} x1="0" y1="0" x2="1" y2="0">
                {stop(0, `var(--fc-color-flow-${lane === 'muted' ? 'objects' : lane})`, 0.62)}
                {stop(1, `var(--fc-color-flow-${lane === 'muted' ? 'objects' : lane})`, 0.5, 22)}
              </linearGradient>
            ))}
            {holeDefs}
            <mask
              id="ov-dissolve"
              maskUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={VIEW_W}
              height={VIEW_H}
            >
              <rect width={VIEW_W} height={VIEW_H} fill="white" />
              {holes}
            </mask>
          </defs>

          <g className="fc-ov__ribbons" mask="url(#ov-dissolve)">
            {ribbons}
          </g>

          {sources.map((s) => {
            const clickable = onSelectContainer
              ? {
                  onClick: () => onSelectContainer(s.class),
                  style: { cursor: 'pointer' as const },
                }
              : {};
            const hover = onHoverSource
              ? {
                  onMouseEnter: () => onHoverSource(s.class),
                  onMouseLeave: () => onHoverSource(null),
                }
              : {};
            const on = !hl || hl.sourceClasses.has(s.class);
            return (
              <g
                key={s.class}
                className="fc-ov__src"
                opacity={on ? 1 : 0.4}
                {...hover}
                {...clickable}
              >
                <title>{`${sourceLabel(s.class)}: ${nodeTip(s.count)}`}</title>
                <circle
                  className={`fc-ov__ring fc-ov__ring--${LANE_MOD(s.class)}`}
                  cx={s.x}
                  cy={s.y}
                  r={s.r}
                />
                {ringText(s.x, s.y, s.count, sourceLabel(s.class), 'fc-ov__label')}
              </g>
            );
          })}

          {vtzNodes.map((v) => {
            const mod = RISK_MOD[v.risk.level];
            const first = v.name.split('.')[0];
            const rest = v.name.split('.').slice(1).join('.');
            const on = !hl || hl.vtzIds.has(v.id);
            return (
              <g key={v.id} className={`fc-ov__vtz fc-ov__vtz--${mod}`} opacity={on ? 1 : 0.4}>
                <title>{`${v.name}: ${RISK_LABEL[v.risk.level]} risk, ${PROFILE_LABEL[v.profile]}`}</title>
                <g className="fc-ov__corona">{coronaRays(v.x, v.y, VTZ_R)}</g>
                <circle className="fc-ov__rim" cx={v.x} cy={v.y} r={VTZ_R + 11} fill="none" />
                <circle className="fc-ov__vtz-disc" cx={v.x} cy={v.y} r={VTZ_R} />
                <text
                  className="fc-ov__vtz-org"
                  x={v.x}
                  y={v.y - 15}
                  textAnchor="middle"
                  fontSize={11}
                >
                  {first}
                </text>
                <text
                  className="fc-ov__vtz-name"
                  x={v.x}
                  y={v.y + 1}
                  textAnchor="middle"
                  fontSize={12.5}
                >
                  {rest}
                </text>
                <text
                  className="fc-ov__vtz-risk"
                  x={v.x}
                  y={v.y + 18}
                  textAnchor="middle"
                  fontSize={9.5}
                >
                  {RISK_LABEL[v.risk.level]}
                </text>
                <text
                  className="fc-ov__vtz-profile"
                  x={v.x}
                  y={v.y + 31}
                  textAnchor="middle"
                  fontSize={8.5}
                >
                  {PROFILE_LABEL[v.profile]}
                </text>
              </g>
            );
          })}

          {dests.map((d) => {
            const on = !hl || hl.destClasses.has(d.class);
            const isExpanded = expandedDest === d.class;
            const shownApps = isExpanded ? d.apps : d.apps.slice(0, APPS_COLLAPSED);
            const hiddenApps = d.apps.length - shownApps.length;
            const rows: { key: string; label: string; kind: 'app' | 'toggle' | 'tail' }[] =
              shownApps.map((a) => ({ key: a.address, label: a.name, kind: 'app' }));
            // One "more" affordance at a time: collapsed with hidden apps shows a single fan-out toggle
            // (it stands in for both the hidden named apps and the unclassified tail). Fully shown, the
            // unclassified-tail count (connections beyond the engine's bounded top-N) reads as its own row,
            // alongside a "show fewer" affordance when the list was fanned out.
            if (hiddenApps > 0) {
              rows.push({ key: '__toggle', label: `+${hiddenApps} more`, kind: 'toggle' });
            } else {
              if (isExpanded && d.apps.length > APPS_COLLAPSED) {
                rows.push({ key: '__toggle', label: 'show fewer', kind: 'toggle' });
              }
              if (d.moreCount > 0) {
                rows.push({ key: '__tail', label: `+${d.moreCount} more`, kind: 'tail' });
              }
            }
            const rowH = 23;
            const top = d.y - ((rows.length - 1) * rowH) / 2;
            const hover = onHoverDest
              ? {
                  onMouseEnter: () => onHoverDest(d.class),
                  onMouseLeave: () => onHoverDest(null),
                  style: { cursor: 'pointer' as const },
                }
              : {};
            const ringClick = onSelectContainer
              ? {
                  onClick: () => onSelectContainer(d.class),
                  style: { cursor: 'pointer' as const },
                }
              : {};
            return (
              <g key={d.class} className="fc-ov__dest" opacity={on ? 1 : 0.4} {...hover}>
                <g {...ringClick}>
                  <title>{`${destLabel(d.class)}: ${nodeTip(d.count)}`}</title>
                  <circle
                    className="fc-ov__ring fc-ov__ring--objects"
                    cx={d.x}
                    cy={d.y}
                    r={DEST_R}
                  />
                  {ringText(d.x, d.y, d.count, destLabel(d.class), 'fc-ov__dest-label')}
                </g>
                {rows.map((row, i) => {
                  const ly = top + i * rowH;
                  const ax = appsArch(ly);
                  const isMore = row.kind !== 'app';
                  const click =
                    row.kind === 'toggle'
                      ? {
                          onClick: () => {
                            setExpandedDest(isExpanded ? null : d.class);
                          },
                          style: { cursor: 'pointer' as const },
                        }
                      : {};
                  return (
                    <g key={row.key} {...click}>
                      <circle
                        className={`fc-ov__app-dot${isMore ? ' fc-ov__app-dot--more' : ''}`}
                        cx={ax}
                        cy={ly}
                        r={2.5}
                        fill="none"
                      />
                      <text
                        className={`fc-ov__app${isMore ? ' fc-ov__app--more' : ''}`}
                        x={ax + 14}
                        y={ly + 4}
                        fontSize={14}
                      >
                        {row.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      {onSelectContainer ? (
        <nav className="fc-ov__containers" aria-label="Open a container's members">
          {[
            ...graph.sources.map((s) => ({
              cls: s.class,
              label: sourceLabel(s.class),
              count: s.count,
            })),
            ...graph.destinations.map((d) => ({
              cls: d.class,
              label: destLabel(d.class),
              count: d.count,
            })),
          ].map((c) => (
            <button
              key={c.cls}
              type="button"
              className="fc-ov__container-nav"
              onClick={() => onSelectContainer(c.cls)}
            >
              {`Open ${c.label} members (${String(c.count)} ${c.count === 1 ? 'connection' : 'connections'})`}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
