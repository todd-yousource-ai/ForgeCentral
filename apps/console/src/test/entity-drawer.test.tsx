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

/** Both triggers over the same drawer: a hover-style prefetch and the open (DR.6). */
function Triggers(): ReactElement {
  const drawer = useDrawer();
  const ref = { kind: 'principal' as const, id: principalId('aig:agent:a') };
  return (
    <>
      <button type="button" onClick={() => drawer.prefetchEntity(ref)}>
        prefetch
      </button>
      <button type="button" onClick={() => drawer.openEntity(ref)}>
        open
      </button>
    </>
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

  it('isolate: confirm-gates with the exact effect, brokers the command, shows the honest result (DR.5d)', async () => {
    const fetchMock = vi.fn((input: string, init?: RequestInit) => {
      if (input.endsWith('/isolate') && init?.method === 'POST') {
        return Promise.resolve(
          jsonResponse(200, {
            posture: 'quarantine',
            enforcementActive: false,
            summary: 'Quarantine recorded; enforcement off',
          }),
        );
      }
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
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('aig:agent:a');
    });

    // Clicking the action opens a confirm-gate that shows the EXACT effect + the enforcement-off honesty.
    fireEvent.click(screen.getByRole('button', { name: 'Isolate from network' }));
    await waitFor(() => {
      expect(screen.getByText(/quarantine posture/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/enforcement is OFF/i)).toBeInTheDocument();

    // Confirming brokers the command; the honest result appears.
    fireEvent.click(screen.getByRole('button', { name: 'Isolate' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Isolation recorded/i);
    });
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/isolate'));
    expect(call?.[0]).toBe('/api/entity/principal/aig%3Aagent%3Aa/isolate');
    const body = JSON.parse((call?.[1] as RequestInit).body as string) as {
      posture: string;
      commandId: string;
    };
    expect(body.posture).toBe('quarantine');
    expect(typeof body.commandId).toBe('string');
  });

  it('prefetch warms the cache so a later open serves it with no refetch (DR.6)', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/entity/principal/')) {
        return Promise.resolve(jsonResponse(200, detail));
      }
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(
      <DrawerHost>
        <Triggers />
      </DrawerHost>,
    );
    // Hover-prefetch warms the cache.
    fireEvent.click(screen.getByText('prefetch'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    // Opening now serves the prefetched (still-fresh, staleTime 5s) detail -- instant, no second fetch.
    fireEvent.click(screen.getByText('open'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('aig:agent:a');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a tier-absent (unauthorized) section is absent, not a disabled placeholder (DR.6)', async () => {
    const gated: EntityDetailView = { ...detail, info: { status: 'unauthorized' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, gated))),
    );
    renderWithProviders(
      <DrawerHost>
        <OpenButton />
      </DrawerHost>,
    );
    fireEvent.click(screen.getByText('open'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveAccessibleName('aig:agent:a');
    });
    // The unauthorized Information section renders nothing -- absent (no title, no disabled placeholder).
    expect(screen.queryByText('Information')).not.toBeInTheDocument();
    // Authorized sections are unaffected (the header still shows).
    expect(screen.getByText('active')).toBeInTheDocument();
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
