// packages/contracts/test/settings.test.ts -- IP-CONSOLE-11 ST.1 the governed settings narrowers.

import { describe, expect, it } from 'vitest';

import {
  adminRoleLabel,
  settingApplyClass,
  settingSourceLabel,
  toConsoleRbacView,
  toSettingsView,
} from '../src/settings.js';

const row = (key: string, origin: string, liveApply: string, value?: string) => ({
  key,
  surface: 'maintenance',
  origin,
  ...(value === undefined ? {} : { value }),
  value_type: 'ticks',
  default_value: '60',
  bound: '> 0',
  live_apply: liveApply,
  change_via: 'config-commit / config-apply',
  ui_binding: `console:settings/maintenance/${key}`,
  summary: 'The maintenance cadence.',
  editable: liveApply.startsWith('live'),
});

const wire = {
  version: 7,
  rows: [
    row('maintenance.cadence_secs', 'knob', 'live (the maintenance engine)', '120'),
    row(
      'admin_endpoint.max_payload_bytes',
      'knob',
      'boot-bound (a change needs a restart)',
      '65536',
    ),
    row('CDB_EMBED_TEI', 'env', 'env (deprecated fallback)'),
  ],
  surfaces: ['maintenance', 'admin_endpoint'],
  dual_control_required: false,
  refused: false,
};

describe('the governed settings view (ST.1, crdb SET.1 INV-SETTINGS-TIER-GATED)', () => {
  it('projects every row with the engine rendering and the engine editable flag', () => {
    const view = toSettingsView(wire);
    expect(view?.version).toBe(7);
    expect(view?.rows.map((r) => [r.key, r.value, r.editable])).toEqual([
      ['maintenance.cadence_secs', '120', true],
      ['admin_endpoint.max_payload_bytes', '65536', false],
      ['CDB_EMBED_TEI', null, false],
    ]);
    expect(view?.sectionValues).toBeNull();
  });

  it('refuses a refusal and an origin this build does not know', () => {
    expect(toSettingsView({ ...wire, refused: true })).toBeNull();
    expect(toSettingsView({ ...wire, rows: [row('x', 'unknown', 'live')] })).toBeNull();
  });

  it('labels the source and the apply class from the engine own fields', () => {
    const view = toSettingsView(wire);
    const [cadence, payload, env] = view?.rows ?? [];
    if (cadence === undefined || payload === undefined || env === undefined) {
      throw new Error('the fixture narrows');
    }
    expect(settingSourceLabel(cadence, 7)).toBe('committed at version 7');
    expect(settingSourceLabel(cadence, 0)).toBe('fail-closed default (nothing committed)');
    expect(settingSourceLabel(env, 7)).toBe('node environment at boot');
    expect(settingApplyClass(cadence)).toBe('live');
    expect(settingApplyClass(payload)).toBe('boot-bound');
    expect(settingApplyClass(env)).toBe('fixed');
  });

  it('projects the section values only when every field is present', () => {
    const view = toSettingsView({
      ...wire,
      section_values: {
        dual_control: ['audit-export'],
        egress_destinations: [{ id: 'frontier', ceiling: 'internal' }],
        lug_exposure: {
          enabled: true,
          resolution_enabled: true,
          max_accounts_per_namespace: 1,
          max_groups_per_namespace: 1,
          max_sessions_per_device: 1,
          last_seen_bucket_hours: 1,
          binding_confirm_threshold_permille: 900,
          snapshot_cadence_hours: 24,
        },
        disabled_decoder_families: [],
        source_format_map: [],
        soc_narrative_model_ref: '',
      },
    });
    expect(view?.sectionValues?.dualControl).toEqual(['audit-export']);
    expect(view?.sectionValues?.socNarrativeModelRef).toBeNull();
    expect(
      toSettingsView({ ...wire, section_values: { dual_control: [] } })?.sectionValues,
    ).toBeNull();
  });

  it('projects the identity sections typed, never from the ambiguous rendering (SET.1b)', () => {
    expect(toSettingsView(wire)?.identity).toBeNull();
    const tricky = 'proxy:alice;mallory=[Root]@Secret';
    const view = toSettingsView({
      ...wire,
      identity_values: {
        admins: [{ identity: tricky, roles: ['auditor', 'operator'], clearance: 'confidential' }],
        sso_group_roles: [{ group: 'soc-admins', roles: ['tenantadmin'] }],
      },
    });
    expect(view?.identity).toEqual({
      admins: [{ identity: tricky, roles: ['auditor', 'operator'], clearance: 'confidential' }],
      ssoGroupRoles: [{ group: 'soc-admins', roles: ['tenantadmin'] }],
    });
    expect(adminRoleLabel('securityadmin')).toBe('Security admin');
    expect(adminRoleLabel('futurerole')).toBe('futurerole');
  });
});

describe('the Console role map view (ST.3)', () => {
  it('narrows the BFF body and fails closed on an unknown role or shape', () => {
    const body = {
      groupRoles: [{ key: 'fc-admins', role: 'global-admin', tenant: null }],
      localRbac: [{ key: 'auth0|abc', role: 'tenant-user', tenant: 't1' }],
      defaultTenant: 't1',
    };
    expect(toConsoleRbacView(body)).toEqual(body);
    expect(
      toConsoleRbacView({ ...body, groupRoles: [{ key: 'x', role: 'superuser', tenant: null }] }),
    ).toBeNull();
    expect(toConsoleRbacView({ ...body, localRbac: 'nope' })).toBeNull();
    expect(toConsoleRbacView(null)).toBeNull();
  });
});
