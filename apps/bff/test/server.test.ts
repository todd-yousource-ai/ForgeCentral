// apps/bff/test/server.test.ts -- F0.3 tier-2 HTTP surface over a mocked engine seam.

import type { Server } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { EphemeralCache } from '../src/cache.js';
import type { BffConfig } from '../src/config.js';
import type { AuthRouter } from '../src/auth/router.js';
import type { OperatorSession } from '../src/auth/session.js';
import type { WireVtzTreeNode } from '@forge/contracts';

import type { CrucibleClient } from '../src/engine/client.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import { EngineRefusedError } from '../src/engine/wire-client.js';
import { createServer, type ServerDeps, type ServerLogger } from '../src/server.js';

const config: BffConfig = {
  engineHost: 'engine.internal',
  enginePort: 7878,
  httpPort: 0,
  logLevel: 'error',
  cacheTtlMs: 2000,
  cacheMaxEntries: 100,
  requestTimeoutMs: 1000,
  heartbeatIntervalMs: 20_000,
  session: {
    ttlMs: 3_600_000,
    cookieName: 'fc_session',
    cookieSecure: true,
    maxSessions: 4096,
    maxPendingLogins: 256,
  },
  rbac: { groupRoles: {}, localRbac: {} },
};

const silentLog: ServerLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** A CrucibleClient whose `ping` is scripted; the other methods reject (unused in these tests). */
function mockClient(ping: () => Promise<void>): CrucibleClient {
  const unused = (): Promise<never> => Promise.reject(new Error('not used in this test'));
  return {
    ping,
    querySubmit: unused,
    listAgents: unused,
    listPrincipals: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    listGroups: unused,
    objectList: unused,
    idamConnectors: unused,
    idamSync: unused,
    idamConnect: unused,
    idamConfigure: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    objectDetail: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    vtzTree: unused,
    vtzDetail: unused,
    vtzCreate: unused,
    bundleCommit: unused,
    bundleConvergence: unused,
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
    cursorFetch: unused,
    cursorClose: unused,
    close: () => Promise.resolve(),
  };
}

const operatorSession: OperatorSession = {
  sessionId: 's1',
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
  role: 'tenant-admin',
  expiresAt: Number.MAX_SAFE_INTEGER,
};

/** A minimal AuthRouter: it never claims a request (handle -> false) and resolves the given session. */
function authRouterWith(session: OperatorSession | undefined): AuthRouter {
  return { handle: () => Promise.resolve(false), resolveSession: () => session };
}

/** A minimal OperatorEngine: the directory carries one active agent with one capability edge. */
function operatorEngineWith(): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    listPrincipals: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    listGroups: unused,
    objectList: unused,
    idamConnectors: unused,
    idamSync: unused,
    idamConnect: unused,
    idamConfigure: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    objectDetail: unused,
    querySubmit: () =>
      Promise.resolve({
        rows: [
          [
            ['relation', { Text: 'USES_TOOL' }],
            ['target', { Text: 'tool:search' }],
          ],
        ],
        cursor: null,
        redacted_fields: [],
      }),
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: () =>
      Promise.resolve({
        agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
      }),
    entityDecisions: () => Promise.resolve({ decisions: [] }),
    entityConnections: () => Promise.resolve({ connections: [] }),
    connectivityGraph: () =>
      Promise.resolve({
        sources: [
          { class: 'agents', count: 3 },
          { class: 'users', count: 1 },
        ],
        destinations: [{ class: 'saas', count: 4 }],
        edges: [{ source_class: 'agents', dest_class: 'saas', weight: 4 }],
        risk: { level: 'yellow', escalate: 0, candidate: 2, observe: 5 },
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
      }),
    connectivityMembers: unused,
    // This route test does not exercise CONTAIN; fail loudly if it is reached (not a canned success).
    contain: unused,
    logQuery: () =>
      Promise.resolve({
        decisions: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-EX-001',
            finding: 'Suspicious command',
            tactics: ['TA0002'],
            technique: 'T1059',
            evidence: ['dc:process_creation'],
            confidence: 'HIGH',
            recommended_action: 'escalate',
            created_at: 1_700_000_000,
          },
        ],
      }),
    logExplain: () =>
      Promise.resolve({
        decision_id: 'sha512:d1',
        rule_id: 'LR-EX-001',
        finding: 'Suspicious command',
        technique: 'T1059',
        tactics: ['TA0002'],
        evidence: ['dc:process_creation'],
        confidence: 'HIGH',
        recommended_action: 'escalate',
        scope: 'host-7',
        source_hosts: ['host-7'],
        source_subjects: ['host-7:pid:1234'],
        source_context: [],
        source_observations: [],
        correlation_id: 'corr-1',
        replay_as_of: 42,
        watermark_seconds: 100,
        window_seconds: 60,
        replay_digest: 'sha512:rd',
        created_at: 1_700_000_000,
      }),
    logExport: () =>
      Promise.resolve({
        export_id: 'sha512:e1',
        commit_version: 42,
        row_count: 1,
        rows: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-EX-001',
            finding: 'Suspicious command',
            tactics: ['TA0002'],
            technique: 'T1059',
            evidence: ['dc:process_creation'],
            confidence: 'HIGH',
            recommended_action: 'escalate',
            created_at: 1_700_000_000,
          },
        ],
      }),
    vtzTree: () => Promise.resolve({ nodes: [wireZone()], truncated: false }),
    vtzDetail: () => Promise.resolve({ zone: wireZone(), ancestors: [], commit_version: 7 }),
    vtzCreate: () => Promise.resolve({ id: 'YouSource.New', lifecycle: 'draft' }),
    bundleCommit: () => Promise.resolve({ version: 1, commit_version: 1 }),
    bundleConvergence: () => Promise.resolve({ has_bundle: false, version: 0, members: [] }),
    vtzEdit: () => Promise.resolve({ id: 'YouSource.Corp', lifecycle: 'published' }),
    vtzRescope: () => Promise.resolve({ id: 'YouSource.Moved', lifecycle: '' }),
    vtzDelete: () => Promise.resolve({ id: 'YouSource.Corp', lifecycle: '' }),
  };
}

