// apps/console/src/surfaces/SocLineageGraph.tsx -- the incident lineage graph (IP-CONSOLE-03 S3.5).
//
// Three lanes -- ATTACK PATH (what happened) / EVIDENCE (what proves it) / FORGE DECISION + RESPONSE
// (what the engine concluded and what is proposed) -- laid out left to right by causal depth, with
// every edge drawn in the state the engine derived for it.
//
// NO GRAPH LIBRARY. `DEPENDENCY-POLICY.md`: do not add a dependency for what fits in ~30 lines. The
// prototype uses React Flow + ELK; this graph is a bounded DAG (crdb caps it at 64 nodes,
// `MAX_LINEAGE_NODES`) in three fixed lanes, so depth is one BFS and position is arithmetic over
// constants this file owns. Two runtime dependencies and their trees would buy auto-layout for a
// graph whose layout is already decided by its lanes -- and a measurement-based layout would also be
// untestable in jsdom, where every element reports zero size.
//
// HONESTY RULES:
//   * EDGE STATE IS NEVER UPGRADED (INV-SOC-EDGE-STATE-HONEST). Each of the four renders distinctly
//     and carries a text label, because color alone is not a contract an analyst can rely on. Nothing
//     is ever `verified` on this deployment (enforcement is OFF), and the legend still explains that
//     state rather than hiding it -- an operator should know what the graph WOULD show.
//   * THIS IS NOT THE PROTOTYPE'S SIX-COLUMN CHAIN. The engine derives a subject, the legs it was
//     seen touching, a decision, and a proposed response. An ORIGIN -> EXECUTION -> ACCESS ->
//     CONTROL BYPASS -> TARGET chain would draw stages the record cannot support, and every one of
//     them would look exactly as certain as the real ones.
//   * NODE SELECTION RE-SCOPES WITHOUT A SECOND FETCH (INV-SOC-ONE-PAYLOAD). The detail read already
//     returned nodes, edges, evidence and plan together; scoping is a filter over data in hand, so
//     no panel can show an operator a different moment in time than its neighbor.

import { useMemo, type ReactElement } from 'react';
import type { EdgeState, LineageEdge, LineageLane, LineageNode } from '@forge/contracts';

/** The three lanes, top to bottom, with the operator-facing band titles. */
const LANES: ReadonlyArray<{ readonly id: LineageLane; readonly title: string }> = [
  { id: 'attack_path', title: 'Attack path' },
  { id: 'evidence', title: 'Evidence' },
  { id: 'decision', title: 'Forge decision + response' },
];

/**
 * How much of the graph is shown. `material` is the default: the decision spine an analyst acts on.
 *
 * Progressive disclosure over ONE payload -- every level is a filter, never another read.
 */
export const DISCLOSURE_LEVELS = ['material', 'evidence', 'full'] as const;
export type DisclosureLevel = (typeof DISCLOSURE_LEVELS)[number];

export function disclosureLabel(level: DisclosureLevel): string {
  switch (level) {
    case 'material':
      return 'Material path';
    case 'evidence':
      return 'Show evidence';
    case 'full':
      return 'Full story';
  }
}

/** The operator-facing name of an edge state, so meaning never rides on color alone. */
export function edgeStateLabel(state: EdgeState): string {
  switch (state) {
    case 'observed':
      return 'Observed';
    case 'inferred':
      return 'Inferred';
    case 'verified':
      return 'Verified';
    case 'pending':
      return 'Pending';
  }
}

/** What each edge state MEANS, for the legend. The distinction is the point of drawing four styles. */
export function edgeStateMeaning(state: EdgeState): string {
  switch (state) {
    case 'observed':
      return 'A cited telemetry leg backs this link directly.';
    case 'inferred':
      return 'The correlator produced this link with no direct leg behind it.';
    case 'verified':
      return 'An action was carried out and its effect is recorded. Unreachable while enforcement is off.';
    case 'pending':
      return 'A step is waiting on a human.';
  }
}

