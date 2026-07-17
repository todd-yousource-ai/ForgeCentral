// apps/console/src/test/overview-surface.test.tsx -- IP-CONSOLE-01 RD.4b the live Overview Sankey surface.

import type { EntityDetailView, OverviewMemberList, OverviewSankey } from '@forge/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverviewSurface, worstRisk } from '../surfaces/OverviewSurface.js';
import { renderWithProviders } from './render.js';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const band = (level: 'green' | 'yellow' | 'red') => ({
  level,
  escalate: level === 'red' ? 3 : 0,
  candidate: level === 'yellow' ? 2 : 0,
  observe: 5,
});

const graph: OverviewSankey = {
  sources: [
    { class: 'users', count: 515 },
    { class: 'devices', count: 47 },
    { class: 'agents', count: 3 },
  ],
  vtzs: [
    { id: 'vpub', name: 'Demo.Users.Public', profile: 'observe', risk: band('green') },
    { id: 'vpriv', name: 'Demo.Private.Agent', profile: 'observe', risk: band('yellow') },
    { id: 'vpubag', name: 'Demo.Public.Agent', profile: 'observe', risk: band('red') },
  ],
  destinations: [
    { class: 'network', count: 101, apps: [], moreCount: 101 },
    { class: 'saas', count: 323, apps: [], moreCount: 323 },
    { class: 'private-apps', count: 52, apps: [], moreCount: 52 },
    { class: 'data-stores', count: 18, apps: [], moreCount: 18 },
  ],
  sourceEdges: [
    { sourceClass: 'users', vtzId: 'vpub', weight: 515 },
    { sourceClass: 'devices', vtzId: 'vpub', weight: 47 },
    { sourceClass: 'agents', vtzId: 'vpriv', weight: 1 },
    { sourceClass: 'agents', vtzId: 'vpubag', weight: 2 },
  ],
  destEdges: [
    { vtzId: 'vpub', destClass: 'network', weight: 190 },
    { vtzId: 'vpub', destClass: 'private-apps', weight: 96 },
    { vtzId: 'vpubag', destClass: 'network', weight: 12 },
  ],
  truncated: false,
};

/** A four-VTZ graph so the surface offers a second zone page. */
const fourVtz: OverviewSankey = {
  ...graph,
  vtzs: [
    ...graph.vtzs,
    { id: 'v4', name: 'Demo.Extra.Zone', profile: 'observe', risk: band('green') },
  ],
};

const emptyGraph: OverviewSankey = {
  sources: [],
  vtzs: [],
  destinations: [],
  sourceEdges: [],
  destEdges: [],
  truncated: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('worstRisk', () => {
  it('summarizes the tenant by its single most severe zone', () => {
    expect(worstRisk(graph)).toBe('red');
    expect(
      worstRisk({
        ...graph,
        vtzs: [{ id: 'v', name: 'Z', profile: 'observe', risk: band('yellow') }],
      }),
    ).toBe('yellow');
  });

  it('is null when there are no zones (an empty tenant shows no badge)', () => {
    expect(worstRisk(emptyGraph)).toBeNull();
  });
});

describe('the Overview surface (RD.4b)', () => {
  it('renders the live Sankey from GET /api/overview/sankey, with the worst-zone risk summary', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/sankey'))
        return Promise.resolve(jsonResponse(200, graph));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByRole('img')).toHaveAccessibleName(/Connectivity flow\. Sources:/);
    });
    // The header carries the worst VTZ risk band as a glanceable badge (a red zone -> Critical).
    expect(screen.getByText('Risk: Critical')).toBeInTheDocument();
    // The accessible name enumerates the three demo zones + their detection-driven risk.
    expect(screen.getByRole('img')).toHaveAccessibleName(/Demo\.Public\.Agent Critical/);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/overview/sankey'),
      expect.objectContaining({ credentials: 'include' }),
    );
    // INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED: a complete graph shows no truncation badge.
    expect(screen.queryByText('Partial graph')).not.toBeInTheDocument();
  });

  it('badges a truncated graph as partial (INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED)', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/sankey'))
        return Promise.resolve(jsonResponse(200, { ...graph, truncated: true }));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByText('Partial graph')).toBeInTheDocument();
    });
  });

  it('hovering a destination filters the left flows to only its contributing paths (no refetch)', async () => {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/sankey'))
        return Promise.resolve(jsonResponse(200, graph));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByText('NETWORK')).toBeInTheDocument();
    });
    const callsBefore = fetchMock.mock.calls.length;

    // Hover `private-apps` -> only users>vpub, devices>vpub, vpub>private-apps stay full; the rest dim.
    const dests = [...container.querySelectorAll('.fc-ov__dest')];
    const privateApps = dests.find((g) => g.textContent?.includes('PRIVATE APPS'));
    expect(privateApps).toBeDefined();
    fireEvent.mouseEnter(privateApps as Element);
    await waitFor(() => {
      const full = [...container.querySelectorAll('.fc-ov__ribbons path')].filter(
        (p) => p.getAttribute('opacity') === '1',
      );
      expect(full).toHaveLength(3);
    });
    // The filter is a client-side view over the already-real graph -- it never triggers another read.
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('pages the VTZs when more than three zones exist ("swipe for more")', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(200, fourVtz))),
    );
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => {
      expect(screen.getByText('Zones 1 of 2')).toBeInTheDocument();
    });
    // Page 1 shows the first three; the fourth is hidden until we advance.
    expect(screen.getByText('Users.Public')).toBeInTheDocument();
    expect(screen.queryByText('Extra.Zone')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More zones' }));
    await waitFor(() => {
      expect(screen.getByText('Zones 2 of 2')).toBeInTheDocument();
    });
    expect(screen.getByText('Extra.Zone')).toBeInTheDocument();
    expect(screen.queryByText('Users.Public')).not.toBeInTheDocument();
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
    // No zone pager and no risk badge when there are no zones.
    expect(screen.queryByRole('navigation', { name: 'Trust zone pages' })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Risk:/)).not.toBeInTheDocument();
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

