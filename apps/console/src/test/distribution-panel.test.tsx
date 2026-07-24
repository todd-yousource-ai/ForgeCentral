// apps/console/src/test/distribution-panel.test.tsx -- FD.7c the distribution ledger panel.
//
// Proves the surface half of INV-CONSOLE-FORGE-CONVERGENCE-VISIBLE: the panel renders the real
// convergence the BFF returned (applied / rejected-with-reason / silent), a zone with no bundle shows
// the honest empty state, and the re-distribute button re-pushes to exactly the current scope.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DistributionPanel } from '../surfaces/DistributionPanel.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const CONVERGED = {
  hasBundle: true,
  version: 7,
  members: [
    { endpointCn: 'a.box', state: 'applied', reason: null },
    { endpointCn: 'b.box', state: 'rejected', reason: 'SignatureInvalid' },
    { endpointCn: 'c.box', state: 'silent', reason: null },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DistributionPanel (FD.7c)', () => {
  it('renders the three endpoint states, carrying the rejected reason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, CONVERGED)));
    renderWithProviders(<DistributionPanel zoneId="YouSource.Corp" />);

    expect(await screen.findByText('a.box')).toBeTruthy();
    expect(screen.getByText('Applied')).toBeTruthy();
    // The rejected reason is shown, never collapsed to a generic failure.
    expect(screen.getByText(/Rejected: SignatureInvalid/)).toBeTruthy();
    // Silent is its own state -- an unconfirmed box must not read as applied.
    expect(screen.getByText('No confirmation')).toBeTruthy();
    expect(screen.getByText('Bundle v7')).toBeTruthy();
  });

  it('shows the honest empty state when no policy has been distributed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { hasBundle: false, version: 0, members: [] })),
    );
    renderWithProviders(<DistributionPanel zoneId="YouSource.Corp" />);
    expect(await screen.findByText('No policy distributed yet')).toBeTruthy();
  });

  it('re-distributes to exactly the current scope', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, CONVERGED)) // the convergence read
      .mockResolvedValueOnce(
        jsonResponse(200, {
          version: 8,
          commitVersion: 42,
          unexpressedDomains: [],
          unexpressedFields: [],
        }),
      ) // the distribute POST
      .mockResolvedValue(jsonResponse(200, CONVERGED)); // the invalidation refetch
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<DistributionPanel zoneId="YouSource.Corp" />);

    const button = await screen.findByRole('button', {
      name: /Commit & re-distribute to 3 endpoints/,
    });
    fireEvent.click(button);

    // P5.5: the distribute is confirm-gated and the dialog names the target endpoint set; only the
    // explicit confirm commits.
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('a.box, b.box, c.box');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Distribute' }));

    await waitFor(() => {
      const distributeCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/distribute'),
      );
      expect(distributeCall).toBeDefined();
      const body = JSON.parse((distributeCall?.[1] as { body: string }).body) as {
        members: string[];
      };
      // Exactly the current scope, no more, no less.
      expect(body.members).toEqual(['a.box', 'b.box', 'c.box']);
    });
  });

  it('surfaces a load error with retry rather than a fabricated status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(503, { error: 'unavailable' })));
    renderWithProviders(<DistributionPanel zoneId="YouSource.Corp" />);
    // The query retries once (retry: 1), so the error state appears after a short delay.
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the distribution status.')).toBeTruthy();
      },
      { timeout: 3000 },
    );
  });
});
