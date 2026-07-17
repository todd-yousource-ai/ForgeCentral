// packages/contracts/test/contracts.test.ts -- F0.1 tier-1 tests for @forge/contracts.
//
// Proves INV-CONSOLE-CONTRACTS-SINGLE-SOURCE: the engine DTO types have exactly one source (the vendored
// schema, via the generator), enforced by a codegen round-trip drift gate; the branded ids are nominally
// distinct; and the hand-authored surfaces (errors/bindings) compose the generated types rather than
// re-declaring them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderWireDtoTypes } from '../scripts/generate.mjs';
import {
  OVERVIEW_SOURCE_CATEGORIES,
  OVERVIEW_VTZS_PER_PAGE,
  WIRE_DTO_SCHEMA_ID,
  bindingId,
  decisionId,
  isPending,
  overviewHighlight,
  overviewVtzPage,
  overviewVtzPageCount,
  memberEntityRef,
  principalId,
  toConnectionList,
  toMemberList,
  toOverviewSankey,
  toVtzProfile,
  requestId,
  tenantId,
  toRiskLevel,
} from '../src/index.js';
import type {
  Binding,
  ConsoleError,
  DecisionId,
  OverviewSankey,
  ReadBinding,
  TenantId,
  WireConnectionList,
  WireConnectivityGraph,
  WireMemberList,
  WireReply,
  WireStreamEvent,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'schema', 'wire-dto.schema.json');
const generatedPath = join(here, '..', 'src', 'generated', 'wire-dto.ts');

describe('wire DTO codegen (drift gate)', () => {
  it('the committed generated file equals the emitter output', () => {
    const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const committed = readFileSync(generatedPath, 'utf8');
    // If a wire DTO changes without regenerating, this fails -- the same drift discipline crdb applies.
    expect(renderWireDtoTypes(schema)).toBe(committed);
  });

  it('the vendored schema carries exactly the pinned contract version', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { $id?: string };
    expect(schema.$id).toBe(WIRE_DTO_SCHEMA_ID);
  });
});

describe('generated engine types are usable', () => {
  it('a decision delta event conforms to the generated shape', () => {
    const event: WireStreamEvent = {
      watermark: 40167,
      delta: {
        Decision: {
          decision_id: 'sha512:ab',
          rule_id: 'LR-C2-001',
          anchor: 'T1071',
          tactics: ['TA0011'],
          finding: 'Application Layer Protocol',
          source_subjects: ['host-1:pid:42'],
          confidence: 'Candidate',
          recommended_action: 'Observe',
          scope: 'tenant',
        },
      },
    };
    expect('Decision' in event.delta).toBe(true);
  });

  it('an externally-tagged reply narrows by its single key', () => {
    const reply: WireReply = { QueryRows: { rows: [], redacted_fields: [], cursor: null } };
    // Exhaustive narrowing on the tagged union (a compile + runtime check).
    const affected = 'QueryRows' in reply ? reply.QueryRows.rows.length : -1;
    expect(affected).toBe(0);
  });

  it('a unit-variant reply is the bare string literal', () => {
    const reply: WireReply = 'CursorClosed';
    expect(reply).toBe('CursorClosed');
  });
});

describe('branded ids are nominally distinct', () => {
  it('tag helpers round-trip the raw string at runtime', () => {
    expect(principalId('p-1')).toBe('p-1');
    expect(tenantId('t-1')).toBe('t-1');
    expect(decisionId('d-1')).toBe('d-1');
  });

  it('a PrincipalId is not assignable to a TenantId (compile-time)', () => {
    const p = principalId('p-1');
    // @ts-expect-error PrincipalId and TenantId are distinct brands; cross-assignment is refused.
    const t: TenantId = p;
    expect(t).toBe('p-1');
  });

  it('a raw string is not assignable to a branded id (compile-time)', () => {
    // @ts-expect-error a bare string cannot stand in for a DecisionId without the tag constructor.
    const d: DecisionId = 'not-tagged';
    expect(d).toBe('not-tagged');
  });
});

describe('error taxonomy composes the generated wire class', () => {
  it('a ConsoleError carries the engine code, wire class, retry, and correlation', () => {
    const err: ConsoleError = {
      code: 'PolicyError',
      wireClass: 'Denied',
      retry: 'Never',
      message: 'access denied',
      requestId: requestId('req-9'),
    };
    expect(err.code).toBe('PolicyError');
    expect(err.wireClass).toBe('Denied');
  });
});

