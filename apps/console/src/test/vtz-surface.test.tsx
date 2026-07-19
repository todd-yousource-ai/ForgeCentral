// apps/console/src/test/vtz-surface.test.tsx -- IP-CONSOLE-02 V2.4 the Active VTZs grid.
//
// Proves the surface half of INV-CONSOLE-VTZ-REAL: the grid renders the real zones the BFF returned from
// the crdb VTZ system of record, the card focal is the archetype badge + the joined risk band with NO
// trust score anywhere, a zone the risk join does not cover shows no band rather than a defaulted green,
// the honest states (loading / engine error / no match) render instead of a fabricated grid, and selecting
// a zone reaches its own-vs-effective posture inside the 3-click budget.

import { vtzId } from '@forge/contracts';
import type { OverviewSankey, VtzTree, VtzZone } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VtzSurface, highSensitivityCount, matchZones } from '../surfaces/VtzSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** The eleven-domain matrix as the engine emits it; `network` varies so own and effective can differ. */
const postures = (network: 'deny' | 'permit-deny-risky' = 'permit-deny-risky') =>
  [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'privilege-escalation', posture: 'deny', floor: false },
    { domain: 'kernel-module', posture: 'deny', floor: false },
    { domain: 'credential-store', posture: 'deny', floor: false },
    { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
    { domain: 'ordinary-network', posture: network, floor: false },
    { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
    { domain: 'memory', posture: 'permit-deny-risky', floor: false },
    { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
    { domain: 'device', posture: 'permit-deny-risky', floor: false },
  ] as VtzZone['ownPostures'];

/** Only the two catastrophic-floor domains deny; nothing beyond the floor is tightened. */
const floorOnlyPostures = () =>
  [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
  ] as VtzZone['ownPostures'];

const zone = (overrides: Partial<VtzZone> = {}): VtzZone => ({
  id: vtzId('YouSource.Corp.Finance'),
  name: 'YouSource.Corp.Finance',
  parent: 'YouSource.Corp',
  zoneType: 'standard',
  lifecycle: 'published',
  microSegmentation: true,
  telemetry: 'full',
  reauthIntervalHours: 8,
  ownPostures: postures(),
  effectivePostures: postures('deny'),
  subZoneCount: 3,
  ...overrides,
});

const tree: VtzTree = {
  zones: [
    zone(),
    zone({
      id: vtzId('YouSource.Public'),
      name: 'YouSource.Public',
      parent: 'YouSource',
      zoneType: 'public',
      lifecycle: 'draft',
      subZoneCount: 0,
      ownPostures: floorOnlyPostures(),
      effectivePostures: floorOnlyPostures(),
    }),
  ],
  truncated: false,
};

/** The Overview graph carrying a risk band for ONE of the two zones (the other has no decisions). */
const sankey: Partial<OverviewSankey> = {
  vtzs: [
    {
      id: 'YouSource.Corp.Finance',
      name: 'YouSource.Corp.Finance',
      profile: 'observe',
      risk: { level: 'red', escalate: 2, candidate: 0, observe: 0 },
    },
  ],
};

/** Stub fetch: the VTZ tree, the zone detail, and the Overview join, each with its own scripted reply. */
function stubFetch(opts: {
  readonly treeStatus?: number;
  readonly treeBody?: unknown;
  readonly detailBody?: unknown;
}): void {
  const fetchMock = vi.fn((input: string) => {
    if (input.startsWith('/api/vtz/tree')) {
      return Promise.resolve(jsonResponse(opts.treeStatus ?? 200, opts.treeBody ?? tree));
    }
    if (input.startsWith('/api/vtz/detail')) {
      return Promise.resolve(
        jsonResponse(200, opts.detailBody ?? { zone: tree.zones[0], ancestors: [] }),
      );
    }
    if (input.startsWith('/api/overview/sankey')) {
      return Promise.resolve(jsonResponse(200, sankey));
    }
    throw new Error(`unexpected fetch ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the VTZ surface (V2.4)', () => {
  it('renders the real zones from GET /api/vtz/tree as cards', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Trust zone YouSource.Public' })).toBeInTheDocument();
  });

  it('shows the KPI row without an Avg Trust card and with no trust score anywhere', async () => {
    stubFetch({});
    const { container } = renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Total VTZs' })).toBeInTheDocument();
    });
    expect(screen.getByRole('region', { name: 'High-sensitivity zones' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /avg trust/i })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/trust score/i);
    expect(container.querySelector('.fc-score-ring')).toBeNull();
  });

  it('joins the risk band by zone id and shows NO band for a zone the join does not cover', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    // Finance has decisions -> Critical. Public has none -> no band at all (not a defaulted Nominal).
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });
    expect(screen.queryByText('Nominal')).not.toBeInTheDocument();
    expect(screen.queryByText('Elevated')).not.toBeInTheDocument();
  });

  it('renders the member + policy counts as an explicit absence, never a fabricated zero', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getAllByText('Not available').length).toBeGreaterThan(0);
    });
    // Two zones x two unavailable counts.
    expect(screen.getAllByText('Not available')).toHaveLength(4);
  });

  it('narrows the grid by search and states the match count against the true total', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Public' }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search zones' }), {
      target: { value: 'finance' },
    });
    expect(
      screen.queryByRole('button', { name: 'Trust zone YouSource.Public' }),
    ).not.toBeInTheDocument();
    // A narrowed grid always says what it is a subset OF, so it is never read as the whole store.
    expect(screen.getByText('Showing 1 of 2 zone(s)')).toBeInTheDocument();
  });

  it('shows an honest empty state when no zone matches the search', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Public' }),
      ).toBeInTheDocument();
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search zones' }), {
      target: { value: 'nothing-matches-this' },
    });
    expect(screen.getByText('No zones match')).toBeInTheDocument();
  });

  it('degrades to an error state with a retry when the tree read fails', async () => {
    stubFetch({ treeStatus: 503, treeBody: { error: 'unavailable' } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the trust zones.')).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders an empty tenant honestly rather than a fabricated zone', async () => {
    stubFetch({ treeBody: { zones: [], truncated: false } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByText('No trust zones yet')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /^Trust zone/ })).not.toBeInTheDocument();
  });

  it('badges a partial tree instead of presenting a prefix as the whole store', async () => {
    stubFetch({ treeBody: { ...tree, truncated: true } });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByText('Partial tree')).toBeInTheDocument();
    });
  });

  it('reaches a zone own-vs-effective posture in two clicks, naming the contributing ancestor', async () => {
    stubFetch({
      detailBody: {
        zone: tree.zones[0],
        ancestors: [{ id: 'YouSource.Corp', name: 'YouSource.Corp' }],
      },
    });
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }),
      ).toBeInTheDocument();
    });
    // Click 1: the zone card -> selects it and switches to Configure.
    fireEvent.click(screen.getByRole('button', { name: 'Trust zone YouSource.Corp.Finance' }));
    await waitFor(() => {
      expect(
        screen.getByText(/Effective posture composes this zone with YouSource.Corp/),
      ).toBeInTheDocument();
    });
    // The engine-flagged catastrophic floor renders locked, and the inherited tightening is marked.
    expect(screen.getAllByText('Floor')).toHaveLength(2);
    expect(screen.getByText('Inherited')).toBeInTheDocument();
  });

  it('prompts for a selection rather than guessing one when Configure is opened directly', async () => {
    stubFetch({});
    renderWithProviders(<VtzSurface />, { route: '/vtz' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Configure' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Configure' }));
    expect(screen.getByText('Select a zone to configure')).toBeInTheDocument();
  });
});

describe('the VTZ surface derivations (pure)', () => {
  it('counts a zone as high-sensitivity only when it denies BEYOND the catastrophic floor', () => {
    // Every zone denies governed-egress + execution; counting the floor would make the KPI meaningless.
    const flooredOnly = zone({ effectivePostures: floorOnlyPostures() });
    const tightened = zone({ effectivePostures: postures('deny') });
    expect(highSensitivityCount([flooredOnly])).toBe(0);
    expect(highSensitivityCount([tightened])).toBe(1);
    expect(highSensitivityCount([flooredOnly, tightened])).toBe(1);
  });

  it('matches zones case-insensitively by dotted name and passes everything through when blank', () => {
    const zones = tree.zones;
    expect(matchZones(zones, '').length).toBe(2);
    expect(matchZones(zones, '  ').length).toBe(2);
    expect(matchZones(zones, 'FINANCE').map((z) => z.name)).toEqual(['YouSource.Corp.Finance']);
    expect(matchZones(zones, 'yousource').length).toBe(2);
    expect(matchZones(zones, 'zzz')).toEqual([]);
  });
});
