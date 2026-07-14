// apps/console/src/test/overview-surface.test.tsx -- IP-CONSOLE-01 O1.5 the live Overview surface.

import type { OverviewGraph } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverviewSurface, filterByLane } from '../surfaces/OverviewSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const graph: OverviewGraph = {
  sources: [
    { class: 'users', count: 128 },
    { class: 'devices', count: 74 },
    { class: 'agents', count: 12 },
  ],
  destinations: [
    { class: 'network', count: 96 },
    { class: 'saas', count: 63 },
    { class: 'data-stores', count: 17 },
  ],
  edges: [
    { sourceClass: 'users', destClass: 'saas', weight: 52 },
    { sourceClass: 'devices', destClass: 'network', weight: 61 },
    { sourceClass: 'agents', destClass: 'data-stores', weight: 14 },
  ],
  risk: { level: 'red', escalate: 4, candidate: 6, observe: 40 },
};

const emptyGraph: OverviewGraph = {
  sources: [],
  destinations: [],
  edges: [],
  risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('filterByLane', () => {
  it('returns the whole graph for the All lane', () => {
    expect(filterByLane(graph, 'all')).toBe(graph);
  });

  it('projects a single source lane to its node, its ribbons, and only the destinations they reach', () => {
    const view = filterByLane(graph, 'agents');
    expect(view.sources).toEqual([{ class: 'agents', count: 12 }]);
    expect(view.edges).toEqual([{ sourceClass: 'agents', destClass: 'data-stores', weight: 14 }]);
    // Only the reached destination is kept; the tenant-wide risk band is carried through unchanged.
    expect(view.destinations).toEqual([{ class: 'data-stores', count: 17 }]);
    expect(view.risk).toBe(graph.risk);
  });
});

describe('the Overview surface (O1.5)', () => {
  it('renders the live connectivity flow from GET /api/overview/graph, with the risk summary', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/graph')) return Promise.resolve(jsonResponse(200, graph));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAccessibleName(/Connectivity flow\. Sources:/);
    });
    // The header carries the tenant-wide risk band as a glanceable badge (red -> Critical).
    expect(screen.getByText('Risk: Critical')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/overview/graph'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('offers a lane tab per source class + All, and filtering is a client-side view (no refetch)', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/graph')) return Promise.resolve(jsonResponse(200, graph));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'AI Agents' })).toBeInTheDocument();
    const callsBefore = fetchMock.mock.calls.length;

    // Selecting a lane narrows the view without another engine read (the graph is tenant-wide already).
    fireEvent.click(screen.getByRole('tab', { name: 'AI Agents' }));
    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAccessibleName(/Sources: AI Agents 12\./);
    });
    expect(screen.getByRole('img')).toHaveAccessibleName(/Destinations: Data Stores 17\./);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('renders the honest empty state for a tenant with no observed connectivity', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, emptyGraph))),
    );
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByText('No connectivity observed')).toBeInTheDocument();
    });
    // No lane tabs when there are no source classes (only All would exist -> the strip is hidden).
    expect(screen.queryByRole('tab', { name: 'All' })).not.toBeInTheDocument();
  });

  it('degrades to an error state with a retry when the read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(503, { error: 'unavailable' }))),
    );
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(
      () => {
        expect(screen.getByText('Could not load the connectivity graph.')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
