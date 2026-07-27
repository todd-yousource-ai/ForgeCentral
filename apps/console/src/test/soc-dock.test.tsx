// apps/console/src/test/soc-dock.test.tsx -- IP-CONSOLE-03 S3.7 tests for the investigation dock.
//
// The dock is where an analyst goes when they have STOPPED taking the surface's word for something,
// so a mock pane here would be the worst stub in the product. These tests hold that line:
//   * Two of the five panes have no per-incident read and say exactly what is missing and why.
//   * Model Reasoning shows both halves -- what the model was given, and what the skeptic threw out
//     with its ruling and citations.
//   * The dock respects the graph's node scope, over the same payload, and never quietly ignores it.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type {
  IncidentActRow,
  IncidentTelemetry,
  SocIncidentDetail,
  VerdictNarrative,
} from '@forge/contracts';

import { SocInvestigationDock } from '../surfaces/SocInvestigationDock.js';
import { renderWithProviders } from './render.js';

const DETAIL: SocIncidentDetail = {
  row: {
    incidentId: 'ep-soc-1',
    ruleId: 'LR-C2-001',
    anchor: 'T1071',
    subject: 'codex-helper',
    finding: 'Repeated outbound contact',
    authority: 'review_required',
    posture: 'candidate',
    confidence: 'HIGH',
    openedAt: 1_700_000_000,
    lastSeen: 1_700_003_600,
    evidenceCount: 2,
  },
  nodes: [
    {
      id: 'leg-0',
      lane: 'attack_path',
      kind: 'network',
      label: 'leg:net:198.51.100.7',
      sublabel: '',
    },
    {
      id: 'decision',
      lane: 'decision',
      kind: 'decision',
      label: 'Repeated outbound contact',
      sublabel: 'Candidate',
    },
  ],
  edges: [],
  evidence: [{ leg: 'leg:net:198.51.100.7' }, { leg: 'leg:proc:codex-helper' }],
  plan: [],
  planRevision: 0,
  planApproved: false,
  narrativeRef: null,
};

const NARRATIVE: VerdictNarrative = {
  found: true,
  published: true,
  refusal: null,
  headline: 'Sustained C2 beaconing',
  narrative: ['The agent contacted a rare destination on a regular cadence.'],
  impact: [],
  response: [],
  citedEvidence: ['leg:net:198.51.100.7'],
  withheld: [
    {
      section: 'impact',
      text: 'The attacker exfiltrated the customer database.',
      ruling: 'unsupported',
      explanation: 'no evidence leg shows a bulk transfer',
      cited: ['leg:net:198.51.100.7'],
    },
  ],
  needsHumanReview: false,
  modelRef: 'gemma4',
  inputHash: 'sha512:abc',
};

const TELEMETRY: IncidentTelemetry = {
  anchor: 'anchored',
  citedEvidence: [
    { entry: 'Network Traffic Content', kind: 'data_component' },
    { entry: 'leg:net:198.51.100.7', kind: 'leg' },
  ],
  observations: [
    {
      observationId: 'obs-1',
      outcome: 'resolved',
      observedAt: 1_700_000_000,
      category: 'network',
      fields: [['dst', '198.51.100.7']],
    },
    {
      observationId: 'obs-2',
      outcome: 'aged_out',
      observedAt: 1_690_000_000,
      category: null,
      fields: [],
    },
    {
      observationId: 'obs-3',
      outcome: 'restricted',
      observedAt: 1_700_000_100,
      category: null,
      fields: [],
    },
  ],
};

const TRAIL: readonly IncidentActRow[] = [
  {
    act: 'plan_proposed',
    principal: 'engine',
    atSeconds: 1_700_000_100,
    detail: '1 step(s), revision 0',
  },
  { act: 'plan_approved', principal: 'op-7', atSeconds: 1_700_000_200, detail: null },
];