// -- layout geometry (owned here, so positions are arithmetic and need no DOM measurement) ----------

const CELL_W = 220;
const CELL_H = 104;
const GAP_X = 48;
const GAP_Y = 40;
const PAD = 16;
/** Left gutter the lane labels occupy, so a label never sits under a node. */
const LANE_W = 132;

function cellX(column: number): number {
  return LANE_W + PAD + column * (CELL_W + GAP_X);
}
function cellY(row: number): number {
  return PAD + row * (CELL_H + GAP_Y);
}

/**
 * Causal depth per node: one BFS from every node with no incoming edge.
 *
 * A node the walk never reaches keeps depth 0 rather than being dropped -- an orphan is a real thing
 * the engine returned, and hiding it would make the graph look tidier than the record is.
 */
function depths(nodes: readonly LineageNode[], edges: readonly LineageEdge[]): Map<string, number> {
  const out = new Map<string, number>();
  const incoming = new Set(edges.map((e) => e.to));
  const queue: string[] = [];
  for (const node of nodes) {
    if (!incoming.has(node.id)) {
      out.set(node.id, 0);
      queue.push(node.id);
    }
  }
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  // Bounded by the node count (crdb caps the graph at 64), so this cannot run away on a cycle.
  let guard = nodes.length * nodes.length + 1;
  while (queue.length > 0 && guard > 0) {
    guard -= 1;
    const id = queue.shift() as string;
    const depth = out.get(id) ?? 0;
    for (const next of outgoing.get(id) ?? []) {
      const known = out.get(next);
      if (known === undefined || known < depth + 1) {
        out.set(next, depth + 1);
        queue.push(next);
      }
    }
  }
  for (const node of nodes) {
    if (!out.has(node.id)) out.set(node.id, 0);
  }
  return out;
}

/**
 * Which node ids are visible at a disclosure level. Every level is a FILTER over ONE payload -- no
 * level triggers a read, so the three views can never describe different moments in time.
 *
 * The levels add genuinely different things rather than three sizes of the same thing:
 *   * `material` -- the decision SPINE: the subject, the decision, and the proposed response. What
 *     an analyst acts on.
 *   * `evidence` -- adds everything the incident is CONNECTED to: the legs the subject was seen
 *     touching and their evidence-lane mirrors. What proves it.
 *   * `full` -- adds anything the engine returned that is not connected to the rest. An orphan node
 *     is a real thing the record carries, and only this level admits it exists.
 */
export function visibleNodeIds(
  nodes: readonly LineageNode[],
  edges: readonly LineageEdge[],
  level: DisclosureLevel,
): ReadonlySet<string> {
  if (level === 'full') {
    return new Set(nodes.map((n) => n.id));
  }
  if (level === 'material') {
    return new Set(
      nodes.filter((n) => n.kind === 'subject' || n.lane === 'decision').map((n) => n.id),
    );
  }
  // `evidence`: everything joined to the graph, orphans excluded.
  const linked = new Set<string>();
  for (const edge of edges) {
    linked.add(edge.from);
    linked.add(edge.to);
  }
  return new Set(nodes.filter((n) => linked.has(n.id)).map((n) => n.id));
}

interface Placed {
  readonly node: LineageNode;
  readonly x: number;
  readonly y: number;
}

export interface SocLineageGraphProps {
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
  readonly level: DisclosureLevel;
  /** The node the surface has scoped to, or null for the whole incident. */
  readonly scopedNode: string | null;
  readonly onScopeNode: (nodeId: string | null) => void;
}

