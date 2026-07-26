// apps/console/src/test/soc-verdict.test.tsx -- IP-CONSOLE-03 S3.6 tests for the verdict panel.
//
// The property this panel exists to hold: an operator can always tell WHO said a thing and whether
// anyone stands behind it.
//   * The three narrative states stay distinct -- absent, refused, published.
//   * Generated prose is always labelled and always linked to its artifact.
//   * No model-consensus percentage, because the platform has one detection gate, not a panel.
//   * Contradictions says it is technique-scoped, so a technique-wide count is never read as this
//     incident's own.
//   * Business impact and an unproposed response render as explicit absences naming what they wait
//     on, never as zeros.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type { SocIncidentDetail, SocKpis, VerdictNarrative } from '@forge/contracts';

import { SocVerdictPanel } from '../surfaces/SocVerdictPanel.js';
import { renderWithProviders } from './render.js';

const DETAIL: SocIncidentDetail = {
  row: {
    incidentId: 'ep-soc-1',
    ruleId: 'LR-C2-001',
    anchor: 'T1071',
    subject: 'codex-helper',
    finding: 'Repeated outbound contact to a rare destination',
    authority: 'review_required',
    posture: 'candidate',
    confidence: 'HIGH',
    openedAt: 1,
    lastSeen: 2,
    evidenceCount: 2,
  },
  nodes: [],
  edges: [],
  evidence: [{ leg: 'leg:net:198.51.100.7' }, { leg: 'leg:proc:codex-helper' }],
  plan: [],
  planRevision: 0,
  planApproved: false,
  narrativeRef: null,
};

const KPIS: SocKpis = {
  eventsAnalyzed: 1,
  noiseCollapsed: 0,
  totalFirings: 9,
  materialIncidents: 1,
  autoContained: 0,
  decisionWaiting: 1,
  detectionEnabled: true,
  suppressingInputs: [
    { anchor: 'T1071', falsePositiveFeedback: 4, ratifiedBaseline: 1, firings: 9 },
  ],
};

