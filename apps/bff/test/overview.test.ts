// apps/bff/test/overview.test.ts -- the Overview connectivity-graph resolver (RD.4; O1.3 route retired).

import type {
  WireConnectionList,
  WireConnectivityGraph,
  WireConnectivityQuery,
  WireEntityConnections,
} from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import {
  OverviewUnavailableError,
  resolveEntityConnections,
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
        profile: 'observe',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ],
    source_edges: [{ source_class: 'agents', vtz_id: 'demo-public-agent', weight: 3 }],
    dest_edges: [{ vtz_id: 'demo-public-agent', dest_class: 'saas', weight: 4 }],
    top_destinations: [],
    truncated: false,
  };

  /** An engine graph with no observed connectivity (the honest-empty case). */
  const empty: WireConnectivityGraph = {
    sources: [],
    destinations: [],
    edges: [],
    risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
    vtzs: [],
    source_edges: [],
    dest_edges: [],
    top_destinations: [],
    truncated: false,
  };

  it('projects the wire graph to the VTZ-routed OverviewSankey view model', async () => {
    const { engine } = engineWith(zoned);
    const view = await resolveOverviewSankey(engine, principal, { limit: 1000 });
    // The left column anchors all three lanes in the fixed order (AI Agents, Users, Devices); the
    // engine returned only agents, so users + devices are honest empty containers (Users has no
    // directory substrate yet).
    expect(view.sources).toEqual([
      { class: 'agents', count: 3 },
      { class: 'users', count: 0 },
      { class: 'devices', count: 0 },
    ]);
    expect(view.vtzs).toEqual([
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        profile: 'observe',
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

  it('yields an empty graph for a platform with no observed connectivity (no stub)', async () => {
    const { engine } = engineWith(empty);
    const view = await resolveOverviewSankey(engine, principal, { limit: 1000 });
    // The three source lanes still ANCHOR in the fixed order (AI Agents, Users, Devices) as empties.
    expect(view.sources).toEqual([
      { class: 'agents', count: 0 },
      { class: 'users', count: 0 },
      { class: 'devices', count: 0 },
    ]);
    expect(view.vtzs).toEqual([]);
    expect(view.sourceEdges).toEqual([]);
    expect(view.destEdges).toEqual([]);
    // The four category rings still render as honest zeros, never fabricated content.
    expect(view.destinations.every((d) => d.count === 0 && d.apps.length === 0)).toBe(true);
  });

  it('fails closed (OverviewUnavailableError) when a VTZ risk-band level is unknown', async () => {
    const { engine } = engineWith({
      ...zoned,
      vtzs: [
        {
          id: 'x',
          name: 'X',
          profile: 'observe',
          risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
        },
      ],
    });
    await expect(resolveOverviewSankey(engine, principal, { limit: 1000 })).rejects.toBeInstanceOf(
      OverviewUnavailableError,
    );
  });

  it('compiles the query to the engine: millis -> seconds, request_id 0, operator null (server-injected)', async () => {
    const { engine, seen } = engineWith(empty);
    await resolveOverviewSankey(engine, principal, {
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
    const { engine, seen } = engineWith(empty);
    await resolveOverviewSankey(engine, principal, { limit: 1000 });
    expect(seen[0]?.since).toBeNull();
    expect(seen[0]?.until).toBeNull();
  });
});

describe('resolveEntityConnections (O1.6a)', () => {
  /** A mock engine whose ENTITY_CONNECTIONS read is scripted + captures the wire request it saw. */
  function connEngine(reply: WireConnectionList): {
    engine: OperatorEngine;
    seen: WireEntityConnections[];
  } {
    const unused = () => Promise.reject(new Error('unused'));
    const seen: WireEntityConnections[] = [];
    const engine: OperatorEngine = {
      querySubmit: unused,
      cursorFetch: unused,
      cursorClose: unused,
      listAgents: unused,
      entityDecisions: unused,
      entityConnections: (_p, request) => {
        seen.push(request);
        return Promise.resolve(reply);
      },
      connectivityGraph: unused,
      contain: unused,
      logQuery: unused,
      logExplain: unused,
      logExport: unused,
    };
    return { engine, seen };
  }

  it('brokers the subject id + kind and projects the engine list to the view model', async () => {
    const { engine, seen } = connEngine({
      connections: [
        {
          destination_id: '93.184.216.34:443',
          destination_kind: 'network',
          observed_at: 1_700_000_000,
        },
      ],
    });
    const view = await resolveEntityConnections(engine, principal, 'host-9', 'device');
    expect(view.connections).toEqual([
      { destinationId: '93.184.216.34:443', destinationKind: 'network', observedAt: 1_700_000_000 },
    ]);
    // The wire request carries the subject id + kind; operator + request_id are server-injected.
    expect(seen[0]).toEqual({
      request_id: 0,
      operator: null,
      subject_id: 'host-9',
      subject_kind: 'device',
      limit: 500,
    });
  });

  it('yields an empty list for an entity with no observed connections (no stub)', async () => {
    const { engine } = connEngine({ connections: [] });
    const view = await resolveEntityConnections(engine, principal, 'host-9', 'device');
    expect(view.connections).toEqual([]);
  });
});