/** Route-aware: the dock now reads telemetry and the audit trail beside the narrative. */
function mockNarrative(
  narrative: VerdictNarrative,
  telemetry: IncidentTelemetry | null = TELEMETRY,
  trail: readonly IncidentActRow[] | null = TRAIL,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      const body = url.includes('/api/soc/telemetry')
        ? telemetry
        : url.includes('/api/soc/audit')
          ? trail
          : narrative;
      if (body === null) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the SOC investigation dock (S3.7)', () => {
  it('opens on Evidence and lists the cited legs', () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );

    const legs = screen.getByTestId('soc-dock-evidence');
    expect(legs).toHaveTextContent('leg:net:198.51.100.7');
    expect(legs).toHaveTextContent('leg:proc:codex-helper');
  });

  it('narrows the evidence pane to the scoped node, over the same payload', () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode="leg-0" />,
    );

    const legs = screen.getByTestId('soc-dock-evidence');
    expect(legs).toHaveTextContent('leg:net:198.51.100.7');
    expect(legs).not.toHaveTextContent('leg:proc:codex-helper');
    expect(screen.getByTestId('soc-dock-scope')).toHaveTextContent('Scope: leg-0');
  });

  it('never quietly ignores a scope it cannot satisfy', () => {
    // Scoping to the decision node leaves no matching leg. Falling back to the full list would show
    // an analyst more than they asked for while the scope line claims otherwise.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode="decision" />,
    );

    expect(screen.getByTestId('soc-dock-evidence')).toBeEmptyDOMElement();
    expect(screen.getByText(/not one of this incident/i)).toBeInTheDocument();
  });

  it('shows both halves of the model reasoning', async () => {
    // What the model was given, and what was thrown away with its ruling and citations -- so the
    // rejection can be checked rather than taken on faith.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Model Reasoning' }));

    await waitFor(() => {
      expect(screen.getByTestId('soc-dock-reasoning')).toBeInTheDocument();
    });
    expect(screen.getByText('What the model was given')).toBeInTheDocument();
    expect(screen.getByText('What the skeptic threw away')).toBeInTheDocument();
    expect(screen.getByText(/exfiltrated the customer database/)).toBeInTheDocument();
    expect(screen.getByText('unsupported')).toBeInTheDocument();
    expect(screen.getByText(/Cited: leg:net:198.51.100.7/)).toBeInTheDocument();
  });

  it('distinguishes nothing-withheld from a refused run', async () => {
    mockNarrative({ ...NARRATIVE, withheld: [] });

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Model Reasoning' }));

    await waitFor(() => {
      expect(screen.getByText(/every claim the model made was supported/i)).toBeInTheDocument();
    });
  });

  it('says so when no model has looked, rather than showing an empty grounding set', async () => {
    mockNarrative({ ...NARRATIVE, found: false, published: false });

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Model Reasoning' }));

    await waitFor(() => {
      expect(screen.getByText(/No model has looked at this incident/i)).toBeInTheDocument();
    });
  });

  it('shows the two instants the engine records and names what it cannot show', () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));

    const timeline = screen.getByTestId('soc-dock-timeline');
    expect(timeline).toHaveTextContent('Incident opened');
    expect(timeline).toHaveTextContent('Last fired');
    // The gap between them is not interpolated into invented events.
    expect(screen.getByText(/does not expose a per-fire history/i)).toBeInTheDocument();
  });

  it('renders Raw Telemetry with unresolvable observations reported, never omitted', async () => {
    // The pane's whole value (crdb ED.2): an absence an analyst can act on. `aged_out` and
    // `restricted` arrive as rows WITH their references -- one is a retention fact about the
    // estate, the other a fact about this principal, and troubleshooting a gap needs to know which.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Telemetry' }));

    const pane = await screen.findByTestId('soc-dock-raw');
    expect(pane).toHaveTextContent('obs-1');
    expect(pane).toHaveTextContent('dst=198.51.100.7');
    expect(pane).toHaveTextContent('obs-2');
    expect(pane).toHaveTextContent(/Past retention/);
    expect(pane).toHaveTextContent('obs-3');
    expect(pane).toHaveTextContent(/clearance/);
  });

  it('renders the Audit Trail from the engine index, with each act and its principal', async () => {
    // crdb ED.3: an index into the hash-chained audit record, never assembled client-side from the
    // live stream.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Audit Trail' }));

    const pane = await screen.findByTestId('soc-dock-audit');
    expect(pane).toHaveTextContent('plan_proposed');
    expect(pane).toHaveTextContent('plan_approved');
    expect(pane).toHaveTextContent('by op-7');
  });

  it('says so when nobody has acted, rather than showing an empty trail', async () => {
    mockNarrative(NARRATIVE, TELEMETRY, []);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Audit Trail' }));

    expect(await screen.findByTestId('soc-dock-audit-empty')).toHaveTextContent(
      /No operator has acted/,
    );
  });

  it('fetches each read once; switching tabs never refetches', async () => {
    // One read per query key (narrative, telemetry, audit), served from cache after that. Two reads
    // of the same key could show two different answers on one screen.
    const spy = vi.fn((url: string) => {
      const body = url.includes('/api/soc/telemetry')
        ? TELEMETRY
        : url.includes('/api/soc/audit')
          ? TRAIL
          : NARRATIVE;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as Response);
    });
    vi.stubGlobal('fetch', spy);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    await waitFor(() => {
      expect(spy.mock.calls.length).toBe(3);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Model Reasoning' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Telemetry' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Audit Trail' }));

    expect(spy.mock.calls.length).toBe(3);
  });
});
