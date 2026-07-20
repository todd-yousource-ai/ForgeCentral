// apps/bff/test/operator-engine.test.ts -- F0.5b the operator Principal + authenticated engine facade.

import type { WireQueryRows, WireQuerySubmit } from '@forge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { OperatorSession } from '../src/auth/session.js';
import type { CrucibleClient } from '../src/engine/client.js';
import {
  createOperatorEngine,
  loggerDelegationSink,
  principalFromSession,
  type EngineDelegation,
  type OperatorPrincipal,
} from '../src/engine/index.js';

const rows: WireQueryRows = { cursor: null, redacted_fields: [], rows: [] };
const emptyRisk = { level: 'green', escalate: 0, candidate: 0, observe: 0 };
const admin: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** A minimal well-formed engine spec for the audited VTZ writes. */
const wireSpec = {
  name: 'YouSource.Corp',
  description: 'Corporate systems',
  zone_type: 'standard',
  own_postures: [{ domain: 'governed-egress', posture: 'deny', floor: true }],
  micro_segmentation: true,
  telemetry: 'full',
  reauth_interval_hours: 8,
  lifecycle: 'draft',
};

/** A CrucibleClient that records its calls (and the querySubmit requests) and returns scripted results. */
function recordingClient(overrides: Partial<CrucibleClient> = {}): {
  client: CrucibleClient;
  calls: string[];
  requests: WireQuerySubmit[];
  reads: Array<{ operator?: unknown }>;
} {
  const calls: string[] = [];
  const requests: WireQuerySubmit[] = [];
  const reads: Array<{ operator?: unknown }> = [];
  const client: CrucibleClient = {
    ping: () => Promise.resolve(),
    querySubmit: (req) => {
      calls.push(`querySubmit:${String(req.request_id)}`);
      requests.push(req);
      return Promise.resolve(rows);
    },
    cursorFetch: () => {
      calls.push('cursorFetch');
      return Promise.resolve(rows);
    },
    cursorClose: () => {
      calls.push('cursorClose');
      return Promise.resolve();
    },
    listAgents: (req) => {
      calls.push('listAgents');
      reads.push(req);
      return Promise.resolve({ agents: [] });
    },
    entityDecisions: (req) => {
      calls.push('entityDecisions');
      reads.push(req);
      return Promise.resolve({ decisions: [] });
    },
    entityConnections: (req) => {
      calls.push('entityConnections');
      reads.push(req);
      return Promise.resolve({ connections: [] });
    },
    connectivityGraph: (req) => {
      calls.push('connectivityGraph');
      reads.push(req);
      return Promise.resolve({
        sources: [],
        destinations: [],
        edges: [],
        risk: emptyRisk,
        vtzs: [],
        source_edges: [],
        dest_edges: [],
        top_destinations: [],
        truncated: false,
      });
    },
    connectivityMembers: (req) => {
      calls.push('connectivityMembers');
      reads.push(req);
      return Promise.resolve({ members: [] });
    },
    contain: (req) => {
      calls.push('contain');
      reads.push(req);
      return Promise.resolve({
        action: req.request.action,
        enforcement_active: false,
        summary: `${req.request.action} recorded`,
      });
    },
    logQuery: (req) => {
      calls.push('logQuery');
      reads.push(req);
      return Promise.resolve({ decisions: [] });
    },
    logExport: (req) => {
      calls.push('logExport');
      reads.push(req);
      return Promise.resolve({
        export_id: 'sha512:e1',
        commit_version: 7,
        row_count: 0,
        rows: [],
      });
    },
    vtzTree: (req) => {
      calls.push('vtzTree');
      reads.push(req);
      return Promise.resolve({ nodes: [], truncated: false });
    },
    vtzDetail: (req) => {
      calls.push('vtzDetail');
      reads.push(req);
      return Promise.resolve({ zone: null, ancestors: [], commit_version: 7 });
    },
    bundleCommit: (req) => {
      calls.push('bundleCommit');
      reads.push(req);
      return Promise.resolve({ version: 1, commit_version: 1 });
    },
    bundleConvergence: () => {
      calls.push('bundleConvergence');
      return Promise.resolve({ has_bundle: false, version: 0, members: [] });
    },
    vtzCreate: (req) => {
      calls.push('vtzCreate');
      reads.push(req);
      return Promise.resolve({ id: 'YouSource.New', lifecycle: 'draft' });
    },
    vtzEdit: (req) => {
      calls.push('vtzEdit');
      reads.push(req);
      return Promise.resolve({ id: 'YouSource.New', lifecycle: 'published' });
    },
    vtzRescope: (req) => {
      calls.push('vtzRescope');
      reads.push(req);
      return Promise.resolve({ id: 'YouSource.Moved', lifecycle: '' });
    },
    vtzDelete: (req) => {
      calls.push('vtzDelete');
      reads.push(req);
      return Promise.resolve({ id: 'YouSource.Gone', lifecycle: '' });
    },
    logExplain: (req) => {
      calls.push('logExplain');
      reads.push(req);
      return Promise.resolve({
        decision_id: 'sha512:d1',
        rule_id: 'LR-EX-001',
        finding: 'f',
        technique: 'T1059',
        tactics: [],
        evidence: [],
        confidence: 'HIGH',
        recommended_action: 'escalate',
        scope: 's',
        source_hosts: [],
        source_subjects: [],
        source_context: [],
        source_observations: [],
        correlation_id: 'c',
        replay_as_of: 1,
        watermark_seconds: 0,
        window_seconds: 0,
        replay_digest: '',
        created_at: 1,
      });
    },
    close: () => Promise.resolve(),
    ...overrides,
  };
  return { client, calls, requests, reads };
}

