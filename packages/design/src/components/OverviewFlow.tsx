// packages/design/src/components/OverviewFlow.tsx -- the Overview connectivity flow (IP-CONSOLE-01 O1.4).
//
// The flagship home graphic: a three-column flow of the ACTUAL tenant-wide connectivity, projected from the
// crdb CONNECTIVITY_GRAPH read (not a drawn diagram). Left = source-class nodes (Users blue / Devices
// teal-green / AI Agents purple), middle = a single Console-side "Public" zone colored by the RISK BAND
// (green/yellow/red from detected alerts; the removed trust score's replacement, DR.1 / grounded steer
// 2026-07-13), right = destination-class nodes (amber objects). Ribbons flow source -> zone -> destination,
// colored by SOURCE class and weighted by the classified-edge count.
//
// Presentation only: the caller supplies the already-resolved `OverviewGraph` view model (the O1.3 resolver
// projects it). Every color is a semantic token class, never a hand-picked hex (the hex-scan gate). Meaning
// is never carried by color alone: the accessible name enumerates the source/destination classes with their
// counts and the zone's risk level, and every node/zone carries a visible text label. Four states are
// honest -- loading (skeleton), empty ("no connectivity observed", the zone still shows its risk), and the
// ready flow -- so nothing is ever fabricated (INV-CONSOLE-NO-STUB).

import type { ReactElement } from 'react';

import type { OverviewClassNode, OverviewEdge, OverviewGraph, RiskLevel } from '@forge/contracts';

export interface OverviewFlowProps {
  /** The resolved connectivity graph, or `null` while it is still loading (renders the skeleton). */
  readonly graph: OverviewGraph | null;
  /** True while the read is in flight; renders the loading skeleton regardless of `graph`. */
  readonly loading?: boolean;
  /** Optional explicit pixel width. Defaults to responsive (the SVG scales to its container). */
  readonly width?: number;
  /** Optional explicit pixel height. Defaults to responsive. */
  readonly height?: number;
}

// The fixed SVG coordinate system; the rendered size is responsive (viewBox + CSS) unless width/height are
// given. TUNE: proportioned from the Overview mockup (three columns, a tall central zone, a faint field).
const VIEW_W = 720;
const VIEW_H = 420;
const PAD = 24;
const LEFT_X = 96;
const MID_X = 360;
const RIGHT_X = 624;
const NODE_W = 150;
const NODE_H = 40;
const ZONE_W = 132;
// Edge stroke widths (px in the viewBox), scaled by the heaviest edge so the thickest ribbon reads clearly
// and the lightest is still visible. TUNE: from the mockup's ribbon weight range.
const EDGE_MIN = 1.5;
const EDGE_MAX = 11;

/** A known source class -> its display label + lane color modifier. Unknown classes fall back to muted. */
const SOURCE_META: Readonly<Record<string, { label: string; lane: string }>> = {
  users: { label: 'Users', lane: 'users' },
  devices: { label: 'Devices', lane: 'devices' },
  agents: { label: 'AI Agents', lane: 'agents' },
};

/** A known destination class -> its display label. Unknown classes fall back to a title-cased tag. */
const DEST_LABEL: Readonly<Record<string, string>> = {
  network: 'Network',
  saas: 'SaaS Apps',
  'private-apps': 'Private Apps',
  servers: 'Servers',
  'data-stores': 'Data Stores',
};

/** The risk level -> its human label + the semantic band class the zone is colored by. */
const RISK_META: Readonly<Record<RiskLevel, { label: string; band: string }>> = {
  green: { label: 'Nominal', band: 'good' },
  yellow: { label: 'Elevated', band: 'caution' },
  red: { label: 'Critical', band: 'critical' },
};