describe('binding manifest shape', () => {
  it('a live read binding is not pending', () => {
    const b: ReadBinding = {
      id: bindingId('overview.sankey.read'),
      kind: 'read',
      surface: 'cruciblql',
      op: 'connectivity_graph_v1',
      viewModel: 'OverviewSankey',
      status: { kind: 'live' },
    };
    expect(isPending(b)).toBe(false);
  });

  it('a pending binding names its gating engine task and reads as pending', () => {
    const b: Binding = {
      id: bindingId('vtz.isolate.command'),
      kind: 'command',
      surface: 'torch',
      op: 'vtz_isolate',
      authz: 'admin:contain',
      audited: true,
      status: {
        kind: 'pending',
        owningRepo: 'torch',
        gatingTask: 'CONSOLE-02 VTZ isolate command',
      },
    };
    expect(isPending(b)).toBe(true);
  });
});

describe('the shared risk-level narrowing (fail-closed on an unknown engine tag)', () => {
  it('narrows the engine risk-level tag and fails the Sankey projection closed on an unknown tag', () => {
    expect(toRiskLevel('red')).toBe('red');
    expect(toRiskLevel('green')).toBe('green');
    expect(toRiskLevel('chartreuse')).toBeNull();
    // An unknown VTZ level fails the whole Sankey projection closed (the resolver maps null to the
    // unavailable state, never a mis-colored zone).
    const bad: WireConnectivityGraph = {
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [
        {
          id: 'x',
          name: 'X',
          profile: 'observe',
          risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
        },
      ],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
      truncated: false,
    };
    expect(toOverviewSankey(bad)).toBeNull();
  });

  it('renders an empty tenant as an empty Sankey (INV-CONSOLE-NO-STUB: no fabricated node)', () => {
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
    const view = toOverviewSankey(empty);
    expect(view).not.toBeNull();
    // The three source lanes anchor in the fixed order (AI Agents, Users, Devices) as honest empties.
    expect(view?.sources).toEqual([
      { class: 'agents', count: 0 },
      { class: 'users', count: 0 },
      { class: 'devices', count: 0 },
    ]);
    expect(view?.vtzs).toEqual([]);
    expect(view?.sourceEdges).toEqual([]);
    expect(view?.destEdges).toEqual([]);
  });

  it('anchors all three source lanes in the fixed order (AI Agents, Users, Devices)', () => {
    // The engine returned only agents + devices, alphabetically; the projection anchors all three in
    // the fixed order, and Users (no engine substrate yet) is an honest empty container at count 0.
    const graph: WireConnectivityGraph = {
      sources: [
        { class: 'agents', count: 3 },
        { class: 'devices', count: 47 },
      ],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
      vtzs: [],
      source_edges: [],
      dest_edges: [],
      top_destinations: [],
      truncated: false,
    };
    const view = toOverviewSankey(graph);
    expect(view?.sources).toEqual([
      { class: 'agents', count: 3 },
      { class: 'users', count: 0 },
      { class: 'devices', count: 47 },
    ]);
    expect(OVERVIEW_SOURCE_CATEGORIES).toEqual(['agents', 'users', 'devices']);
  });
});