/** A delegation sink that captures what it recorded. */
function capturingSink(): {
  sink: { record: (d: EngineDelegation) => void };
  recorded: EngineDelegation[];
} {
  const recorded: EngineDelegation[] = [];
  return { sink: { record: (d) => recorded.push(d) }, recorded };
}

describe('principalFromSession', () => {
  it('carries the subject + tier + principalId + tenant', () => {
    const session: OperatorSession = {
      sessionId: 'x',
      subject: 'auth0|op',
      tier: 'Developer',
      principalId: 'principal-op',
      tenant: 'tenant-op',
      role: 'tenant-admin',
      expiresAt: 1,
    };
    expect(principalFromSession(session)).toEqual({
      subject: 'auth0|op',
      tier: 'Developer',
      principalId: 'principal-op',
      tenant: 'tenant-op',
    });
  });

  it('lets a global-admin scope the read to a chosen tenant (the tenant selector)', () => {
    const session: OperatorSession = {
      sessionId: 'x',
      subject: 'auth0|root',
      tier: 'Developer',
      principalId: 'principal-root',
      tenant: 'tenant-home',
      role: 'global-admin',
      expiresAt: 1,
    };
    expect(principalFromSession(session, 'tenant-acme').tenant).toBe('tenant-acme');
    // A blank/whitespace override falls back to the session's resolved tenant.
    expect(principalFromSession(session, '   ').tenant).toBe('tenant-home');
    expect(principalFromSession(session, undefined).tenant).toBe('tenant-home');
  });

  it('ignores a tenant override for a tenant-scoped operator (fail-closed)', () => {
    const session: OperatorSession = {
      sessionId: 'x',
      subject: 'auth0|op',
      tier: 'Developer',
      principalId: 'principal-op',
      tenant: 'tenant-op',
      role: 'tenant-admin',
      expiresAt: 1,
    };
    // A tenant-admin cannot switch tenants: the override is discarded, tenant stays pinned.
    expect(principalFromSession(session, 'tenant-other').tenant).toBe('tenant-op');
  });
});

