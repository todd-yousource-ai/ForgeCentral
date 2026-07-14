import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { decisionId, principalId } from '@forge/contracts';
import type { LogDetailView, LogPage } from '@forge/contracts';

import { DESTINATIONS } from '../ia/destinations.js';
import { Shell } from '../shell/Shell.js';
import { LiveStore } from '../live/live-store.js';
import { renderWithProviders, TEST_OPERATOR } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const logsPage: LogPage = {
  rows: [
    {
      decisionId: decisionId('sha512:d1'),
      at: 1_700_000_000_000,
      ruleId: 'LR-EX-001',
      summary: 'Suspicious command',
      outcome: 'escalate',
      status: 'denied',
      technique: 'T1059',
      tactics: ['TA0002'],
      confidence: 'HIGH',
      evidenceCount: 1,
    },
  ],
};

const logDetail: LogDetailView = {
  decisionId: decisionId('sha512:d1'),
  at: 1_700_000_000_000,
  ruleId: 'LR-EX-001',
  finding: 'Suspicious command',
  technique: 'T1059',
  tactics: ['TA0002'],
  evidence: ['dc:process_creation'],
  confidence: 'HIGH',
  outcome: 'escalate',
  scope: 'host-7',
  sourceHosts: ['host-7'],
  sourceSubjects: ['host-7:pid:1234'],
  sourceContext: [],
  sourceObservations: [],
  correlationId: 'corr-1',
  replayAsOf: 42,
  watermarkSeconds: 100,
  windowSeconds: 60,
  replayDigest: 'sha512:rd',
  actingEntity: { kind: 'principal', id: principalId('host-7:pid:1234') },
};

/** A fetch that routes the Logs read + EXPLAIN + acting-entity detail (the row -> drawer drill-in). */
function logsRoutedFetch(): ReturnType<typeof vi.fn> {
  return vi.fn((input: string) => {
    if (input.startsWith('/api/logs/explain/'))
      return Promise.resolve(jsonResponse(200, logDetail));
    if (input.startsWith('/api/logs')) return Promise.resolve(jsonResponse(200, logsPage));
    if (input.startsWith('/api/entity/')) {
      return Promise.resolve(
        jsonResponse(200, {
          ref: { kind: 'principal', id: 'host-7:pid:1234' },
          header: {
            status: 'ok',
            data: { displayName: 'host-7:pid:1234', kindLabel: 'Agent', status: 'active' },
          },
          info: { status: 'empty' },
          zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
          capabilities: { status: 'pending', owningRepo: 'torch', gatingTask: 'x' },
          effectivePolicies: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
          recentDecisions: { status: 'empty' },
        }),
      );
    }
    throw new Error(`unexpected fetch ${input}`);
  });
}

/** The home Overview surface reads the connectivity graph; an empty tenant graph keeps shell tests clean. */
const EMPTY_GRAPH = {
  sources: [],
  destinations: [],
  edges: [],
  risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
};

beforeEach(() => {
  // The default: the home Overview reads an empty graph (no fabricated connectivity). A test that needs a
  // specific surface (the Logs row -> drawer) overrides this with its own routed stub.
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string) => {
      if (input.startsWith('/api/overview/graph'))
        return Promise.resolve(jsonResponse(200, EMPTY_GRAPH));
      throw new Error(`unexpected fetch ${input}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// INV-CONSOLE-SHELL-3-CLICK-FRAME: the shell realizes the IA (all destinations reachable from the rail),
// the select-then-act drawer frame surrounds every surface, and no fabricated data renders.

describe('the SPA shell', () => {
  it('renders all eleven primary destinations in the rail', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    for (const dest of DESTINATIONS) {
      expect(within(rail).getByRole('link', { name: dest.label })).toBeInTheDocument();
    }
    expect(within(rail).getAllByRole('link')).toHaveLength(DESTINATIONS.length);
  });

  it('marks Overview active at the home route', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/' });
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('fcx-rail__item--active');
    expect(screen.getByRole('heading', { name: 'Overview', level: 2 })).toBeInTheDocument();
  });

  it('navigates to another destination in one click (updates the title + active state)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    await user.click(screen.getByRole('link', { name: 'Policies' }));
    expect(screen.getByRole('heading', { name: 'Policies', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Policies', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Policies' })).toHaveClass('fcx-rail__item--active');
  });

  it('shows the operator identity + tier in the account menu, and no fake "Live" pill', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    expect(screen.getByText(TEST_OPERATOR.email as string)).toBeInTheDocument();
    expect(screen.getByText(TEST_OPERATOR.tier)).toBeInTheDocument();
    // F0.6 deferred -> the live indicator is honest, never a fabricated "Live".
    expect(screen.getByText('Not live')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('surrounds real surfaces with the select-then-act drawer frame (a real row -> the drawer)', async () => {
    // INV-CONSOLE-SHELL-3-CLICK-FRAME through the actual Shell: a real surface (Logs) opens the shared
    // drawer host by activating a row, and the drawer closes. The home Overview surface gains its own
    // node -> drawer trigger in O1.6; the frame itself is proven here through a landed real surface.
    vi.stubGlobal('fetch', logsRoutedFetch());
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('row', { name: /Open the acting entity/ }));
    // The drawer opens through the shell frame and resolves to the acting entity's live detail.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('host-7:pid:1234');
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('shows a staleness marker on the live home surface while the live channel is deferred', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/' });
    expect(screen.getByText('Live channel not enabled yet')).toBeInTheDocument();
  });

  it('drops the staleness marker when the live store reports a fresh stream', () => {
    const store = new LiveStore({ status: 'live', reason: '' });
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/', liveStore: store });
    expect(screen.queryByText('Live channel not enabled yet')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders an explicit not-found state for an unknown route', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/nope' });
    expect(screen.getByText('That destination does not exist')).toBeInTheDocument();
  });
});
