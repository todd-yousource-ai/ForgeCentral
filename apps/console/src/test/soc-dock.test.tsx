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
import type { SocIncidentDetail, VerdictNarrative } from '@forge/contracts';

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

function mockNarrative(narrative: VerdictNarrative): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(narrative),
      } as Response),
    ),
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

  it('renders Raw Telemetry as an explicit absence naming the gap', () => {
    // An analyst opens this dock precisely when they have stopped taking the surface's word for
    // something. A mock pane would be the worst stub in the product.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Raw Telemetry' }));

    expect(
      screen.getByText(/Raw telemetry is not available for one incident/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/LOG_EXPLAIN keys on a decision id/i)).toBeInTheDocument();
  });

  it('renders Audit Trail as an explicit absence, without implying acts are unaudited', () => {
    // The distinction matters: operator acts ARE audited engine-side. What is missing is a read
    // scoped to one incident, and the pane must not let an analyst conclude otherwise.
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Audit Trail' }));

    expect(screen.getByText(/no per-incident audit trail to read/i)).toBeInTheDocument();
    expect(screen.getByText(/ARE audited engine-side/i)).toBeInTheDocument();
  });

  it('costs no read when the verdict panel already fetched the narrative', async () => {
    // Both use the same query key, so TanStack serves the dock from cache. Two reads could show two
    // different narratives on one screen.
    const spy = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(NARRATIVE),
      } as Response),
    );
    vi.stubGlobal('fetch', spy);

    renderWithProviders(
      <SocInvestigationDock incidentId="ep-soc-1" detail={DETAIL} scopedNode={null} />,
    );
    await waitFor(() => {
      expect(spy.mock.calls.length).toBe(1);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Model Reasoning' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Evidence' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));

    expect(spy.mock.calls.length).toBe(1);
  });
});