/** Title-case an unknown class tag (`private-apps` -> `Private Apps`) for an honest, readable label. */
function titleCase(tag: string): string {
  return tag
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sourceLabel(node: OverviewClassNode): string {
  return SOURCE_META[node.class]?.label ?? titleCase(node.class);
}

function sourceLane(className: string): string {
  return SOURCE_META[className]?.lane ?? 'muted';
}

function destLabel(node: OverviewClassNode): string {
  return DEST_LABEL[node.class] ?? titleCase(node.class);
}

/** The vertical centers for `n` evenly-distributed nodes between `top` and `bottom` (single node centered). */
function columnCenters(n: number, top: number, bottom: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [(top + bottom) / 2];
  const step = (bottom - top) / (n - 1);
  return Array.from({ length: n }, (_, i) => top + i * step);
}

/** Whether the graph is present but carries no observed connectivity (the honest empty state). */
function isEmptyGraph(graph: OverviewGraph): boolean {
  return graph.sources.length === 0 && graph.destinations.length === 0 && graph.edges.length === 0;
}

/** Build the accessible description so the flow is never conveyed by color alone (WCAG 1.1.1 / 1.4.1). */
function describe(graph: OverviewGraph): string {
  const risk = RISK_META[graph.risk.level].label;
  if (isEmptyGraph(graph)) {
    return `Connectivity flow: no connectivity observed. Public zone risk: ${risk}.`;
  }
  const list = (
    nodes: readonly OverviewClassNode[],
    label: (n: OverviewClassNode) => string,
  ): string => (nodes.length > 0 ? nodes.map((n) => `${label(n)} ${n.count}`).join(', ') : 'none');
  const sources = list(graph.sources, sourceLabel);
  const dests = list(graph.destinations, destLabel);
  return (
    `Connectivity flow. Sources: ${sources}. ` +
    `Public zone risk: ${risk} (${graph.risk.escalate} escalate, ${graph.risk.candidate} candidate). ` +
    `Destinations: ${dests}.`
  );
}

/** One class node: a rounded rect with its class label above the connection count. */
function ClassNode(props: {
  x: number;
  y: number;
  label: string;
  count: number;
  laneClass: string;
}): ReactElement {
  const { x, y, label, count, laneClass } = props;
  return (
    <g className={`fc-overview-flow__node ${laneClass}`} aria-hidden="true">
      <rect x={x - NODE_W / 2} y={y - NODE_H / 2} width={NODE_W} height={NODE_H} rx={8} />
      <text className="fc-overview-flow__node-label" x={x} y={y - 3} textAnchor="middle">
        {label}
      </text>
      <text className="fc-overview-flow__node-count" x={x} y={y + 12} textAnchor="middle">
        {count}
      </text>
    </g>
  );
}

/** The central "Public" zone: a tall rounded band colored by the risk band, labelled with the risk level. */
function PublicZone({ level }: { level: RiskLevel }): ReactElement {
  const meta = RISK_META[level];
  const top = PAD + NODE_H / 2;
  const height = VIEW_H - 2 * top;
  return (
    <g className={`fc-overview-flow__zone fc-overview-flow__zone--${meta.band}`} aria-hidden="true">
      <rect x={MID_X - ZONE_W / 2} y={top} width={ZONE_W} height={height} rx={12} />
      <text
        className="fc-overview-flow__zone-label"
        x={MID_X}
        y={VIEW_H / 2 - 6}
        textAnchor="middle"
      >
        Public
      </text>
      <text
        className="fc-overview-flow__zone-risk"
        x={MID_X}
        y={VIEW_H / 2 + 14}
        textAnchor="middle"
      >
        {meta.label}
      </text>
    </g>
  );
}

/** The faint honeycomb ambient field behind the flow (low-contrast, never competes with the data). */
function HoneycombField(): ReactElement {
  // A single hexagon tile, repeated as an SVG pattern; the stroke is the hairline-border token at low
  // opacity so it reads as a texture, not a grid.
  return (
    <>
      <defs>
        <pattern id="fc-overview-hex" width={28} height={24} patternUnits="userSpaceOnUse">
          <path
            className="fc-overview-flow__hex"
            d="M7 1 L21 1 L28 12 L21 23 L7 23 L0 12 Z"
            fill="none"
          />
        </pattern>
      </defs>
      <rect
        className="fc-overview-flow__field"
        x={0}
        y={0}
        width={VIEW_W}
        height={VIEW_H}
        fill="url(#fc-overview-hex)"
      />
    </>
  );
}

export function OverviewFlow({ graph, loading, width, height }: OverviewFlowProps): ReactElement {
  const sized = width !== undefined && height !== undefined ? { width, height } : {};
  const svgProps = {
    viewBox: `0 0 ${VIEW_W} ${VIEW_H}`,
    preserveAspectRatio: 'xMidYMid meet' as const,
    ...sized,
  };

  // Loading (or not-yet-loaded): an honest skeleton, never a fabricated flow.
  if (loading || graph === null) {
    return (
      <div
        className="fc-overview-flow fc-overview-flow--loading"
        role="img"
        aria-label="Loading connectivity flow"
        aria-busy="true"
      >
        <svg {...svgProps} aria-hidden="true">
          <HoneycombField />
          <rect
            className="fc-overview-flow__skeleton"
            x={PAD}
            y={PAD}
            width={NODE_W}
            height={NODE_H}
            rx={8}
          />
          <rect
            className="fc-overview-flow__skeleton"
            x={MID_X - ZONE_W / 2}
            y={PAD + NODE_H / 2}
            width={ZONE_W}
            height={VIEW_H - 2 * (PAD + NODE_H / 2)}
            rx={12}
          />
          <rect
            className="fc-overview-flow__skeleton"
            x={RIGHT_X - NODE_W / 2}
            y={PAD}
            width={NODE_W}
            height={NODE_H}
            rx={8}
          />
        </svg>
      </div>
    );
  }

  const accessibleName = describe(graph);

  // Empty tenant: no observed connectivity. The zone still shows its (green) risk; no nodes are fabricated.
  if (isEmptyGraph(graph)) {
    return (
      <div
        className="fc-overview-flow fc-overview-flow--empty"
        role="img"
        aria-label={accessibleName}
      >
        <svg {...svgProps} aria-hidden="true">
          <HoneycombField />
          <PublicZone level={graph.risk.level} />
          <text
            className="fc-overview-flow__empty-note"
            x={MID_X}
            y={VIEW_H - PAD}
            textAnchor="middle"
          >
            No connectivity observed
          </text>
        </svg>
      </div>
    );
  }

  const top = PAD + NODE_H / 2;
  const bottom = VIEW_H - PAD - NODE_H / 2;
  const sourceCenters = columnCenters(graph.sources.length, top, bottom);
  const destCenters = columnCenters(graph.destinations.length, top, bottom);
  const sourceY = new Map(
    graph.sources.map((node, i) => [node.class, sourceCenters[i] ?? VIEW_H / 2]),
  );
  const destY = new Map(
    graph.destinations.map((node, i) => [node.class, destCenters[i] ?? VIEW_H / 2]),
  );
  const maxWeight = Math.max(1, ...graph.edges.map((e) => e.weight));
  const strokeFor = (edge: OverviewEdge): number =>
    EDGE_MIN + (EDGE_MAX - EDGE_MIN) * (edge.weight / maxWeight);

  return (
    <div className="fc-overview-flow" role="img" aria-label={accessibleName}>
      <svg {...svgProps} aria-hidden="true">
        <HoneycombField />
        <g className="fc-overview-flow__edges">
          {graph.edges.map((edge, i) => {
            const sy = sourceY.get(edge.sourceClass);
            const dy = destY.get(edge.destClass);
            if (sy === undefined || dy === undefined) return null;
            const sx = LEFT_X + NODE_W / 2;
            const dx = RIGHT_X - NODE_W / 2;
            const d = `M ${sx} ${sy} C ${MID_X} ${sy}, ${MID_X} ${dy}, ${dx} ${dy}`;
            return (
              <path
                key={`${edge.sourceClass}-${edge.destClass}-${i}`}
                className={`fc-overview-flow__edge fc-overview-flow__edge--${sourceLane(edge.sourceClass)}`}
                d={d}
                fill="none"
                strokeWidth={strokeFor(edge)}
              />
            );
          })}
        </g>
        <PublicZone level={graph.risk.level} />
        {graph.sources.map((node) => (
          <ClassNode
            key={node.class}
            x={LEFT_X}
            y={sourceY.get(node.class) ?? VIEW_H / 2}
            label={sourceLabel(node)}
            count={node.count}
            laneClass={`fc-overview-flow__node--${sourceLane(node.class)}`}
          />
        ))}
        {graph.destinations.map((node) => (
          <ClassNode
            key={node.class}
            x={RIGHT_X}
            y={destY.get(node.class) ?? VIEW_H / 2}
            label={destLabel(node)}
            count={node.count}
            laneClass="fc-overview-flow__node--objects"
          />
        ))}
      </svg>
    </div>
  );
}
