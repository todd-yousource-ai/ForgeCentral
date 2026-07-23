// apps/bff/test/idam.test.ts -- IP-CONSOLE-04 ID.2 tier-2 tests for the External IDAM read resolver.
//
// Proves the ID.2 slice of INV-CONSOLE-IDAM-CONNECTORS-REAL: `idam.connectors` projects the engine's
// connector list into cards; an unfederated node (empty list) resolves an honest empty (never an
// error); the fail-closed card state survives the resolver (an unrecognized completeness renders
// `unknown`, never `healthy`).

import { describe, expect, it } from 'vitest';
import type { WireIdamConnectorList, WireIdamConnectorRecord } from '@forge/contracts';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import { resolveIdamConnect, resolveIdamConnectors, resolveIdamSync } from '../src/engine/idam.js';
import { EngineRefusedError } from '../src/engine/wire-client.js';

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

const connector = (overrides: Partial<WireIdamConnectorRecord> = {}): WireIdamConnectorRecord => ({
  provider: 'auth0',
  display_name: 'Auth0',
  provider_tenant: 'dev-6rcwumbp1tsae8me.us.auth0.com',
  enabled: true,
  running: false,
  last_completeness: 'complete',
  last_error: null,
  last_sync_unix_ms: 1_700_000_000_000,
  objects_synced: 20,
  poll_interval_secs: 300,
  full_sync_cadence_hours: 24,
  ...overrides,
});

function engineWith(
  list: WireIdamConnectorList,
  sync?: OperatorEngine['idamSync'],
  connect?: OperatorEngine['idamConnect'],
): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  return {
    idamConnectors: () => Promise.resolve(list),
    idamSync: sync ?? (() => Promise.resolve({ provider: 'auth0' })),
    idamConnect: connect ?? (() => Promise.resolve({ commit_version: 3 })),
    objectList: unused,
    objectDetail: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    querySubmit: unused,
    cursorFetch: unused,
    cursorClose: unused,
    listAgents: unused,
    listPrincipals: unused,
    listGroups: unused,
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    entityDecisions: unused,
    entityConnections: unused,
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    usageOverview: unused,
    vtzTree: unused,
    vtzDetail: unused,
    bundleConvergence: unused,
    distributeBundle: unused,
    vtzCreate: unused,
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
  } as unknown as OperatorEngine;
}

describe('resolveIdamConnectors', () => {
  it('projects a healthy connector card from the engine record', () => {
    const engine = engineWith({ connectors: [connector()] });
    return resolveIdamConnectors(engine, PRINCIPAL).then((cards) => {
      expect(cards).toHaveLength(1);
      expect(cards[0]?.connectorId).toBe('auth0');
      expect(cards[0]?.providerTenant).toBe('dev-6rcwumbp1tsae8me.us.auth0.com');
      expect(cards[0]?.state).toBe('healthy');
      expect(cards[0]?.lastSyncAt).toBe(1_700_000_000_000);
      expect(cards[0]?.objectsSynced).toBe(20);
    });
  });

  it('an unfederated node (empty list) resolves an honest empty, never an error', () => {
    return resolveIdamConnectors(engineWith({ connectors: [] }), PRINCIPAL).then((cards) => {
      expect(cards).toEqual([]);
    });
  });

  it('renders Never (null), not an epoch, when the connector has never synced', () => {
    const engine = engineWith({
      connectors: [connector({ last_sync_unix_ms: null, last_completeness: null })],
    });
    return resolveIdamConnectors(engine, PRINCIPAL).then((cards) => {
      expect(cards[0]?.lastSyncAt).toBeNull();
      expect(cards[0]?.state).toBe('never-synced');
    });
  });

  it('never renders a green card on an unrecognized completeness (fail-closed survives the resolver)', () => {
    const engine = engineWith({ connectors: [connector({ last_completeness: 'mostly-ok' })] });
    return resolveIdamConnectors(engine, PRINCIPAL).then((cards) => {
      expect(cards[0]?.state).toBe('unknown');
      expect(cards[0]?.state).not.toBe('healthy');
    });
  });
});

describe('resolveIdamSync', () => {
  it('acks a queued sync, naming the provider (an ACK, not a result)', () => {
    const engine = engineWith({ connectors: [] }, () => Promise.resolve({ provider: 'auth0' }));
    return resolveIdamSync(engine, PRINCIPAL, 'auth0').then((receipt) => {
      expect(receipt).toEqual({ provider: 'auth0' });
    });
  });

  it('propagates the engine refusal for a disabled/unconfigured connector (Conflict)', () => {
    const engine = engineWith({ connectors: [] }, () =>
      Promise.reject(
        new EngineRefusedError({ class: 'Conflict', code: 0, retry: 'Never', correlation_id: 0 }),
      ),
    );
    return expect(resolveIdamSync(engine, PRINCIPAL, 'auth0')).rejects.toBeInstanceOf(
      EngineRefusedError,
    );
  });

  it('propagates a tier/delegation denial (Denied)', () => {
    const engine = engineWith({ connectors: [] }, () =>
      Promise.reject(
        new EngineRefusedError({ class: 'Denied', code: 0, retry: 'Never', correlation_id: 0 }),
      ),
    );
    return resolveIdamSync(engine, PRINCIPAL, 'auth0').catch((err: unknown) => {
      expect(err).toBeInstanceOf(EngineRefusedError);
      expect((err as EngineRefusedError).wireError.class).toBe('Denied');
    });
  });
});

describe('resolveIdamConnect', () => {
  const draft = {
    provider: 'auth0',
    domain: 'dev-x.us.auth0.com',
    clientId: 'abc123',
    audience: '',
  };

  it('sends connectivity + the secret ref and returns the audited commit version', () => {
    let sent: unknown;
    const engine = engineWith({ connectors: [] }, undefined, (_p, request) => {
      sent = request;
      return Promise.resolve({ commit_version: 5 });
    });
    return resolveIdamConnect(engine, PRINCIPAL, draft, '/etc/cdb/secrets/auth0.secret').then(
      (receipt) => {
        expect(receipt).toEqual({ commitVersion: 5 });
        const req = sent as Record<string, unknown>;
        expect(req['domain']).toBe('dev-x.us.auth0.com');
        expect(req['client_id']).toBe('abc123');
        expect(req['client_secret_ref']).toBe('/etc/cdb/secrets/auth0.secret');
        // The secret VALUE is never in the wire request -- only the path reference.
        for (const key of Object.keys(req)) {
          expect(key.toLowerCase()).not.toMatch(/password|token/);
        }
      },
    );
  });

  it('propagates the engine refusal (a bad secret file / unconfigured connector is Conflict)', () => {
    const engine = engineWith({ connectors: [] }, undefined, () =>
      Promise.reject(
        new EngineRefusedError({ class: 'Conflict', code: 0, retry: 'Never', correlation_id: 0 }),
      ),
    );
    return expect(
      resolveIdamConnect(engine, PRINCIPAL, draft, '/etc/cdb/secrets/auth0.secret'),
    ).rejects.toBeInstanceOf(EngineRefusedError);
  });
});