const NARRATIVE: VerdictNarrative = {
  found: false,
  published: false,
  refusal: null,
  headline: '',
  narrative: [],
  impact: [],
  response: [],
  citedEvidence: [],
  withheld: [],
  needsHumanReview: false,
  modelRef: '',
  inputHash: '',
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

describe('the FORGE VERDICT panel (S3.6)', () => {
  it('renders "nobody has looked" distinctly from a refusal', async () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    await waitFor(() => {
      expect(screen.getByText(/No write-up has been generated/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Nobody has looked/i)).toBeInTheDocument();
    expect(screen.queryByText(/would not stand behind/i)).not.toBeInTheDocument();
  });

  it('renders the engine refusal with its reason, never blank space', async () => {
    // The most important state on this panel: the pipeline looked and declined to publish. An empty
    // panel here would read as "nothing to say", which is the opposite of what happened.
    mockNarrative({
      ...NARRATIVE,
      found: true,
      published: false,
      refusal: 'the grounding set did not support the headline',
    });

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    await waitFor(() => {
      expect(screen.getByText(/would not stand behind/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/did not support the headline/i)).toBeInTheDocument();
    // The structured findings are unaffected by a model refusal and must still be there.
    expect(screen.getByLabelText('Authority')).toHaveTextContent('Review required');
  });

  it('labels published prose as generated and links its artifact', async () => {
    mockNarrative({
      ...NARRATIVE,
      found: true,
      published: true,
      headline: 'Sustained C2 beaconing from codex-helper',
      narrative: ['The agent contacted a rare destination on a regular cadence.'],
      modelRef: 'gemma4',
      inputHash: 'sha512:abc',
    });

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    await waitFor(() => {
      expect(screen.getByText('Sustained C2 beaconing from codex-helper')).toBeInTheDocument();
    });
    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByText(/gemma4/)).toHaveTextContent('sha512:abc');
  });

  it('shows the withheld claims with their ruling and reason', async () => {
    // What the model was given and what was thrown away -- so an analyst can check the rejection
    // rather than take the pipeline's word for it.
    mockNarrative({
      ...NARRATIVE,
      found: true,
      published: true,
      headline: 'h',
      withheld: [
        {
          section: 'impact',
          text: 'The attacker exfiltrated the customer database.',
          ruling: 'unsupported',
          explanation: 'no evidence leg shows a bulk transfer',
          cited: [],
        },
      ],
    });

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    await waitFor(() => {
      expect(screen.getByText(/exfiltrated the customer database/)).toBeInTheDocument();
    });
    expect(screen.getByText('unsupported')).toBeInTheDocument();
    expect(screen.getByText(/no evidence leg shows a bulk transfer/)).toBeInTheDocument();
  });

  it('reports the confidence the engine computed, never a model-consensus percentage', async () => {
    // The prototype's "5/5 models agree, 94.1%" describes a panel this platform does not have.
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    const card = await screen.findByLabelText('Consensus');
    expect(card).toHaveTextContent('High');
    expect(card).toHaveTextContent('One detection gate');
    expect(card).toHaveTextContent('corroborated by 2 cited legs');
    expect(card.textContent).not.toMatch(/%/);
    expect(card.textContent).not.toMatch(/models agree/i);
  });

  it('says the contradictions count is technique-scoped, not this incident alone', async () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    const card = await screen.findByLabelText('Contradictions');
    expect(card).toHaveTextContent('5');
    expect(card).toHaveTextContent('4 by false-positive feedback');
    expect(card).toHaveTextContent('1 by ratified baseline');
    expect(card).toHaveTextContent(/for T1071 across the window, not this incident alone/);
  });

  it('distinguishes an unread summary from a window that suppressed nothing', async () => {
    // Unknown is not zero. The first cannot be reported as the second.
    mockNarrative(NARRATIVE);

    const { rerender } = renderWithProviders(
      <SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={undefined} />,
    );
    expect(await screen.findByLabelText('Contradictions')).toHaveTextContent('Unavailable');

    rerender(
      <SocVerdictPanel
        incidentId="ep-soc-1"
        detail={DETAIL}
        kpis={{ ...KPIS, suppressingInputs: [] }}
      />,
    );
    const card = screen.getByLabelText('Contradictions');
    expect(card).toHaveTextContent('0');
    expect(card).toHaveTextContent(/Nothing suppressed T1071 in this window/);
  });

  it('renders business impact as an explicit absence naming what it waits on', async () => {
    // A plausible dollar figure on a security surface is worse than a missing one: an analyst acts
    // on it.
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    const impact = await screen.findByTestId('soc-business-impact');
    expect(impact).toHaveTextContent(/Not available/);
    expect(impact).toHaveTextContent(/asset-value plane/);
    expect(impact.textContent).not.toMatch(/\$|0\b/);
  });

  it('explains an empty response plan rather than showing an empty list', async () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    const empty = await screen.findByTestId('soc-response-empty');
    expect(empty).toHaveTextContent(/nothing proposes one yet/i);
    expect(screen.getByRole('button', { name: 'Approve full response' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modify plan' })).toBeDisabled();
  });

  it('states that nothing has been enforced, with the reason', async () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(<SocVerdictPanel incidentId="ep-soc-1" detail={DETAIL} kpis={KPIS} />);

    await waitFor(() => {
      expect(screen.getByText(/Enforcement is off on this deployment/i)).toBeInTheDocument();
    });
  });

  it('shows a refused step with its reason when a plan exists', async () => {
    mockNarrative(NARRATIVE);

    renderWithProviders(
      <SocVerdictPanel
        incidentId="ep-soc-1"
        detail={{
          ...DETAIL,
          plan: [
            {
              ordinal: 0,
              title: 'Quarantine codex-helper',
              action: 'quarantine',
              authority: 'approval_required',
              state: 'refused',
              explanation: 'enforcement is off on this deployment',
            },
          ],
        }}
        kpis={KPIS}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Quarantine codex-helper')).toBeInTheDocument();
    });
    expect(screen.getByText('refused')).toBeInTheDocument();
    expect(screen.queryByTestId('soc-response-empty')).not.toBeInTheDocument();
  });
});