// The O1.6b select-then-act flow: click a Sankey container -> its member LIST -> a member's detail, with
// a back affordance. Proves the two <= 3-click operator tasks by contract (INV-CONSOLE-3-CLICKS).
describe('the Overview container -> members -> detail flow (O1.6b)', () => {
  const agentMembers: OverviewMemberList = {
    members: [
      { id: 'aig:agent:codex', kind: 'agent_instance', name: 'Codex', connectionCount: 5 },
      { id: 'aig:agent:claude', kind: 'agent_instance', name: 'Claude', connectionCount: 2 },
    ],
  };
  const codexDetail: EntityDetailView = {
    ref: { kind: 'principal', id: 'aig:agent:codex' } as EntityDetailView['ref'],
    header: { status: 'ok', data: { displayName: 'Codex', kindLabel: 'Agent', status: 'active' } },
    info: {
      status: 'ok',
      data: { role: 'operator', clearance: 'secret', enrolledAt: 1, tags: [] },
    },
    zones: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
    capabilities: { status: 'pending', owningRepo: 'torch', gatingTask: 'x' },
    effectivePolicies: { status: 'pending', owningRepo: 'forge', gatingTask: 'x' },
    recentDecisions: { status: 'empty' },
  };

  function mockFlow(): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn((input: string) => {
      if (input.startsWith('/api/overview/sankey'))
        return Promise.resolve(jsonResponse(200, graph));
      if (input.startsWith('/api/overview/members?container=agents'))
        return Promise.resolve(jsonResponse(200, agentMembers));
      if (input.startsWith('/api/entity/principal/'))
        return Promise.resolve(jsonResponse(200, codexDetail));
      throw new Error(`unexpected fetch ${input}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('task 1: container -> member -> inspect opens the member detail in <= 3 clicks', async () => {
    const fetchMock = mockFlow();
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => expect(screen.getByText('AI AGENTS')).toBeInTheDocument());

    // Click 1: open the AI Agents container -> the drawer lists its members (loaded async).
    fireEvent.click(screen.getByRole('button', { name: /Open AI AGENTS members/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'AI Agents' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Claude/ })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/overview/members?container=agents',
      expect.objectContaining({ credentials: 'include' }),
    );

    // Click 2: open a member -> the drawer swaps to that entity's live detail.
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Codex' })).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/entity/principal/aig%3Aagent%3Acodex',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('back from a member detail returns to the container list (never closes the drawer)', async () => {
    mockFlow();
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => expect(screen.getByText('AI AGENTS')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Open AI AGENTS members/ }));
    await waitFor(() => screen.getByRole('button', { name: /Codex/ }));
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Codex' })).toBeInTheDocument());

    // Back steps to the LIST (the drawer stays open, now titled by the container again).
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'AI Agents' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Codex/ })).toBeInTheDocument();
  });

  it('task 2: container -> agent -> Isolate -> confirm reaches the audited confirm in <= 3 clicks', async () => {
    mockFlow();
    renderWithProviders(<OverviewSurface />, { route: '/' });
    await waitFor(() => expect(screen.getByText('AI AGENTS')).toBeInTheDocument());

    // Click 1: container. Click 2: the agent member. Click 3: Isolate.
    fireEvent.click(screen.getByRole('button', { name: /Open AI AGENTS members/ }));
    await waitFor(() => screen.getByRole('button', { name: /Codex/ }));
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }));
    await waitFor(() => screen.getByRole('dialog', { name: 'Codex' }));
    fireEvent.click(screen.getByRole('button', { name: /Isolate/i }));

    // The audited confirm gate appears (enforcement OFF, said honestly).
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Isolate' })).toBeInTheDocument(),
    );
    expect(screen.getByText(/Live enforcement is OFF/)).toBeInTheDocument();
  });
});
