// packages/design/test/entity-drawer.test.tsx -- IP-CONSOLE-12 DR.2 render tests for the drawer body.
//
// Proves INV-CONSOLE-DRAWER-SHELL on fixtures (no engine): the body renders every section from the DR.1
// view model, a loading state shows skeletons (never fabricated rows), a pending binding shows an honest
// note, a per-section error degrades THAT section with an alert, a not-applicable / unauthorized section
// is ABSENT (not a disabled placeholder), and the quick-action bar renders only the actions it is handed.

import { principalId, vtzId, policyId, decisionId } from '@forge/contracts';
import type { EntityDetailView } from '@forge/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EntityDrawer, Sparkline } from '../src/index.js';

/** A fully-resolved principal detail; individual tests override sections to exercise other states. */
function fixture(overrides: Partial<EntityDetailView> = {}): EntityDetailView {
  return {
    ref: { kind: 'principal', id: principalId('agent:inventory-bot') },
    header: {
      status: 'ok',
      data: {
        displayName: 'Inventory-Bot',
        kindLabel: 'Agent',
        status: 'active',
      },
    },
    info: {
      status: 'ok',
      data: {
        trustState: 'trusted',
        riskScore: 12,
        region: 'us-east',
        lastSeen: 1_720_600_000_000,
        tags: ['prod', 'inventory'],
      },
    },
    zones: { status: 'ok', data: { zones: [{ id: vtzId('vtz-dmz'), name: 'DMZ' }] } },
    capabilities: {
      status: 'pending',
      owningRepo: 'torch',
      gatingTask: 'IP-CONSOLE-12 DR.4',
    },
    effectivePolicies: {
      status: 'ok',
      data: {
        policies: [
          {
            id: policyId('p-no-egress'),
            name: 'no-egress',
            effect: 'deny',
            origin: { kind: 'direct' },
          },
        ],
      },
    },
    recentDecisions: {
      status: 'ok',
      data: {
        decisions: [
          {
            decisionId: decisionId('d-1'),
            ruleId: 'LR-DB-002',
            summary: 'External DB Access',
            outcome: 'Denied',
            status: 'denied',
            at: 1_720_600_000_000,
          },
        ],
      },
    },
    ...overrides,
  };
}

describe('EntityDrawer: the resolved sections', () => {
  it('titles the drawer with the identity and shows the real lifecycle status (no trust score)', () => {
    render(<EntityDrawer open onClose={vi.fn()} detail={fixture()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Inventory-Bot');
    // The header shows the engine agent status as a semantic badge, not a fabricated trust score.
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('Agent')).toBeInTheDocument();
    // No trust-score ring or trend sparkline in the drawer.
    expect(screen.queryByRole('img', { name: /trust score/ })).not.toBeInTheDocument();
  });

  it('renders the information, a connected VTZ, an effective policy, and a recent decision', () => {
    render(<EntityDrawer open onClose={vi.fn()} detail={fixture()} />);
    expect(screen.getByText('us-east')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DMZ' })).toBeInTheDocument();
    expect(screen.getByText('no-egress')).toBeInTheDocument();
    // Both a policy Deny and a decision Denied render a critical badge with their label (never color alone).
    expect(screen.getByText('deny')).toBeInTheDocument();
    expect(screen.getByText('External DB Access')).toBeInTheDocument();
    expect(screen.getByText('Denied')).toBeInTheDocument();
  });
});

describe('EntityDrawer: honest non-ok states', () => {
  it('shows section skeletons while loading, never fabricated rows', () => {
    const { container } = render(<EntityDrawer open onClose={vi.fn()} loading />);
    expect(container.querySelectorAll('.fc-skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Inventory-Bot')).not.toBeInTheDocument();
  });

  it('renders an honest pending note for a not-yet-live binding (capabilities)', () => {
    render(<EntityDrawer open onClose={vi.fn()} detail={fixture()} />);
    expect(screen.getByText(/Not yet available \(IP-CONSOLE-12 DR\.4\)/)).toBeInTheDocument();
  });

  it('degrades a failed section with an alert, not the whole drawer', () => {
    const detail = fixture({ recentDecisions: { status: 'error', message: 'engine unreachable' } });
    render(<EntityDrawer open onClose={vi.fn()} detail={detail} />);
    expect(screen.getByRole('alert')).toHaveTextContent('engine unreachable');
    // The rest of the drawer still renders.
    expect(screen.getByText('us-east')).toBeInTheDocument();
  });

  it('omits a not-applicable or unauthorized section entirely (absent, not disabled)', () => {
    const detail = fixture({
      capabilities: { status: 'not-applicable' },
      effectivePolicies: { status: 'unauthorized' },
    });
    render(<EntityDrawer open onClose={vi.fn()} detail={detail} />);
    expect(screen.queryByText('Capabilities')).not.toBeInTheDocument();
    expect(screen.queryByText('Effective policies')).not.toBeInTheDocument();
    // A section that applies but is empty is still present (this fixture keeps the others).
    expect(screen.getByText('Recent decisions')).toBeInTheDocument();
  });
});

describe('EntityDrawer: the quick-action bar', () => {
  it('renders only the actions it is handed (a PENDING/beyond-tier action is absent, not a dead button)', () => {
    render(
      <EntityDrawer open onClose={vi.fn()} detail={fixture()} actions={{ onIsolate: vi.fn() }} />,
    );
    expect(screen.getByRole('button', { name: 'Isolate from network' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Modify VTZ assignment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View remediation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open full report' })).not.toBeInTheDocument();
  });

  it('invokes the handler for a rendered action', () => {
    const onIsolate = vi.fn();
    render(<EntityDrawer open onClose={vi.fn()} detail={fixture()} actions={{ onIsolate }} />);
    screen.getByRole('button', { name: 'Isolate from network' }).click();
    expect(onIsolate).toHaveBeenCalledOnce();
  });
});

describe('Sparkline: the trend micro-chart', () => {
  it('carries the from/to values + point count in its accessible name (not color alone)', () => {
    render(
      <Sparkline
        label="Inventory-Bot trust score"
        points={[
          { at: 1, score: 60 },
          { at: 2, score: 90 },
        ]}
      />,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Inventory-Bot trust score trend: 60 to 90 over 2 points',
    );
  });

  it('reports an honest no-trend state for a single point rather than faking a line', () => {
    render(<Sparkline label="Inventory-Bot trust score" points={[{ at: 1, score: 82 }]} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Inventory-Bot trust score: no trend yet (current 82)',
    );
  });
});