describe('Overview redesign (Sankey) view model', () => {
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
      {
        class: 'network',
        count: 101,
        apps: [{ name: 'dns.google', address: '8.8.8.8', count: 1 }],
        moreCount: 100,
      },
      { class: 'saas', count: 323, apps: [], moreCount: 323 },
      { class: 'private-apps', count: 52, apps: [], moreCount: 52 },
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

  it('pages the VTZs at most three per page ("swipe for more")', () => {
    expect(OVERVIEW_VTZS_PER_PAGE).toBe(3);
    expect(overviewVtzPageCount(3)).toBe(1);
    expect(overviewVtzPageCount(4)).toBe(2);
    expect(overviewVtzPageCount(0)).toBe(1); // an empty tenant still has one (empty) page
    expect(overviewVtzPage(graph.vtzs, 0)).toHaveLength(3);
    // A four-VTZ tenant spills the fourth onto page 1; an out-of-range page clamps in.
    const four = [
      ...graph.vtzs,
      { id: 'v4', name: 'Demo.Extra', profile: 'observe' as const, risk: band('green') },
    ];
    expect(overviewVtzPage(four, 1).map((v) => v.id)).toEqual(['v4']);
    expect(overviewVtzPage(four, 9).map((v) => v.id)).toEqual(['v4']);
  });

  it('computes the hover highlight: only the source->VTZ->dest paths feeding the hovered category', () => {
    // Hover "private-apps": only Demo.Users.Public feeds it, so only Users + Devices contribute.
    const hl = overviewHighlight(graph, 'private-apps');
    expect([...hl.vtzIds]).toEqual(['vpub']);
    expect(hl.destEdgeKeys.has('vpub>private-apps')).toBe(true);
    expect(hl.sourceEdgeKeys.has('users>vpub')).toBe(true);
    expect(hl.sourceEdgeKeys.has('devices>vpub')).toBe(true);
    // The agent VTZs (and their source edges) are NOT on a path to private-apps -> excluded (dimmed).
    expect(hl.sourceEdgeKeys.has('agents>vpriv')).toBe(false);
    expect(hl.sourceEdgeKeys.has('agents>vpubag')).toBe(false);
  });

  it('highlight of network keeps both contributing VTZs (Public + Public.Agent)', () => {
    const hl = overviewHighlight(graph, 'network');
    expect([...hl.vtzIds].sort()).toEqual(['vpub', 'vpubag']);
    expect(hl.sourceEdgeKeys.has('agents>vpubag')).toBe(true);
    expect(hl.sourceEdgeKeys.has('users>vpub')).toBe(true);
  });
});

describe('toVtzProfile (PR-3b VTZ profile projection)', () => {
  it('maps a recognized profile through and defaults an unknown/empty to observe', () => {
    // A recognized posture projects verbatim.
    expect(toVtzProfile('observe')).toBe('observe');
    expect(toVtzProfile('standard')).toBe('standard');
    expect(toVtzProfile('quarantine')).toBe('quarantine');
    // An unknown value, or the empty string an older engine sends, defaults to observe (the safe
    // learning posture) -- never a fabricated stricter posture.
    expect(toVtzProfile('')).toBe('observe');
    expect(toVtzProfile('deny-everything')).toBe('observe');
  });
});