export function SocLineageGraph({
  nodes,
  edges,
  level,
  scopedNode,
  onScopeNode,
}: SocLineageGraphProps): ReactElement {
  const visible = useMemo(() => visibleNodeIds(nodes, edges, level), [nodes, edges, level]);
  const shownNodes = useMemo(() => nodes.filter((n) => visible.has(n.id)), [nodes, visible]);
  // An edge renders only when BOTH endpoints are shown: a line into a hidden node is a claim the
  // operator cannot check.
  const shownEdges = useMemo(
    () => edges.filter((e) => visible.has(e.from) && visible.has(e.to)),
    [edges, visible],
  );

  const placed = useMemo(() => {
    const depth = depths(shownNodes, shownEdges);
    const occupied = new Map<string, number>();
    const out = new Map<string, Placed>();
    for (const node of shownNodes) {
      const row = Math.max(
        0,
        LANES.findIndex((l) => l.id === node.lane),
      );
      const column = depth.get(node.id) ?? 0;
      // Two nodes at the same lane+depth would overlap; nudge the later one along its lane.
      const key = `${String(row)}:${String(column)}`;
      const taken = occupied.get(key) ?? 0;
      occupied.set(key, taken + 1);
      out.set(node.id, { node, x: cellX(column + taken), y: cellY(row) });
    }
    return out;
  }, [shownNodes, shownEdges]);

  const width = Math.max(...[...placed.values()].map((p) => p.x + CELL_W), CELL_W + PAD) + PAD;
  const height = cellY(LANES.length - 1) + CELL_H + PAD;

  return (
    <div className="fcx-socg" data-testid="soc-lineage-graph">
      <div
        className="fcx-socg__canvas"
        style={{ width: `${String(width)}px`, height: `${String(height)}px` }}
      >
        {/* Row labels, aligned to their lanes inside the canvas so the band a node sits in is
            readable without counting rows. */}
        {LANES.map((lane, index) => (
          <span
            key={lane.id}
            className="fcx-socg__lane"
            style={{ top: `${String(cellY(index))}px` }}
          >
            {lane.title}
          </span>
        ))}
        <svg
          className="fcx-socg__edges"
          width={width}
          height={height}
          role="presentation"
          focusable="false"
        >
          {shownEdges.map((edge) => {
            const from = placed.get(edge.from);
            const to = placed.get(edge.to);
            if (!from || !to) return null;
            return (
              <line
                key={`${edge.from}->${edge.to}:${edge.state}`}
                className={`fcx-socg__edge fcx-socg__edge--${edge.state}`}
                data-state={edge.state}
                x1={from.x + CELL_W}
                y1={from.y + CELL_H / 2}
                x2={to.x}
                y2={to.y + CELL_H / 2}
              />
            );
          })}
        </svg>

        <ul className="fcx-socg__nodes">
          {shownNodes.map((node) => {
            const at = placed.get(node.id);
            if (!at) return null;
            const isScoped = node.id === scopedNode;
            return (
              <li
                key={node.id}
                className="fcx-socg__node-slot"
                style={{ left: `${String(at.x)}px`, top: `${String(at.y)}px` }}
              >
                <button
                  type="button"
                  className={isScoped ? 'fcx-socg__node fcx-socg__node--scoped' : 'fcx-socg__node'}
                  aria-pressed={isScoped}
                  onClick={() => {
                    // Toggles: clicking the scoped node returns to the whole incident. No fetch --
                    // scope is a filter over the payload already in hand.
                    onScopeNode(isScoped ? null : node.id);
                  }}
                >
                  <span className="fcx-socg__kind">{node.kind}</span>
                  <span className="fcx-socg__label">{node.label}</span>
                  {node.sublabel === '' ? null : (
                    <span className="fcx-socg__sublabel">{node.sublabel}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <dl className="fcx-socg__legend" aria-label="Edge states">
        {(['observed', 'inferred', 'verified', 'pending'] as const).map((state) => (
          <div key={state} className="fcx-socg__legend-item">
            <dt>
              <span className={`fcx-socg__swatch fcx-socg__swatch--${state}`} aria-hidden="true" />
              {edgeStateLabel(state)}
            </dt>
            <dd>{edgeStateMeaning(state)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
