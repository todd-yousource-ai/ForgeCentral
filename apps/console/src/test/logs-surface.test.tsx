// apps/console/src/test/logs-surface.test.tsx -- IP-CONSOLE-09 LG.3 + LG.5 the live Logs table.

import { decisionId, principalId } from '@forge/contracts';
import type { LogDetailView, LogPage } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawerHost } from '../shell/DrawerHost.js';
import { LogsSurface } from '../surfaces/LogsSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** LogsSurface uses the drawer host (LG.5 row -> drawer), so it must render inside a DrawerHost. */
function LogsInHost(): ReactElement {
  return (
    <DrawerHost>
      <LogsSurface />
    </DrawerHost>
  );
}

const page: LogPage = {
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

const detail: LogDetailView = {
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Logs surface (LG.3)', () => {
  it('renders the live decision rows from GET /api/logs', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/logs')) return Promise.resolve(jsonResponse(200, page));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<LogsInHost />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    expect(screen.getByText('LR-EX-001')).toBeInTheDocument();
    expect(screen.getByText('T1059')).toBeInTheDocument();
    expect(screen.getByText('escalate')).toBeInTheDocument();
  });

  it('changing a filter refetches with the engine-compiled predicate (no client-side filter)', async () => {
    const fetchMock = vi.fn((_input: string) => Promise.resolve(jsonResponse(200, page)));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<LogsInHost />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Confidence'), { target: { value: 'HIGH' } });
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('confidence=HIGH'))).toBe(true);
    });
  });

  it('shows an honest empty state that echoes the active filters when nothing matches', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse(200, { rows: [] } satisfies LogPage)),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<LogsInHost />, { route: '/logs' });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'beacon' } });
    await waitFor(() => {
      expect(screen.getByText('No decisions match')).toBeInTheDocument();
    });
    expect(screen.getByText(/search "beacon"/)).toBeInTheDocument();
    expect(screen.queryByText('Suspicious command')).not.toBeInTheDocument();
  });

  it('degrades to an error state with retry when the read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, { error: 'internal' }))),
    );
    renderWithProviders(<LogsInHost />, { route: '/logs' });
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the decision log.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});

describe('the Logs surface row interaction (LG.5)', () => {
  function routedFetch(): ReturnType<typeof vi.fn> {
    return vi.fn((input: string) => {
      if (input.startsWith('/api/logs/explain/')) return Promise.resolve(jsonResponse(200, detail));
      if (input.startsWith('/api/logs')) return Promise.resolve(jsonResponse(200, page));
      if (input.startsWith('/api/entity/'))
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
      throw new Error(`unexpected fetch ${input}`);
    });
  }

  it('clicking the Decision cell opens the EXPLAIN rationale inline (logs.explain)', async () => {
    vi.stubGlobal('fetch', routedFetch());
    renderWithProviders(<LogsInHost />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Suspicious command/ }));
    expect(
      await screen.findByRole('complementary', { name: 'Decision rationale' }),
    ).toBeInTheDocument();
    // Once the rationale resolves it shows the real detail fields (scope + evidence), never fabricated.
    expect(await screen.findByText('host-7')).toBeInTheDocument();
    expect(screen.getByText('dc:process_creation')).toBeInTheDocument();
  });

  it('activating a row opens the entity drawer for the acting entity (closes the DR.N open-site)', async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<LogsInHost />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    // Activate the row (not the decision button) -> resolve the acting entity -> open the drawer.
    fireEvent.click(screen.getByRole('row', { name: /Open the acting entity/ }));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('host-7:pid:1234');
    });
    // The drawer fetched the acting entity's detail (the LG.5 -> IP-CONSOLE-12 drill-in).
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).startsWith('/api/entity/principal/')),
    ).toBe(true);
  });
});
