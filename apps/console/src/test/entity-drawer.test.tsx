// apps/console/src/test/entity-drawer.test.tsx -- IP-CONSOLE-12 DR.3d the live entity drawer.

import type { ReactElement } from 'react';
import { principalId } from '@forge/contracts';
import type { EntityDetailView } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawerHost, useDrawer } from '../shell/DrawerHost.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const detail: EntityDetailView = {
  ref: { kind: 'principal', id: principalId('aig:agent:a') },
  header: {
    status: 'ok',
    data: { displayName: 'aig:agent:a', kindLabel: 'Agent', status: 'active' },
  },
  info: {
    status: 'ok',
    data: { role: 'operator', clearance: 'secret', enrolledAt: 1, tags: [] },
  },
  zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  capabilities: { status: 'pending', owningRepo: 'torch', gatingTask: 'x' },
  effectivePolicies: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
  recentDecisions: { status: 'empty' },
};

function OpenButton(): ReactElement {
  const drawer = useDrawer();
  return (
    <button
      type="button"
      onClick={() => {
        drawer.openEntity({ kind: 'principal', id: principalId('aig:agent:a') });
      }}
    >
      open
    </button>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the live entity drawer (DR.3d)', () => {
  it('fetches /api/entity/<kind>/<id> on openEntity and renders the live detail', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/entity/principal/')) {
        return Promise.resolve(jsonResponse(200, detail));
      }
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <DrawerHost>
        <OpenButton />
      </DrawerHost>,
    );
    fireEvent.click(screen.getByText('open'));

    // The drawer opens and, once the fetch resolves, shows the live identity + real status.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('aig:agent:a');
    });
    expect(screen.getByText('active')).toBeInTheDocument();
    // The agent id was percent-encoded on the wire (it carries colons).
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/entity/principal/aig%3Aagent%3Aa',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('shows a load error when the entity fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(500, { error: 'internal' }))),
    );
    renderWithProviders(
      <DrawerHost>
        <OpenButton />
      </DrawerHost>,
    );
    fireEvent.click(screen.getByText('open'));
    // The query retries once (createQueryClient retry: 1) before surfacing the error, so allow for it.
    await waitFor(
      () => {
        expect(screen.getByText('Could not load this entity.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
  });
});
