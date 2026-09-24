// packages/contracts/test/settings-commit.test.ts -- IP-CONSOLE-11 ST.2a the settings commit narrowers.

import { describe, expect, it } from 'vitest';

import {
  toSectionPatch,
  isKeyEditable,
  refusalCauseLabel,
  toSettingsCommitRequest,
  toSettingsReceipt,
  toWireSettingsCommitFields,
} from '../src/settings.js';

describe('the settings commit contract (ST.2a, crdb SET.2)', () => {
  it('narrows a request body closed', () => {
    expect(
      toSettingsCommitRequest({ edits: [{ key: 'maintenance.cadence_secs', value: '120' }] }),
    ).toEqual({
      edits: [{ key: 'maintenance.cadence_secs', value: '120' }],
    });
    for (const bad of [
      null,
      {},
      { edits: [] },
      { edits: [], sections: {} },
      { edits: [{ key: 'Maintenance', value: '1' }] },
      { edits: [{ key: 'a.b', value: 1 }] },
      { edits: Array.from({ length: 65 }, () => ({ key: 'a.b', value: '1' })) },
    ]) {
      expect(toSettingsCommitRequest(bad)).toBeNull();
    }
    expect(toWireSettingsCommitFields({ edits: [{ key: 'a.b', value: '1' }] })).toEqual({
      edits: [{ key: 'a.b', value: '1' }],
    });
  });

  it('carries a refusal with every cause, an unknown one kept verbatim', () => {
    const receipt = toSettingsReceipt({
      version: 0,
      needs_restart: [],
      dual_control_required: false,
      refused_edits: [
        { key: 'admin_endpoint.max_payload_bytes', cause: 'boot_bound' },
        { key: 'x.y', cause: 'brand_new_cause', detail: 'd' },
      ],
      violations: [],
      refused: true,
      explanation: 'an edit was refused; nothing was committed',
    });
    expect(receipt.refused).toBe(true);
    const [boot, other] = receipt.refusedEdits;
    if (boot === undefined || other === undefined) {
      throw new Error('both refusals project');
    }
    expect(refusalCauseLabel(boot)).toBe('boot-bound: needs a restart, not editable here');
    expect(other.cause).toBe('other');
    expect(refusalCauseLabel(other)).toBe('refused (brand_new_cause)');
    expect(other.detail).toBe('d');
  });

  it('offers a key edit only on an editable knob that is not a capability set', () => {
    const base = {
      key: 'k.k',
      surface: 's',
      origin: 'knob' as const,
      value: '1',
      valueType: 'Ticks',
      defaultValue: '1',
      bound: 'b',
      liveApply: 'live',
      changeVia: 'v',
      uiBinding: 'u',
      summary: 's',
      editable: true,
    };
    expect(isKeyEditable(base)).toBe(true);
    expect(isKeyEditable({ ...base, valueType: 'CapabilitySet' })).toBe(false);
    expect(isKeyEditable({ ...base, origin: 'section' })).toBe(false);
    expect(isKeyEditable({ ...base, editable: false })).toBe(false);
  });
});

describe('the section patch contract (ST.2b, crdb SET.2b)', () => {
  it('narrows every section closed and compiles it to the wire', () => {
    const patch = toSectionPatch({
      dualControl: ['tenant-config'],
      egressDestinations: [{ id: 'frontier', ceiling: 'internal' }],
      sourceFormatMap: [{ source: 'fw-1', format: 'cef' }],
      socNarrativeModelRef: '',
    });
    expect(patch).not.toBeNull();
    const request = toSettingsCommitRequest({ sections: patch });
    expect(request).not.toBeNull();
    if (request === null) throw new Error('narrows');
    expect(toWireSettingsCommitFields(request)).toEqual({
      edits: [],
      sections: {
        dual_control: ['tenant-config'],
        egress_destinations: [{ id: 'frontier', ceiling: 'internal' }],
        source_format_map: [{ source: 'fw-1', format: 'cef' }],
        soc_narrative_model_ref: '',
      },
    });
  });

  it('refuses a malformed section before it leaves the BFF', () => {
    for (const bad of [
      {},
      { egressDestinations: [{ id: 'x', ceiling: 'top' }] },
      { egressDestinations: [{ id: ' ', ceiling: 'internal' }] },
      { dualControl: 'tenant-config' },
      { sourceFormatMap: [{ source: 'fw', format: '' }] },
      {
        lugExposure: {
          enabled: true,
          resolutionEnabled: true,
          maxAccountsPerNamespace: -1,
          maxGroupsPerNamespace: 1,
          maxSessionsPerDevice: 1,
          lastSeenBucketHours: 1,
          bindingConfirmThresholdPermille: 1,
          snapshotCadenceHours: 1,
        },
      },
    ]) {
      expect(toSectionPatch(bad)).toBeNull();
    }
  });
});
