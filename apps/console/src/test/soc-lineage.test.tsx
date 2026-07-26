// apps/console/src/test/soc-lineage.test.tsx -- IP-CONSOLE-03 S3.5 tests for the lineage graph.
//
// The properties that make this graph trustworthy rather than decorative:
//   * The four edge states render DISTINCTLY and are named in text (color alone is not a contract).
//   * No state is ever upgraded, and `verified` never appears on this deployment -- but the legend
//     still explains it, so an operator knows what the graph would show if it did.
//   * Progressive disclosure is a FILTER over one payload: no level refetches, and neither does
//     scoping to a node (INV-SOC-ONE-PAYLOAD).
//   * The lineage is what the engine derived, not the prototype's six-column chain.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { LineageEdge, LineageNode } from '@forge/contracts';

import {
  SocLineageGraph,
  edgeStateLabel,
  edgeStateMeaning,
  visibleNodeIds,
} from '../surfaces/SocLineageGraph.js';
import { SocOpsSurface } from '../surfaces/SocOpsSurface.js';
import { renderWithProviders } from './render.js';

const NODES: readonly LineageNode[] = [
  { id: 'subject', lane: 'attack_path', kind: 'subject', label: 'codex-helper', sublabel: 'T1071' },
  {
    id: 'leg-0',
    lane: 'attack_path',
    kind: 'network',
    label: 'leg:net:198.51.100.7',
    sublabel: '',
  },
  {
    id: 'ev-0',
    lane: 'evidence',
    kind: 'evidence',
    label: 'leg:net:198.51.100.7',
    sublabel: 'LR-C2-001',
  },
  {
    id: 'decision',
    lane: 'decision',
    kind: 'decision',
    label: 'Repeated outbound contact',
    sublabel: 'Candidate',
  },
  {
    id: 'step-0',
    lane: 'decision',
    kind: 'response',
    label: 'Quarantine codex-helper',
    sublabel: 'enforcement is off',
  },
];

const EDGES: readonly LineageEdge[] = [
  { from: 'subject', to: 'leg-0', state: 'observed' },
  { from: 'leg-0', to: 'ev-0', state: 'observed' },
  { from: 'subject', to: 'decision', state: 'inferred' },
  { from: 'decision', to: 'step-0', state: 'pending' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the SOC lineage graph (S3.5)', () => {
  it('renders each edge in the state the engine derived, never upgraded', () => {
    renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="full"
        scopedNode={null}
        onScopeNode={() => undefined}
      />,
    );

    const graph = screen.getByTestId('soc-lineage-graph');
    const states = [...graph.querySelectorAll('line')].map((l) => l.getAttribute('data-state'));
    expect(states).toEqual(['observed', 'observed', 'inferred', 'pending']);
    // The approved-but-refused containment step is PENDING, and nothing anywhere is verified.
    expect(states).not.toContain('verified');
  });

  it('names every edge state in text, including the one that cannot occur here', () => {
    // Color alone is not a distinction an analyst can rely on, and an operator should know what
    // `verified` would mean even though enforcement being off makes it unreachable.
    renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="full"
        scopedNode={null}
        onScopeNode={() => undefined}
      />,
    );

    const legend = screen.getByLabelText('Edge states');
    for (const state of ['observed', 'inferred', 'verified', 'pending'] as const) {
      expect(within(legend).getByText(edgeStateLabel(state))).toBeInTheDocument();
    }
    expect(within(legend).getByText(edgeStateMeaning('verified'))).toHaveTextContent(
      /enforcement is off/i,
    );
  });

  it('gives the four states visually distinct strokes, not just four colors', () => {
    renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={[
          { from: 'subject', to: 'leg-0', state: 'observed' },
          { from: 'subject', to: 'decision', state: 'inferred' },
          { from: 'decision', to: 'step-0', state: 'pending' },
        ]}
        level="full"
        scopedNode={null}
        onScopeNode={() => undefined}
      />,
    );

    const classes = [...screen.getByTestId('soc-lineage-graph').querySelectorAll('line')].map(
      (l) => l.getAttribute('class') ?? '',
    );
    expect(new Set(classes).size).toBe(3);
  });

  it('discloses progressively: spine, then proof, then everything', () => {
    // Three genuinely different views, all filters over ONE payload.
    const material = visibleNodeIds(NODES, EDGES, 'material');
    expect([...material].sort()).toEqual(['decision', 'step-0', 'subject']);

    const evidence = visibleNodeIds(NODES, EDGES, 'evidence');
    expect(evidence.has('leg-0')).toBe(true);
    expect(evidence.has('ev-0')).toBe(true);

    // An orphan the engine returned appears only in the full story.
    const withOrphan: readonly LineageNode[] = [
      ...NODES,
      { id: 'orphan', lane: 'attack_path', kind: 'process', label: 'unlinked', sublabel: '' },
    ];
    expect(visibleNodeIds(withOrphan, EDGES, 'evidence').has('orphan')).toBe(false);
    expect(visibleNodeIds(withOrphan, EDGES, 'full').has('orphan')).toBe(true);
  });

  it('draws no edge into a node it is not showing', () => {
    // A line to a hidden node is a claim the operator cannot check.
    renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="material"
        scopedNode={null}
        onScopeNode={() => undefined}
      />,
    );

    const states = [...screen.getByTestId('soc-lineage-graph').querySelectorAll('line')].map((l) =>
      l.getAttribute('data-state'),
    );
    // Only subject->decision and decision->step-0 have both endpoints in the material path.
    expect(states).toEqual(['inferred', 'pending']);
  });

  it('does not draw the prototype six-column chain', () => {
    // The engine derives a subject, its legs, a decision and a response. Stages it never recorded
    // would render exactly as certain as the ones it did.
    renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="full"
        scopedNode={null}
        onScopeNode={() => undefined}
      />,
    );

    for (const invented of ['ORIGIN', 'EXECUTION', 'CONTROL BYPASS', 'TARGET']) {
      expect(screen.queryByText(invented)).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole('button')).toHaveLength(NODES.length);
  });

  it('toggles the node scope rather than latching it', () => {
    const scopes: Array<string | null> = [];
    const { rerender } = renderWithProviders(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="full"
        scopedNode={null}
        onScopeNode={(id) => scopes.push(id)}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^subject/ }));
    expect(scopes).toEqual(['subject']);

    rerender(
      <SocLineageGraph
        nodes={NODES}
        edges={EDGES}
        level="full"
        scopedNode="subject"
        onScopeNode={(id) => scopes.push(id)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^subject/ }));
    expect(scopes).toEqual(['subject', null]);
  });
});