describe('createOperatorEngine', () => {
  const submit: WireQuerySubmit = { request_id: 7, text: 'SELECT 1', params: [] };

  it('records the delegation, injects the operator, and delegates querySubmit', async () => {
    const { client, calls, requests } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    const out = await engine.querySubmit(admin, submit);
    expect(out).toBe(rows);
    expect(calls).toEqual(['querySubmit:7']);
    // The engine injects the operator delegation onto the request sent to the client (F0.5c).
    expect(requests[0]?.operator).toEqual({ principal: 'principal-op', tenant: 'tenant-op' });
    expect(recorded).toEqual([
      {
        operator: 'auth0|op',
        tier: 'Admin',
        action: 'querySubmit',
        requestId: 7,
        tenant: 'tenant-op',
      },
    ]);
  });

  it('injects the operator delegation + records it on a contain command (DR.5b)', async () => {
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    const effect = await engine.contain(admin, {
      // The request arrives WITHOUT an operator; the facade sets it from the principal (never
      // client-asserted), and the engine attributes the disposition to that operator.
      operator: null,
      request: {
        subject: 'aig:agent:a',
        action: 'Quarantine',
        reason: 'authored from a decision',
        command_id: 'cmd-1',
        issued_at: 1,
        derived_from_decision_id: 'sha512:d1',
        ai_assist: null,
      },
    });
    expect(effect.action).toBe('Quarantine');
    expect(effect.enforcement_active).toBe(false);
    expect(calls).toEqual(['contain']);
    // The facade injected the operator delegation onto the frame sent to the engine.
    expect((reads[0] as { operator?: unknown }).operator).toEqual({
      principal: 'principal-op',
      tenant: 'tenant-op',
    });
    // The brokered command was recorded as a delegation before it ran (audited attempt).
    expect(recorded).toEqual([
      { operator: 'auth0|op', tier: 'Admin', action: 'contain', tenant: 'tenant-op' },
    ]);
  });

  it('records the delegation + injects the operator on the three entity reads (DR.3d)', async () => {
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.listAgents(admin, { request_id: 1 });
    await engine.entityDecisions(admin, {
      request_id: 2,
      entity_type: 'host',
      entity_value: 'host-7',
      limit: 10,
    });
    await engine.entityConnections(admin, {
      request_id: 3,
      subject_kind: 'process',
      subject_id: 'host-7:pid:1',
      limit: 10,
    });

    expect(calls).toEqual(['listAgents', 'entityDecisions', 'entityConnections']);
    // The engine injects the operator delegation onto every entity read sent to the client (F0.5c).
    for (const read of reads) {
      expect(read.operator).toEqual({ principal: 'principal-op', tenant: 'tenant-op' });
    }
    expect(recorded.map((d) => d.action)).toEqual([
      'listAgents',
      'entityDecisions',
      'entityConnections',
    ]);
  });

  it('records the delegation + injects the operator on the connectivity graph read (O1.3)', async () => {
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    const graph = await engine.connectivityGraph(admin, {
      request_id: 9,
      operator: null,
      since: null,
      until: null,
      limit: 1000,
    });
    expect(graph.risk.level).toBe('green');
    expect(calls).toEqual(['connectivityGraph']);
    // The facade injects the operator delegation onto the tenant-wide read (never client-asserted).
    expect((reads[0] as { operator?: unknown }).operator).toEqual({
      principal: 'principal-op',
      tenant: 'tenant-op',
    });
    expect(recorded).toEqual([
      {
        operator: 'auth0|op',
        tier: 'Admin',
        action: 'connectivityGraph',
        requestId: 9,
        tenant: 'tenant-op',
      },
    ]);
  });

  it('records the delegation + injects the operator on the connectivity members read (O1.6b)', async () => {
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.connectivityMembers(admin, {
      request_id: 7,
      operator: null,
      class: 'devices',
      limit: 500,
    });
    expect(calls).toEqual(['connectivityMembers']);
    // The facade injects the operator delegation onto the class read (never client-asserted).
    expect((reads[0] as { operator?: unknown }).operator).toEqual({
      principal: 'principal-op',
      tenant: 'tenant-op',
    });
    expect(recorded).toEqual([
      {
        operator: 'auth0|op',
        tier: 'Admin',
        action: 'connectivityMembers',
        requestId: 7,
        tenant: 'tenant-op',
      },
    ]);
  });

  it('records the delegation + injects the operator on the LOG reads (LG.2)', async () => {
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.logQuery(admin, { request_id: 4, technique: 'T1059', limit: 25 });
    await engine.logExplain(admin, { request_id: 5, decision_id: 'sha512:d1' });
    await engine.logExport(admin, {
      operator: null,
      query: { request_id: 6, limit: 25 },
      command_id: 'cmd-1',
      issued_at: 1,
    });

    expect(calls).toEqual(['logQuery', 'logExplain', 'logExport']);
    // The operator delegation is injected onto every LOG op (never client-asserted).
    for (const read of reads) {
      expect(read.operator).toEqual({ principal: 'principal-op', tenant: 'tenant-op' });
    }
    expect(recorded.map((d) => d.action)).toEqual(['logQuery', 'logExplain', 'logExport']);
  });

  it('records the delegation + injects the operator on the VTZ reads (V2.2)', async () => {
    // The VTZ store is tenant-scoped governance data: the engine must narrow every zone read to the
    // acting operator's tenant, so the delegation is injected server-side and never client-asserted.
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.vtzTree(admin, { request_id: 7, operator: null, limit: 50 });
    await engine.vtzDetail(admin, { request_id: 8, operator: null, vtz_id: 'YouSource.Corp' });

    expect(calls).toEqual(['vtzTree', 'vtzDetail']);
    for (const read of reads) {
      expect(read.operator).toEqual({ principal: 'principal-op', tenant: 'tenant-op' });
    }
    expect(recorded.map((d) => d.action)).toEqual(['vtzTree', 'vtzDetail']);
  });

  it('records the delegation + injects the operator on every audited VTZ write (V2.3)', async () => {
    // The audit entry the engine writes is attributed to THIS operator in THIS tenant, so the delegation
    // is injected server-side on every mutation and is never client-asserted.
    const { client, calls, reads } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.vtzCreate(admin, { request_id: 9, operator: null, spec: wireSpec });
    await engine.vtzEdit(admin, { request_id: 10, operator: null, spec: wireSpec });
    await engine.vtzRescope(admin, {
      request_id: 11,
      operator: null,
      vtz_id: 'YouSource.Corp',
      new_name: 'YouSource.Ops',
    });
    await engine.vtzDelete(admin, { request_id: 12, operator: null, vtz_id: 'YouSource.Ops' });

    expect(calls).toEqual(['vtzCreate', 'vtzEdit', 'vtzRescope', 'vtzDelete']);
    for (const read of reads) {
      expect(read.operator).toEqual({ principal: 'principal-op', tenant: 'tenant-op' });
    }
    expect(recorded.map((d) => d.action)).toEqual([
      'vtzCreate',
      'vtzEdit',
      'vtzRescope',
      'vtzDelete',
    ]);
  });

  it('records cursorFetch + cursorClose delegations and delegates', async () => {
    const { client, calls } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.cursorFetch(admin, [1, 2, 3]);
    await engine.cursorClose(admin, [1, 2, 3]);
    expect(calls).toEqual(['cursorFetch', 'cursorClose']);
    expect(recorded.map((d) => d.action)).toEqual(['cursorFetch', 'cursorClose']);
  });

  it('records the attempt even when the engine refuses, and propagates the error', async () => {
    const refuse = (): Promise<never> => Promise.reject(new Error('Refused'));
    const { client } = recordingClient({ querySubmit: refuse });
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await expect(engine.querySubmit(admin, submit)).rejects.toThrow('Refused');
    // The delegation is traced before the call, so a refused attempt is still recorded.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.operator).toBe('auth0|op');
  });

  it('carries the tenant into both the delegation record and the injected request', async () => {
    const { client, requests } = recordingClient();
    const { sink, recorded } = capturingSink();
    const engine = createOperatorEngine(client, sink);

    await engine.querySubmit(
      { subject: 's', tier: 'User', principalId: 'principal-s', tenant: 't-1' },
      submit,
    );
    expect(recorded[0]?.tenant).toBe('t-1');
    expect(requests[0]?.operator).toEqual({ principal: 'principal-s', tenant: 't-1' });
  });
});

describe('loggerDelegationSink', () => {
  it('writes a structured engine-delegation line', () => {
    const info = vi.fn();
    loggerDelegationSink({ info }).record({
      operator: 'auth0|op',
      tier: 'SecurityAudit',
      action: 'querySubmit',
      requestId: 3,
    });
    expect(info).toHaveBeenCalledWith(
      {
        delegation: {
          operator: 'auth0|op',
          tier: 'SecurityAudit',
          action: 'querySubmit',
          requestId: 3,
        },
      },
      'engine delegation',
    );
  });
});
