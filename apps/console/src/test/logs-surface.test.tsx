// apps/console/src/test/logs-surface.test.tsx -- IP-CONSOLE-09 LG.3 the live Logs table.

import { decisionId } from '@forge/contracts';
import type { LogPage } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogsSurface } from '../surfaces/LogsSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
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

    renderWithProviders(<LogsSurface />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    // The real decision fields render: rule, technique, the outcome badge.
    expect(screen.getByText('LR-EX-001')).toBeInTheDocument();
    expect(screen.getByText('T1059')).toBeInTheDocument();
    expect(screen.getByText('escalate')).toBeInTheDocument();
  });

  it('changing a filter refetches with the engine-compiled predicate (no client-side filter)', async () => {
    const fetchMock = vi.fn((_input: string) => Promise.resolve(jsonResponse(200, page)));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<LogsSurface />, { route: '/logs' });
    await waitFor(() => {
      expect(screen.getByText('Suspicious command')).toBeInTheDocument();
    });
    // Selecting a confidence recomputes the query key -> a new fetch carrying the engine filter.
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

    renderWithProviders(<LogsSurface />, { route: '/logs' });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'beacon' } });
    await waitFor(() => {
      expect(screen.getByText('No decisions match')).toBeInTheDocument();
    });
    // The empty hint names the active filter (never a fabricated row).
    expect(screen.getByText(/search "beacon"/)).toBeInTheDocument();
    expect(screen.queryByText('Suspicious command')).not.toBeInTheDocument();
  });

  it('degrades to an error state with retry when the read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, { error: 'internal' }))),
    );
    renderWithProviders(<LogsSurface />, { route: '/logs' });
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the decision log.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});
