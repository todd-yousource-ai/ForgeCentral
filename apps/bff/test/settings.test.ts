// apps/bff/test/settings.test.ts -- IP-CONSOLE-11 ST.1 the governed settings resolver.

import { describe, expect, it } from 'vitest';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';
import {
  SettingsUnavailableError,
  resolveSettings,
  resolveSettingsCommit,
  resolveSettingsReports,
} from '../src/engine/settings.js';

const PRINCIPAL = {
  principal: '00000000-0000-0000-0000-000000000001',
  tenant: '00000000-0000-0000-0000-000000000002',
} as unknown as OperatorPrincipal;

function engineOf(reply: unknown, seen: unknown[] = []): OperatorEngine {
  return {
    settingsRead: (_principal: OperatorPrincipal, request: unknown) => {
      seen.push(request);
      return Promise.resolve(reply);
    },
  } as unknown as OperatorEngine;
}

const row = {
  key: 'maintenance.cadence_secs',
  surface: 'maintenance',
  origin: 'knob',
  value: '120',
  value_type: 'ticks',
  default_value: '60',
  bound: '> 0',
  live_apply: 'live (the maintenance engine)',
  change_via: 'config-commit / config-apply',
  ui_binding: 'console:settings/maintenance/cadence_secs',
  summary: 'The maintenance cadence.',
  editable: true,
};

describe('the governed settings resolver (ST.1, crdb SET.1)', () => {
  it('asks for the surface and projects the engine rendering', async () => {
    const seen: unknown[] = [];
    const view = await resolveSettings(
      engineOf(
        {
          version: 3,
          rows: [row],
          surfaces: ['maintenance'],
          dual_control_required: false,
          refused: false,
        },
        seen,
      ),
      PRINCIPAL,
      'maintenance',
    );
    expect((seen[0] as { surface: string }).surface).toBe('maintenance');
    expect(view?.rows[0]?.value).toBe('120');
    await resolveSettings(
      engineOf(
        { version: 0, rows: [], surfaces: [], dual_control_required: false, refused: false },
        seen,
      ),
      PRINCIPAL,
      null,
    );
    expect(seen[1]).not.toHaveProperty('surface');
  });

  it('maps the tier refusal to null and an unknown origin to unavailable', async () => {
    expect(
      await resolveSettings(engineOf({ rows: [], surfaces: [], refused: true }), PRINCIPAL, null),
    ).toBeNull();
    await expect(
      resolveSettings(
        engineOf({
          version: 1,
          rows: [{ ...row, origin: 'oracle' }],
          surfaces: [],
          dual_control_required: false,
          refused: false,
        }),
        PRINCIPAL,
        null,
      ),
    ).rejects.toBeInstanceOf(SettingsUnavailableError);
  });
});

describe('the settings commit resolver (ST.2a, crdb SET.2)', () => {
  it('sends the edits and returns the engine receipt, a refusal included', async () => {
    const seen: unknown[] = [];
    const engine = {
      settingsCommit: (_principal: OperatorPrincipal, request: unknown) => {
        seen.push(request);
        return Promise.resolve({
          version: 0,
          needs_restart: [],
          dual_control_required: false,
          refused_edits: [{ key: 'admin_endpoint.max_payload_bytes', cause: 'boot_bound' }],
          violations: [],
          refused: true,
          explanation: 'an edit was refused; nothing was committed',
        });
      },
    } as unknown as OperatorEngine;
    const receipt = await resolveSettingsCommit(engine, PRINCIPAL, {
      edits: [{ key: 'admin_endpoint.max_payload_bytes', value: '8192' }],
    });
    expect((seen[0] as { edits: unknown[] }).edits).toEqual([
      { key: 'admin_endpoint.max_payload_bytes', value: '8192' },
    ]);
    expect(receipt.refused).toBe(true);
    expect(receipt.refusedEdits[0]?.cause).toBe('boot_bound');
  });
});

describe('the settings reports resolver (crdb SET.4)', () => {
  it('asks for exactly the named reports and projects them; a refusal is null', async () => {
    const seen: unknown[] = [];
    const engine = {
      settingsReports: (_principal: OperatorPrincipal, request: unknown) => {
        seen.push(request);
        return Promise.resolve({
          admin_plane: true,
          refused: false,
          connectivity: {
            listen_addr: '127.0.0.1:7440',
            mutual_tls: true,
            identities_bound: 2,
            post_quantum_kx: true,
            crypto_provider: 'aws-lc-rs',
            fips_module: false,
          },
        });
      },
    } as unknown as OperatorEngine;
    const view = await resolveSettingsReports(engine, PRINCIPAL, ['connectivity']);
    expect((seen[0] as { reports: string[] }).reports).toEqual(['connectivity']);
    expect(view?.adminPlane).toBe(true);
    expect(view?.connectivity).toEqual({
      listenAddr: '127.0.0.1:7440',
      mutualTls: true,
      identitiesBound: 2,
      postQuantumKx: true,
      cryptoProvider: 'aws-lc-rs',
      fipsModule: false,
    });
    expect(view?.security).toBeNull();
    const refused = {
      settingsReports: () => Promise.resolve({ admin_plane: false, refused: true }),
    } as unknown as OperatorEngine;
    expect(await resolveSettingsReports(refused, PRINCIPAL, ['server'])).toBeNull();
  });
});