describe('toOverviewSankey (RD.4 wire -> Sankey projection)', () => {
  const wire: WireConnectivityGraph = {
    sources: [
      { class: 'devices', count: 3 },
      { class: 'agents', count: 1 },
    ],
    destinations: [
      { class: 'network', count: 2 },
      { class: 'saas', count: 1 },
    ],
    edges: [{ source_class: 'devices', dest_class: 'network', weight: 2 }],
    risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
    vtzs: [
      {
        id: 'demo-users-public',
        name: 'Demo.Users.Public',
        profile: 'observe',
        risk: { level: 'green', escalate: 0, candidate: 0, observe: 5 },
      },
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        profile: 'standard',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ],
    source_edges: [
      { source_class: 'devices', vtz_id: 'demo-users-public', weight: 1 },
      { source_class: 'devices', vtz_id: 'demo-public-agent', weight: 2 },
    ],
    dest_edges: [{ vtz_id: 'demo-public-agent', dest_class: 'network', weight: 2 }],
    top_destinations: [],
    truncated: false,
  };

  it('projects the two-stage wire graph to the camelCase OverviewSankey (cross-module guard)', () => {
    const view = toOverviewSankey(wire);
    expect(view).not.toBeNull();
    expect(view?.vtzs).toEqual([
      {
        id: 'demo-users-public',
        name: 'Demo.Users.Public',
        profile: 'observe',
        risk: { level: 'green', escalate: 0, candidate: 0, observe: 5 },
      },
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        profile: 'standard',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ]);
    expect(view?.sourceEdges).toEqual([
      { sourceClass: 'devices', vtzId: 'demo-users-public', weight: 1 },
      { sourceClass: 'devices', vtzId: 'demo-public-agent', weight: 2 },
    ]);
    expect(view?.destEdges).toEqual([
      { vtzId: 'demo-public-agent', destClass: 'network', weight: 2 },
    ]);
    // Empty top_destinations -> each dest lists no apps and moreCount is its full count.
    expect(view?.destinations).toEqual([
      { class: 'network', count: 2, apps: [], moreCount: 2 },
      { class: 'saas', count: 1, apps: [], moreCount: 1 },
    ]);
    // INV-CONNECTIVITY-SCAN-COMPLETE-OR-FLAGGED: the engine's truncation flag reaches the view model.
    expect(view?.truncated).toBe(false);
    expect(toOverviewSankey({ ...wire, truncated: true })?.truncated).toBe(true);
  });

  it('lists the network apps from top_destinations, resolving names (unresolved -> IP) with moreCount', () => {
    const graph: WireConnectivityGraph = {
      ...wire,
      destinations: [
        { class: 'network', count: 12 },
        { class: 'saas', count: 1 },
      ],
      top_destinations: [
        { address: '140.82.112.5', count: 5 },
        { address: '8.8.8.8', count: 3 },
        { address: '10.0.0.9', count: 1 },
      ],
    };
    // The resolver names two of the three; the third has no name and falls back to its IP (never fabricated).
    const names = new Map([
      ['140.82.112.5', 'github.com'],
      ['8.8.8.8', 'dns.google'],
    ]);
    const view = toOverviewSankey(graph, (address) => names.get(address));
    const network = view?.destinations.find((d) => d.class === 'network');
    expect(network?.apps).toEqual([
      { name: 'github.com', address: '140.82.112.5', count: 5 },
      { name: 'dns.google', address: '8.8.8.8', count: 3 },
      { name: '10.0.0.9', address: '10.0.0.9', count: 1 },
    ]);
    // moreCount = the distinct total (12) - the LISTED addresses (3) = 9 unlisted distinct endpoints
    // (INV-CONNECTIVITY-NODE-DISTINCT: counts are distinct destinations, never connection sums).
    expect(network?.moreCount).toBe(9);
    // Only the network category carries apps; other categories list none.
    expect(view?.destinations.find((d) => d.class === 'saas')?.apps).toEqual([]);
  });

  it('re-buckets the flat network class into category rings, merging same-named apps', () => {
    const graph: WireConnectivityGraph = {
      ...wire,
      destinations: [{ class: 'network', count: 20 }],
      dest_edges: [{ vtz_id: 'demo-users-public', dest_class: 'network', weight: 20 }],
      top_destinations: [
        { address: '140.82.112.4', count: 4 }, // GitHub LB a
        { address: '140.82.113.5', count: 4 }, // GitHub LB b -> merges into ONE GitHub app x8
        { address: '8.8.8.8', count: 8 }, // Google DNS (network)
        { address: '10.0.0.20:5432', count: 4 }, // Postgres (data-stores)
      ],
    };
    const names = new Map([
      ['140.82.112.4', 'lb-a.github.com'],
      ['140.82.113.5', 'lb-b.github.com'],
      ['8.8.8.8', 'dns.google'],
    ]);
    const classify = (address: string, resolvedName?: string) => {
      if (resolvedName?.endsWith('github.com'))
        return { category: 'saas' as const, name: 'GitHub' };
      if (resolvedName === 'dns.google')
        return { category: 'network' as const, name: 'Google DNS' };
      if (address.endsWith(':5432')) return { category: 'data-stores' as const, name: 'Postgres' };
      return { category: 'network' as const, name: address };
    };
    const view = toOverviewSankey(graph, (a) => names.get(a), classify);
    expect(view).not.toBeNull();
    // ALL FOUR rings always render in ring order (an empty category is an honest zero, like a green VTZ).
    expect(view?.destinations.map((d) => d.class)).toEqual([
      'network',
      'saas',
      'private-apps',
      'data-stores',
    ]);
    const byClass = new Map(view?.destinations.map((d) => [d.class, d]));
    expect(byClass.get('private-apps')).toMatchObject({ count: 0, apps: [], moreCount: 0 });
    // Ring counts are DISTINCT destinations (INV-CONNECTIVITY-NODE-DISTINCT): network = 1 listed app
    // (Google DNS) + the distinct unlisted tail (20 distinct endpoints - 4 listed addresses = 16).
    expect(byClass.get('network')).toMatchObject({ count: 17, moreCount: 16 });
    expect(byClass.get('network')?.apps).toEqual([
      { name: 'Google DNS', address: '8.8.8.8', count: 8 },
    ]);
    // saas = the two GitHub LB IPs MERGED under ONE app -> the ring reads 1 and lists 1 (consistent).
    expect(byClass.get('saas')).toMatchObject({ count: 1, moreCount: 0 });
    expect(byClass.get('saas')?.apps).toEqual([
      { name: 'GitHub', address: '140.82.112.4', count: 8 },
    ]);
    expect(byClass.get('data-stores')).toMatchObject({ count: 1, moreCount: 0 });
    expect(byClass.get('data-stores')?.apps).toEqual([
      { name: 'Postgres', address: '10.0.0.20:5432', count: 4 },
    ]);
    // The VTZ->network ribbon splits by the rings' listed CONNECTION shares (8+8+4=20 listed):
    // network 8/20, saas 8/20, data-stores 4/20 of the weight-20 ribbon -- volume mass, never
    // distinct-count shares (which would distort traffic).
    expect(view?.destEdges).toEqual([
      { vtzId: 'demo-users-public', destClass: 'network', weight: 8 },
      { vtzId: 'demo-users-public', destClass: 'saas', weight: 8 },
      { vtzId: 'demo-users-public', destClass: 'data-stores', weight: 4 },
    ]);
  });

  it('fails closed to null if any VTZ risk level is unknown', () => {
    const bad: WireConnectivityGraph = {
      ...wire,
      vtzs: [
        {
          id: 'x',
          name: 'X',
          profile: 'observe',
          risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
        },
      ],
    };
    expect(toOverviewSankey(bad)).toBeNull();
  });
});

