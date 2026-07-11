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
const admin: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** A CrucibleClient that records its calls (and the querySubmit requests) and returns scripted results. */
function recordingClient(overrides: Partial<CrucibleClient> = {}): {
  client: CrucibleClient;
  calls: string[];
  requests: WireQuerySubmit[];
} {
  const calls: string[] = [];
  const requests: WireQuerySubmit[] = [];
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
    listAgents: () => Promise.resolve({ agents: [] }),
    entityDecisions: () => Promise.resolve({ decisions: [] }),
    entityConnections: () => Promise.resolve({ connections: [] }),
    close: () => Promise.resolve(),
    ...overrides,
  };
  return { client, calls, requests };
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
