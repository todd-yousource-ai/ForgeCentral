// apps/bff/test/overview.test.ts -- IP-CONSOLE-01 O1.3 the Overview connectivity-graph resolver.

import type { WireConnectivityGraph, WireConnectivityQuery } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import {
  OverviewUnavailableError,
  resolveOverviewGraph,
  resolveOverviewSankey,
} from '../src/engine/overview.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';

const principal: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** A mock OperatorEngine whose CONNECTIVITY_GRAPH read is scripted and captures the wire query it saw. */
function engineWith(graph: WireConnectivityGraph): {
  engine: OperatorEngine;
  seen: WireConnectivityQuery[];
} {
  const unused = () => Promise.reject(new Error('unused'));
  const seen: WireConnectivityQuery[] = [];
  const engine: OperatorEngine = {
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: (_principal, request) => {
      seen.push(request);
      return Promise.resolve(graph);
    },
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
  };
  return { engine, seen };
}

describe('resolveOverviewGraph', () => {
  it('projects the engine graph into the camelCase OverviewGraph (real facts, no fabrication)', async () => {
    const { engine } = engineWith({
      sources: [
        { class: 'agents', count: 3 },
        { class: 'users', count: 1 },
      ],
      destinations: [{ class: 'saas', count: 4 }],
      edges: [{ source_class: 'agents', dest_class: 'saas', weight: 4 }],
      risk: { level: 'yellow', escalate: 0, candidate: 2, observe: 5 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
    });
    const view = await resolveOverviewGraph(engine, principal, { limit: 1000 });
    expect(view.sources).toEqual([
      { class: 'agents', count: 3 },
      { class: 'users', count: 1 },
    ]);
    // The snake_case wire edge fields project to camelCase.
    expect(view.edges).toEqual([{ sourceClass: 'agents', destClass: 'saas', weight: 4 }]);
    // The zone is colored by the risk band (green/yellow/red from detected alerts), not a trust score.
    expect(view.risk).toEqual({ level: 'yellow', escalate: 0, candidate: 2, observe: 5 });
  });

  it('yields an empty, green graph for a platform with no observed connectivity (no stub)', async () => {
    const { engine } = engineWith({
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
    });
    const view = await resolveOverviewGraph(engine, principal, { limit: 1000 });
    expect(view.sources).toEqual([]);
    expect(view.destinations).toEqual([]);
    expect(view.edges).toEqual([]);
    expect(view.risk.level).toBe('green');
  });

  it('fails closed (OverviewUnavailableError) when the risk-band level is unknown', async () => {
    const { engine } = engineWith({
      sources: [],
      destinations: [],
      edges: [],
      // A tag the Console does not know must never be silently mis-colored.
      risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
    });
    await expect(resolveOverviewGraph(engine, principal, { limit: 1000 })).rejects.toBeInstanceOf(
      OverviewUnavailableError,
    );
  });

  it('compiles the query to the engine: millis -> seconds, request_id 0, operator null (server-injected)', async () => {
    const { engine, seen } = engineWith({
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
    });
    await resolveOverviewGraph(engine, principal, {
      since: 1_700_000_000_000,
      until: 1_700_000_060_000,
      limit: 250,
    });
    expect(seen[0]).toEqual({
      request_id: 0,
      operator: null,
      since: 1_700_000_000,
      until: 1_700_000_060,
      limit: 250,
    });
  });

  it('omits the time bounds as null when the query carries none', async () => {
    const { engine, seen } = engineWith({
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
    });
    await resolveOverviewGraph(engine, principal, { limit: 1000 });
    expect(seen[0]?.since).toBeNull();
    expect(seen[0]?.until).toBeNull();
  });
});

describe('resolveOverviewSankey (RD.4)', () => {
  const zoned = {
    sources: [{ class: 'agents', count: 3 }],
    destinations: [{ class: 'saas', count: 4 }],
    edges: [{ source_class: 'agents', dest_class: 'saas', weight: 4 }],
    risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
    vtzs: [
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ],
    source_edges: [{ source_class: 'agents', vtz_id: 'demo-public-agent', weight: 3 }],
    dest_edges: [{ vtz_id: 'demo-public-agent', dest_class: 'saas', weight: 4 }],
    top_destinations: [],
  };

  it('projects the wire graph to the VTZ-routed OverviewSankey view model', async () => {
    const { engine } = engineWith(zoned);
    const view = await resolveOverviewSankey(engine, principal, { limit: 1000 });
    expect(view.vtzs).toEqual([
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ]);
    expect(view.sourceEdges).toEqual([
      { sourceClass: 'agents', vtzId: 'demo-public-agent', weight: 3 },
    ]);
    // All four category rings render (empty rings are honest zeros); the engine-side saas count
    // merges into the saas ring with no per-destination breakdown (moreCount).
    expect(view.destinations).toEqual([
      { class: 'network', count: 0, apps: [], moreCount: 0 },
      { class: 'saas', count: 4, apps: [], moreCount: 4 },
      { class: 'private-apps', count: 0, apps: [], moreCount: 0 },
      { class: 'data-stores', count: 0, apps: [], moreCount: 0 },
    ]);
  });

  it('fails closed (OverviewUnavailableError) when a VTZ risk-band level is unknown', async () => {
    const { engine } = engineWith({
      ...zoned,
      vtzs: [
        {
          id: 'x',
          name: 'X',
          risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
        },
      ],
    });
    await expect(resolveOverviewSankey(engine, principal, { limit: 1000 })).rejects.toBeInstanceOf(
      OverviewUnavailableError,
    );
  });
});