describe('toConnectionList (O1.6a entity-connections projection)', () => {
  it('projects a WireConnectionList to camelCase, preserving order and an unknown kind', () => {
    const reply: WireConnectionList = {
      connections: [
        {
          destination_id: '93.184.216.34:443',
          destination_kind: 'network',
          observed_at: 1_700_000_000,
        },
        {
          destination_id: 'aig:agent:codex',
          destination_kind: 'agent',
          observed_at: 1_700_000_060,
        },
        // An unknown kind passes through honestly (the drawer labels what the engine attributed).
        { destination_id: 'x', destination_kind: 'quantum-relay', observed_at: 1_700_000_120 },
      ],
    };
    expect(toConnectionList(reply)).toEqual({
      connections: [
        {
          destinationId: '93.184.216.34:443',
          destinationKind: 'network',
          observedAt: 1_700_000_000,
        },
        { destinationId: 'aig:agent:codex', destinationKind: 'agent', observedAt: 1_700_000_060 },
        { destinationId: 'x', destinationKind: 'quantum-relay', observedAt: 1_700_000_120 },
      ],
    });
  });

  it('yields an empty list for an entity with no observed connections (no fabricated row)', () => {
    expect(toConnectionList({ connections: [] })).toEqual({ connections: [] });
  });
});

describe('toMemberList (O1.6b class-members projection)', () => {
  it('projects a WireMemberList to camelCase, preserving the engine order and an unknown kind', () => {
    const reply: WireMemberList = {
      members: [
        { id: 'host-7', kind: 'endpoint', display_name: 'host-7', connection_count: 12 },
        {
          id: 'aig:agent:codex',
          kind: 'agent_instance',
          display_name: 'Codex',
          connection_count: 5,
        },
        // An unknown kind passes through honestly (the drawer labels what the engine attributed).
        { id: 'x', kind: 'quantum-relay', display_name: 'x', connection_count: 1 },
      ],
    };
    expect(toMemberList(reply)).toEqual({
      members: [
        { id: 'host-7', kind: 'endpoint', name: 'host-7', connectionCount: 12 },
        { id: 'aig:agent:codex', kind: 'agent_instance', name: 'Codex', connectionCount: 5 },
        { id: 'x', kind: 'quantum-relay', name: 'x', connectionCount: 1 },
      ],
    });
  });

  it('yields an empty list for a class with no members (no fabricated row)', () => {
    expect(toMemberList({ members: [] })).toEqual({ members: [] });
  });
});

describe('memberEntityRef (O1.6b member -> drawer ref)', () => {
  it('maps agent/user members to a principal ref (the agent directory the drawer reads)', () => {
    for (const kind of ['agent_instance', 'mcp_server', 'user']) {
      const ref = memberEntityRef({
        id: 'aig:agent:codex',
        kind,
        name: 'Codex',
        connectionCount: 1,
      });
      expect(ref.kind).toBe('principal');
      expect(ref.id).toBe('aig:agent:codex');
    }
  });

  it('maps every other member kind (device, network, store) to an object ref', () => {
    for (const kind of ['endpoint', 'network_destination', 'data_object']) {
      const ref = memberEntityRef({ id: '10.0.0.1:443', kind, name: 'x', connectionCount: 1 });
      expect(ref.kind).toBe('object');
      expect(ref.id).toBe('10.0.0.1:443');
    }
  });
});