describe('the lineage graph inside the surface (S3.5)', () => {
  function mockSurface(): ReturnType<typeof vi.fn> {
    const spy = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            url.includes('/kpis')
              ? {
                  eventsAnalyzed: 1,
                  noiseCollapsed: 0,
                  totalFirings: 0,
                  materialIncidents: 1,
                  autoContained: 0,
                  decisionWaiting: 1,
                  detectionEnabled: true,
                }
              : url.includes('/incident?')
                ? {
                    row: {
                      incidentId: 'ep-soc-1',
                      ruleId: 'LR-C2-001',
                      anchor: 'T1071',
                      subject: 'codex-helper',
                      finding: 'Repeated outbound contact',
                      authority: 'review_required',
                      posture: 'candidate',
                      confidence: 'HIGH',
                      openedAt: 1,
                      lastSeen: 2,
                      evidenceCount: 1,
                    },
                    nodes: NODES,
                    edges: EDGES,
                    evidence: [{ leg: 'leg:net:198.51.100.7' }],
                    plan: [],
                    planRevision: 0,
                    planApproved: false,
                    narrativeRef: null,
                  }
                : [
                    {
                      incidentId: 'ep-soc-1',
                      ruleId: 'LR-C2-001',
                      anchor: 'T1071',
                      subject: 'codex-helper',
                      finding: 'Repeated outbound contact',
                      authority: 'review_required',
                      posture: 'candidate',
                      confidence: 'HIGH',
                      openedAt: 1,
                      lastSeen: 2,
                      evidenceCount: 1,
                    },
                  ],
          ),
      } as Response),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('re-scopes to a node WITHOUT a second fetch', async () => {
    // INV-SOC-ONE-PAYLOAD. The detail read already returned nodes, edges, evidence and plan
    // together; scoping filters what is in hand. A refetch here is how two panels start showing an
    // operator different moments in time.
    const spy = mockSurface();
    renderWithProviders(<SocOpsSurface />);

    fireEvent.click(await screen.findByRole('button', { name: /ep-soc-1/ }));
    await screen.findByTestId('soc-lineage-graph');
    const afterLoad = spy.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: /^decision/ }));

    await waitFor(() => {
      expect(screen.getByTestId('soc-scope')).toHaveTextContent(/Scoped to decision/);
    });
    expect(spy.mock.calls.length).toBe(afterLoad);
  });

  it('changes the disclosure level WITHOUT a second fetch, and defaults to the material path', async () => {
    const spy = mockSurface();
    renderWithProviders(<SocOpsSurface />);

    fireEvent.click(await screen.findByRole('button', { name: /ep-soc-1/ }));
    await screen.findByTestId('soc-lineage-graph');
    const afterLoad = spy.mock.calls.length;

    // Default is the material path: the evidence-lane mirror is folded away.
    expect(screen.queryByRole('button', { name: /LR-C2-001/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show evidence' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /LR-C2-001/ })).toBeInTheDocument();
    });
    expect(spy.mock.calls.length).toBe(afterLoad);
  });

  it('drops a node scope when the operator picks a different incident', async () => {
    // A scope belongs to the incident it was taken in; carrying it would point the verdict and dock
    // at a node the new incident does not contain.
    mockSurface();
    renderWithProviders(<SocOpsSurface />);

    fireEvent.click(await screen.findByRole('button', { name: /ep-soc-1/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^decision/ }));
    await waitFor(() => {
      expect(screen.getByTestId('soc-scope')).toHaveTextContent(/Scoped to/);
    });

    fireEvent.click(screen.getByRole('button', { name: /ep-soc-1/ }));

    await waitFor(() => {
      expect(screen.getByTestId('soc-scope')).toHaveTextContent(/Whole incident/);
    });
  });
});