/** One engine zone: the full eleven-domain matrix with the catastrophic floor pair flagged by the engine. */
function wireZone(overrides: Partial<WireVtzTreeNode> = {}): WireVtzTreeNode {
  const postures = [
    { domain: 'governed-egress', posture: 'deny', floor: true },
    { domain: 'execution', posture: 'deny', floor: true },
    { domain: 'privilege-escalation', posture: 'deny', floor: false },
    { domain: 'kernel-module', posture: 'deny', floor: false },
    { domain: 'credential-store', posture: 'deny', floor: false },
    { domain: 'persistence', posture: 'permit-deny-risky', floor: false },
    { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
    { domain: 'file-and-config', posture: 'permit-deny-risky', floor: false },
    { domain: 'memory', posture: 'permit-deny-risky', floor: false },
    { domain: 'ipc', posture: 'permit-deny-risky', floor: false },
    { domain: 'device', posture: 'permit-deny-risky', floor: false },
  ];
  return {
    id: 'YouSource.Corp',
    name: 'YouSource.Corp',
    parent: 'YouSource',
    zone_type: 'standard',
    lifecycle: 'published',
    micro_segmentation: true,
    telemetry: 'full',
    reauth_interval_hours: 8,
    own_postures: postures,
    effective_postures: postures,
    sub_zone_count: 1,
    ...overrides,
  };
}

/** A well-formed authoring payload as the SPA would POST it. */
function authoredSpec(): Record<string, unknown> {
  return {
    name: 'YouSource.Corp',
    description: 'Corporate systems',
    zoneType: 'standard',
    ownPostures: [
      { domain: 'governed-egress', posture: 'deny', floor: true },
      { domain: 'execution', posture: 'deny', floor: true },
      { domain: 'ordinary-network', posture: 'permit-deny-risky', floor: false },
    ],
    microSegmentation: true,
    telemetry: 'full',
    reauthIntervalHours: 8,
    lifecycle: 'draft',
  };
}

const servers: Server[] = [];

function start(
  client: CrucibleClient,
  extra?: Pick<ServerDeps, 'authRouter' | 'operatorEngine'>,
): Promise<string> {
  const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
  const server = createServer({ config, log: silentLog, cache, client, ...extra });
  servers.push(server);
  return new Promise<string>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('no server address'));
        return;
      }
      resolve(`http://127.0.0.1:${String(address.port)}`);
    });
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('BFF HTTP surface', () => {
  it('GET /healthz is 200 ok (liveness)', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readyz is 200 when the engine ping resolves', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ready: true });
  });

  it('GET /readyz is 503 when the engine ping rejects (transport unwired / engine down)', async () => {
    const base = await start(mockClient(() => Promise.reject(new Error('unreachable'))));
    const res = await fetch(`${base}/readyz`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ready: false });
  });

  it('GET /openapi.json returns the OpenAPI 3.1 skeleton', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/openapi.json`);
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/readyz');
  });

  it('an unknown path is 404', async () => {
    const base = await start(mockClient(() => Promise.resolve()));
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
  });

  it('GET /api/entity/<kind>/<id> is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(undefined),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa`);
    expect(res.status).toBe(401);
  });

  it('GET /api/entity/<kind>/<id> resolves the live drawer detail for an operator (DR.3d-3)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    // The agent id carries colons; it is percent-encoded in the path and decoded server-side.
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      ref: { kind: string; id: string };
      header: { status: string; data?: { status: string; displayName: string } };
      capabilities: { status: string };
    };
    expect(detail.ref).toEqual({ kind: 'principal', id: 'aig:agent:a' });
    expect(detail.header.status).toBe('ok');
    expect(detail.header.data?.status).toBe('active');
    expect(detail.header.data?.displayName).toBe('aig:agent:a');
    // Capabilities resolve live from the agent_capabilities relation (VR.3), through the HTTP payload.
    expect(detail.capabilities.status).toBe('ok');
  });

  it('GET /api/logs brokers the LOG_QUERY read + projects the rows (LG.2)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/logs?technique=T1059&limit=25`);
    expect(res.status).toBe(200);
    const page = (await res.json()) as {
      rows: {
        decisionId: string;
        at: number;
        technique: string;
        outcome: string;
        status: string;
      }[];
    };
    expect(page.rows).toHaveLength(1);
    // created_at seconds -> millis; the row projects the real decision fields.
    expect(page.rows[0]?.at).toBe(1_700_000_000_000);
    expect(page.rows[0]?.technique).toBe('T1059');
    expect(page.rows[0]?.outcome).toBe('escalate');
    // `escalate` is the most severe advisory posture -> the `denied` (most severe) badge classification.
    expect(page.rows[0]?.status).toBe('denied');
  });

  it('GET /api/logs is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/logs`);
    expect(res.status).toBe(401);
  });

  it('GET /api/logs/explain/<id> brokers LOG_EXPLAIN + derives the acting entity (LG.2)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/logs/explain/sha512%3Ad1`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as {
      decisionId: string;
      scope: string;
      sourceSubjects: string[];
      actingEntity: { kind: string; id: string } | null;
    };
    expect(detail.decisionId).toBe('sha512:d1');
    expect(detail.scope).toBe('host-7');
    // The acting entity for the row -> drawer drill-in derives from the source subject.
    expect(detail.actingEntity).toEqual({ kind: 'principal', id: 'host-7:pid:1234' });
  });

  it('GET /api/logs/explain sanitizes an absent/denied decision to a non-oracle 404', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      logExplain: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/logs/explain/sha512%3Aabsent`);
    expect(res.status).toBe(404);
  });

  it('POST /api/logs/export brokers the audited export + returns the receipt + rows (LG.6)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/logs/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-1', filter: { technique: 'T1059', limit: 25 } }),
    });
    expect(res.status).toBe(200);
    const view = (await res.json()) as {
      exportId: string;
      commitVersion: number;
      rowCount: number;
      rows: { decisionId: string }[];
    };
    // The audited receipt (id + commit version) proves it landed on the chain; the rows are the audited set.
    expect(view.exportId).toBe('sha512:e1');
    expect(view.commitVersion).toBe(42);
    expect(view.rowCount).toBe(1);
    expect(view.rows[0]?.decisionId).toBe('sha512:d1');
  });

  it('POST /api/logs/export is 401 without a session and 400 on a malformed body', async () => {
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect(
      (await fetch(`${noSession}/api/logs/export`, { method: 'POST', body: '{}' })).status,
    ).toBe(401);

    const session = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    // A body missing commandId is a sanitized 400.
    expect(
      (
        await fetch(`${session}/api/logs/export`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ filter: { limit: 10 } }),
        })
      ).status,
    ).toBe(400);
  });

  it('GET /api/overview/sankey projects the VTZ-routed two-stage view model (RD.4)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/overview/sankey?limit=100`);
    expect(res.status).toBe(200);
    const sankey = (await res.json()) as {
      vtzs: { id: string; name: string; profile: string; risk: { level: string } }[];
      sourceEdges: { sourceClass: string; vtzId: string; weight: number }[];
      destEdges: { vtzId: string; destClass: string; weight: number }[];
      destinations: { class: string; count: number; apps: unknown[]; moreCount: number }[];
    };
    // The two-stage flow: each VTZ carries its own detection-driven risk; the edges are source->VTZ->dest.
    expect(sankey.vtzs).toEqual([
      {
        id: 'demo-public-agent',
        name: 'Demo.Public.Agent',
        profile: 'observe',
        risk: { level: 'red', escalate: 1, candidate: 0, observe: 0 },
      },
    ]);
    expect(sankey.sourceEdges).toEqual([
      { sourceClass: 'agents', vtzId: 'demo-public-agent', weight: 3 },
    ]);
    expect(sankey.destEdges).toEqual([
      { vtzId: 'demo-public-agent', destClass: 'saas', weight: 4 },
    ]);
    // No per-app breakdown on the wire yet -> apps empty, moreCount = the category count.
    // All four category rings render; the engine-side saas count merges into its ring.
    expect(sankey.destinations).toEqual([
      { class: 'network', count: 0, apps: [], moreCount: 0 },
      { class: 'saas', count: 4, apps: [], moreCount: 4 },
      { class: 'private-apps', count: 0, apps: [], moreCount: 0 },
      { class: 'data-stores', count: 0, apps: [], moreCount: 0 },
    ]);
  });

  it('GET /api/vtz/tree projects the zone tree from the crdb VTZ system of record (V2.2)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/vtz/tree`);
    expect(res.status).toBe(200);
    const tree = (await res.json()) as {
      zones: {
        id: string;
        name: string;
        parent: string | null;
        zoneType: string;
        lifecycle: string;
        subZoneCount: number;
        ownPostures: { domain: string; posture: string; floor: boolean }[];
      }[];
      truncated: boolean;
    };
    expect(tree.truncated).toBe(false);
    expect(tree.zones).toHaveLength(1);
    expect(tree.zones[0]?.name).toBe('YouSource.Corp');
    expect(tree.zones[0]?.zoneType).toBe('standard');
    expect(tree.zones[0]?.subZoneCount).toBe(1);
    // The catastrophic floor arrives flagged by the engine, floor pair first in render order.
    expect(tree.zones[0]?.ownPostures.slice(0, 2)).toEqual([
      { domain: 'governed-egress', posture: 'deny', floor: true },
      { domain: 'execution', posture: 'deny', floor: true },
    ]);
    // INV-CONSOLE-VTZ-REAL: no trust score is served on this surface, because the wire carries none.
    expect(JSON.stringify(tree)).not.toContain('trustScore');
  });

  it('GET /api/vtz/detail returns the zone + its ancestors, and 400 without an id', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/vtz/detail?id=YouSource.Corp`);
    expect(res.status).toBe(200);
    const detail = (await res.json()) as { zone: { name: string } | null; ancestors: unknown[] };
    expect(detail.zone?.name).toBe('YouSource.Corp');
    expect(detail.ancestors).toEqual([]);
    // A detail read without a zone id never reaches the engine.
    expect((await fetch(`${base}/api/vtz/detail`)).status).toBe(400);
  });

  it('GET /api/vtz/detail reports an unknown zone as an honest not-found, never an empty zone', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzDetail: () => Promise.resolve({ zone: null, ancestors: [], commit_version: 7 }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz/detail?id=No.Such.Zone`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ zone: null, ancestors: [], commitVersion: 7 });
  });

  it('GET /api/vtz/convergence projects the three endpoint states, and 400 without an id', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      bundleConvergence: () =>
        Promise.resolve({
          has_bundle: true,
          version: 7,
          members: [
            { endpoint_cn: 'a.box', state: 'applied' },
            { endpoint_cn: 'b.box', state: 'rejected', reason: 'SignatureInvalid' },
            { endpoint_cn: 'c.box', state: 'silent' },
          ],
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz/convergence?id=YouSource.Corp`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hasBundle: boolean;
      members: { endpointCn: string; state: string; reason: string | null }[];
    };
    expect(body.hasBundle).toBe(true);
    expect(body.members).toEqual([
      { endpointCn: 'a.box', state: 'applied', reason: null },
      { endpointCn: 'b.box', state: 'rejected', reason: 'SignatureInvalid' },
      { endpointCn: 'c.box', state: 'silent', reason: null },
    ]);
    // No zone id never reaches the engine.
    expect((await fetch(`${base}/api/vtz/convergence`)).status).toBe(400);
  });

  it('the VTZ reads are 401 without a session and 503 without an engine (fail-closed)', async () => {
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect((await fetch(`${noSession}/api/vtz/tree`)).status).toBe(401);
    expect((await fetch(`${noSession}/api/vtz/detail?id=YouSource.Corp`)).status).toBe(401);

    const noEngine = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
      },
    );
    expect((await fetch(`${noEngine}/api/vtz/tree`)).status).toBe(503);
  });

  it('GET /api/vtz/tree is 503 when the engine emits an enum tag the Console does not know', async () => {
    // Fail-closed: a governance surface reports unavailability rather than a guessed posture.
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzTree: () =>
        Promise.resolve({ nodes: [wireZone({ zone_type: 'restricted' })], truncated: false }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz/tree`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('GET /api/vtz/tree maps an engine refusal to a sanitized 403', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzTree: () =>
        Promise.reject(
          new EngineRefusedError({
            class: 'Denied',
            code: 7,
            retry: 'Never',
            correlation_id: 1234,
          }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz/tree`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refused', class: 'Denied' });
  });

  it('caches the VTZ tree per tenant so a warm projection never crosses tenants', async () => {
    // INV-CONSOLE-ENGINE-AUTHZ + INV-CONSOLE-NO-2ND-DB: the cache is a bounded-staleness projection keyed
    // by tenant, never a second copy of the store shared across them.
    const seen: string[] = [];
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzTree: (principal) => {
        seen.push(principal.tenant ?? '');
        return Promise.resolve({
          nodes: [wireZone({ id: principal.tenant ?? 'x', name: principal.tenant ?? 'x' })],
          truncated: false,
        });
      },
    };
    const globalAdminSession: OperatorSession = { ...operatorSession, role: 'global-admin' };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(globalAdminSession), operatorEngine: engine },
    );
    const first = await fetch(`${base}/api/vtz/tree`, { headers: { 'x-active-tenant': 'ten-a' } });
    const warm = await fetch(`${base}/api/vtz/tree`, { headers: { 'x-active-tenant': 'ten-a' } });
    const other = await fetch(`${base}/api/vtz/tree`, { headers: { 'x-active-tenant': 'ten-b' } });
    const names = async (r: Response) =>
      ((await r.json()) as { zones: { name: string }[] }).zones.map((z) => z.name);
    expect(await names(first)).toEqual(['ten-a']);
    expect(await names(warm)).toEqual(['ten-a']);
    expect(await names(other)).toEqual(['ten-b']);
    // The second ten-a read was served warm; ten-b never saw ten-a's projection.
    expect(seen).toEqual(['ten-a', 'ten-b']);
  });

  it('POST /api/vtz commits an authored zone through the audited path', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const res = await fetch(`${base}/api/vtz`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(authoredSpec()),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'YouSource.New', lifecycle: 'draft' });
  });

  it('edits, re-scopes, and deletes a zone on their own audited routes', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    const edit = await fetch(`${base}/api/vtz/YouSource.Corp`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(authoredSpec()),
    });
    expect(edit.status).toBe(200);
    expect(await edit.json()).toEqual({ id: 'YouSource.Corp', lifecycle: 'published' });

    const rescope = await fetch(`${base}/api/vtz/YouSource.Corp/rescope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ newName: 'YouSource.Moved' }),
    });
    expect(rescope.status).toBe(200);
    // Rescope commits with no lifecycle by design; the Console re-reads the moved zone.
    expect(await rescope.json()).toEqual({ id: 'YouSource.Moved', lifecycle: null });

    const removed = await fetch(`${base}/api/vtz/YouSource.Corp`, { method: 'DELETE' });
    expect(removed.status).toBe(200);
  });

  it('rejects a malformed or rule-breaking spec at the boundary, before the engine (400)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      // A malformed spec must never reach the engine at all.
      vtzCreate: () => Promise.reject(new Error('the engine must not be called')),
      bundleCommit: () => Promise.reject(new Error('unused')),
      bundleConvergence: () => Promise.reject(new Error('unused')),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const post = (body: unknown) =>
      fetch(`${base}/api/vtz`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    expect((await post({})).status).toBe(400);
    expect((await post({ ...authoredSpec(), zoneType: 'restricted' })).status).toBe(400);
    expect((await post({ ...authoredSpec(), telemetry: 'verbose' })).status).toBe(400);
    expect((await post({ ...authoredSpec(), lifecycle: 'archived' })).status).toBe(400);
    // The re-auth interval is bounded 1-24; the engine re-validates, but a bad one fails fast here.
    expect((await post({ ...authoredSpec(), reauthIntervalHours: 0 })).status).toBe(400);
    expect((await post({ ...authoredSpec(), reauthIntervalHours: 99 })).status).toBe(400);
    // An unknown object domain or posture tag cannot be half-understood into a spec.
    expect(
      (
        await post({
          ...authoredSpec(),
          ownPostures: [{ domain: 'wormhole', posture: 'deny', floor: false }],
        })
      ).status,
    ).toBe(400);
    // A re-scope with no new name never reaches the engine either.
    expect(
      (
        await fetch(`${base}/api/vtz/YouSource.Corp/rescope`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ newName: '  ' }),
        })
      ).status,
    ).toBe(400);
  });

  it('reports a floor or inheritance refusal as a 403 that names the rule class, not the cause', async () => {
    // The engine refuses to relax the read-only catastrophic floor and returns NO message (no oracle),
    // so the response names the CLASS of rule and never invents which zone or domain was at fault.
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzCreate: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
      bundleCommit: () => Promise.reject(new Error('unused')),
      bundleConvergence: () => Promise.reject(new Error('unused')),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(authoredSpec()),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refused', reason: 'denied' });
  });

  it('reports a state conflict (a zone that still has children) as a 409', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzDelete: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Conflict', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/vtz/YouSource.Corp`, { method: 'DELETE' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'refused', reason: 'conflict' });
  });

  it('drops the tenant cached zone tree after a write so the operator never sees a pre-write view', async () => {
    // INV-CONSOLE-NO-2ND-DB: the cache is a projection. If a write did not evict it, the operator's own
    // edit would appear not to have taken until the TTL elapsed.
    let zoneName = 'YouSource.Corp';
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      vtzTree: () =>
        Promise.resolve({ nodes: [wireZone({ id: zoneName, name: zoneName })], truncated: false }),
      vtzEdit: () => {
        zoneName = 'YouSource.Corp.Renamed';
        return Promise.resolve({ id: zoneName, lifecycle: 'published' });
      },
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const names = async () =>
      (
        (await (await fetch(`${base}/api/vtz/tree`)).json()) as { zones: { name: string }[] }
      ).zones.map((z) => z.name);

    expect(await names()).toEqual(['YouSource.Corp']);
    expect(await names()).toEqual(['YouSource.Corp']); // served warm
    await fetch(`${base}/api/vtz/YouSource.Corp`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(authoredSpec()),
    });
    // The write evicted this tenant's projections, so the next read reflects it.
    expect(await names()).toEqual(['YouSource.Corp.Renamed']);
  });

  it('the zone mutations are 401 without a session, 503 without an engine, 405 on a bad method', async () => {
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect((await fetch(`${noSession}/api/vtz`, { method: 'POST' })).status).toBe(401);
    expect((await fetch(`${noSession}/api/vtz/YouSource.Corp`, { method: 'DELETE' })).status).toBe(
      401,
    );

    const noEngine = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
      },
    );
    expect((await fetch(`${noEngine}/api/vtz`, { method: 'POST' })).status).toBe(503);

    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    // PUT on the collection and POST on a zone are not mutations this surface defines.
    expect((await fetch(`${base}/api/vtz`, { method: 'PUT' })).status).toBe(405);
    expect((await fetch(`${base}/api/vtz/YouSource.Corp`, { method: 'POST' })).status).toBe(405);
  });

  it('GET /api/overview/sankey is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect((await fetch(`${base}/api/overview/sankey`)).status).toBe(401);
  });

  it('GET /api/overview/entity-connections brokers ENTITY_CONNECTIONS + projects the list (O1.6a)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      entityConnections: () =>
        Promise.resolve({
          connections: [
            {
              destination_id: '93.184.216.34:443',
              destination_kind: 'network',
              observed_at: 1_700_000_000,
            },
          ],
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/overview/entity-connections?id=host-9&kind=device`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      connections: [
        {
          destinationId: '93.184.216.34:443',
          destinationKind: 'network',
          observedAt: 1_700_000_000,
        },
      ],
    });
  });

  it('GET /api/overview/entity-connections is 400 without id + kind, 401 without a session', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: operatorEngineWith() },
    );
    // Missing kind (and missing id) -> a sanitized 400, never a broker with a blank subject.
    expect((await fetch(`${base}/api/overview/entity-connections?id=host-9`)).status).toBe(400);
    expect((await fetch(`${base}/api/overview/entity-connections`)).status).toBe(400);
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(undefined), operatorEngine: operatorEngineWith() },
    );
    expect(
      (await fetch(`${noSession}/api/overview/entity-connections?id=host-9&kind=device`)).status,
    ).toBe(401);
  });

  it('GET /api/overview/entity-connections is 503 unwired and sanitizes a refusal to 403', async () => {
    const noEngine = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession) },
    );
    expect(
      (await fetch(`${noEngine}/api/overview/entity-connections?id=host-9&kind=device`)).status,
    ).toBe(503);

    const refusing: OperatorEngine = {
      ...operatorEngineWith(),
      entityConnections: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: refusing },
    );
    const res = await fetch(`${base}/api/overview/entity-connections?id=host-9&kind=device`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refused', class: 'Denied' });
  });

  it('GET /api/overview/entity-connections keys the cache by tenant + entity (no cross-entity reuse)', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      entityConnections: () => {
        hits += 1;
        return Promise.resolve({ connections: [] });
      },
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    // Same entity twice -> one engine hit (served warm the second time).
    expect(
      (await fetch(`${base}/api/overview/entity-connections?id=host-9&kind=device`)).status,
    ).toBe(200);
    expect(
      (await fetch(`${base}/api/overview/entity-connections?id=host-9&kind=device`)).status,
    ).toBe(200);
    expect(hits).toBe(1);
    // A different entity is a distinct key -> a fresh engine read.
    expect(
      (await fetch(`${base}/api/overview/entity-connections?id=host-8&kind=device`)).status,
    ).toBe(200);
    expect(hits).toBe(2);
  });

  it('GET /api/overview/members brokers CONNECTIVITY_MEMBERS + projects a source lane (O1.6b)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityMembers: () =>
        Promise.resolve({
          members: [
            { id: 'host-7', kind: 'endpoint', display_name: 'host-7', connection_count: 12 },
          ],
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    const res = await fetch(`${base}/api/overview/members?container=devices`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      members: [{ id: 'host-7', kind: 'endpoint', name: 'host-7', connectionCount: 12 }],
    });
  });

  it('GET /api/overview/members re-buckets a dest ring from the engine network members (O1.6b)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityMembers: (_p, request) =>
        Promise.resolve(
          request.class === 'network'
            ? {
                members: [
                  {
                    id: '10.0.0.5:5432',
                    kind: 'network_destination',
                    display_name: '10.0.0.5:5432',
                    connection_count: 9,
                  },
                  {
                    id: '93.184.216.34:443',
                    kind: 'network_destination',
                    display_name: '93.184.216.34:443',
                    connection_count: 2,
                  },
                ],
              }
            : { members: [] },
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    // The `data-stores` ring keeps only the Postgres endpoint (port 5432), relabeled to its brand.
    const res = await fetch(`${base}/api/overview/members?container=data-stores`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      members: [
        {
          id: '10.0.0.5:5432',
          kind: 'network_destination',
          name: 'Postgres',
          connectionCount: 9,
        },
      ],
    });
  });

  it('GET /api/overview/members is 400 for a missing or unknown container, 401 without a session', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    // Missing container -> 400, never a broker with a blank class.
    expect((await fetch(`${base}/api/overview/members`)).status).toBe(400);
    // A container that is neither a source lane nor a dest ring -> 400 (validated before broker).
    expect((await fetch(`${base}/api/overview/members?container=servers`)).status).toBe(400);
    const noSession = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(undefined),
        operatorEngine: operatorEngineWith(),
      },
    );
    expect((await fetch(`${noSession}/api/overview/members?container=devices`)).status).toBe(401);
  });

  it('GET /api/overview/members is 503 unwired and sanitizes a refusal to 403', async () => {
    const noEngine = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
      },
    );
    expect((await fetch(`${noEngine}/api/overview/members?container=devices`)).status).toBe(503);

    const refusing: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityMembers: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: refusing,
      },
    );
    const res = await fetch(`${base}/api/overview/members?container=devices`);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'refused', class: 'Denied' });
  });

  it('GET /api/overview/members keys the cache by tenant + container (no cross-container reuse)', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityMembers: () => {
        hits += 1;
        return Promise.resolve({ members: [] });
      },
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    // Same container twice -> one engine hit (served warm the second time).
    expect((await fetch(`${base}/api/overview/members?container=devices`)).status).toBe(200);
    expect((await fetch(`${base}/api/overview/members?container=devices`)).status).toBe(200);
    expect(hits).toBe(1);
    // A different container is a distinct key -> a fresh engine read.
    expect((await fetch(`${base}/api/overview/members?container=agents`)).status).toBe(200);
    expect(hits).toBe(2);
  });

  it('GET /api/overview/sankey is 503 when the operator engine is not wired', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession) },
    );
    const res = await fetch(`${base}/api/overview/sankey`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'engine_unavailable' });
  });

  it('GET /api/overview/sankey fails closed to 503 unavailable on an unknown VTZ risk-band tag', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      // An engine risk-band level the Console does not know must never be silently mis-colored.
      connectivityGraph: () =>
        Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [
            {
              id: 'demo-public-agent',
              name: 'Demo.Public.Agent',
              profile: 'observe',
              risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
            },
          ],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    const res = await fetch(`${base}/api/overview/sankey`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });

  it('GET /api/overview/sankey serves an identical query from the short-TTL cache', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityGraph: () => {
        hits += 1;
        return Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        });
      },
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      { authRouter: authRouterWith(operatorSession), operatorEngine: engine },
    );
    expect((await fetch(`${base}/api/overview/sankey?limit=100`)).status).toBe(200);
    expect((await fetch(`${base}/api/overview/sankey?limit=100`)).status).toBe(200);
    // The second identical read is served from the cache; the engine is hit exactly once.
    expect(hits).toBe(1);
    // A different window is a distinct cache key -> a fresh engine read.
    expect((await fetch(`${base}/api/overview/sankey?limit=200`)).status).toBe(200);
    expect(hits).toBe(2);
  });

  it('GET /api/overview/sankey keys the cache by tenant so a graph never leaks across tenants', async () => {
    let hits = 0;
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      connectivityGraph: () => {
        hits += 1;
        return Promise.resolve({
          sources: [],
          destinations: [],
          edges: [],
          risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
          vtzs: [],
          source_edges: [],
          dest_edges: [],
          top_destinations: [],
          truncated: false,
        });
      },
    };
    // One server, two operators in different tenants (the resolved session flips between requests).
    let current: OperatorSession = operatorSession;
    const router: AuthRouter = {
      handle: () => Promise.resolve(false),
      resolveSession: () => current,
    };
    const cache = new EphemeralCache<unknown>(config.cacheTtlMs, config.cacheMaxEntries);
    const server = createServer({
      config,
      log: silentLog,
      cache,
      client: mockClient(() => Promise.resolve()),
      authRouter: router,
      operatorEngine: engine,
    });
    servers.push(server);
    const base = await new Promise<string>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') return reject(new Error('no address'));
        resolve(`http://127.0.0.1:${String(address.port)}`);
      });
    });
    expect((await fetch(`${base}/api/overview/sankey?limit=100`)).status).toBe(200);
    current = { ...operatorSession, tenant: 'tenant-two' };
    expect((await fetch(`${base}/api/overview/sankey?limit=100`)).status).toBe(200);
    // Same bounds, different tenant -> a distinct cache key -> the engine is read again (no cross-tenant reuse).
    expect(hits).toBe(2);
  });

  it('POST /api/entity/<kind>/<id>/isolate brokers the containment + returns the honest effect (DR.5c)', async () => {
    // The engine records the disposition and returns the effect; enforcement is off (AG.7).
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      contain: (_principal, req) =>
        Promise.resolve({
          action: req.request.action,
          enforcement_active: false,
          summary: `${req.request.action} recorded; enforcement off`,
        }),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'cmd-1', posture: 'quarantine' }),
    });
    expect(res.status).toBe(200);
    const effect = (await res.json()) as {
      posture: string;
      enforcementActive: boolean;
      summary: string;
    };
    expect(effect.posture).toBe('quarantine');
    expect(effect.enforcementActive).toBe(false);
  });

  it('POST isolate is 401 without an operator session (fail-closed)', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(undefined),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'quarantine' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST isolate sanitizes an engine refusal to a typed 403 (beyond-tier / no delegation)', async () => {
    const engine: OperatorEngine = {
      ...operatorEngineWith(),
      contain: () =>
        Promise.reject(
          new EngineRefusedError({ class: 'Denied', code: 2, retry: 'Never', correlation_id: 0 }),
        ),
    };
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: engine,
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'deny' }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; class: string };
    expect(body.class).toBe('Denied');
  });

  it('POST isolate rejects a malformed body (bad posture) with 400', async () => {
    const base = await start(
      mockClient(() => Promise.resolve()),
      {
        authRouter: authRouterWith(operatorSession),
        operatorEngine: operatorEngineWith(),
      },
    );
    const res = await fetch(`${base}/api/entity/principal/aig%3Aagent%3Aa/isolate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: 'c', posture: 'nuke' }),
    });
    expect(res.status).toBe(400);
  });
});
