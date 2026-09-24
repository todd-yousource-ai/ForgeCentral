// packages/contracts/src/settings.ts -- the governed settings view (IP-CONSOLE-11 ST.1 over crdb
// IP-CONSOLE-SETTINGS-WIRE SET.1 / SET.2b, `SETTINGS_READ`).
//
// Every row is the engine's registry entry beside the committed value in the ENGINE's own rendering
// (the renderer `cdb-actl config-get-key` and the config diff use), so the Console never renders a
// value itself. The narrowers fail closed: an unknown origin refuses the whole view rather than
// guessing whether a setting is committed, boot configuration, or a constant.

import type {
  WireEgressSetting,
  WireLugExposureSettings,
  WireSectionPatch,
  WireSettingRow,
  WireSettings,
  WireSourceFormatMapping,
} from './generated/wire-dto.js';

/** Where a setting's value lives (crdb SET.1 `origin`). */
export const SETTING_ORIGINS = ['knob', 'section', 'env', 'const'] as const;
export type SettingOrigin = (typeof SETTING_ORIGINS)[number];

/** One governed setting as the engine serves it. */
export interface SettingRow {
  readonly key: string;
  readonly surface: string;
  readonly origin: SettingOrigin;
  /** The engine's rendering of the committed value; null for env / const origins. */
  readonly value: string | null;
  readonly valueType: string;
  readonly defaultValue: string;
  readonly bound: string;
  /** How a change applies, as the registry states it (`live (...)`, `boot-bound (...)`, `pending (...)`). */
  readonly liveApply: string;
  /** The admin verb that changes it. */
  readonly changeVia: string;
  readonly uiBinding: string;
  readonly summary: string;
  /** True when the engine accepts an edit to it through `SETTINGS_COMMIT` today. */
  readonly editable: boolean;
}

/** The typed current values of the live sections the engine lets the Console patch (SET.2b). */
export interface SectionValues {
  readonly dualControl: readonly string[];
  readonly egressDestinations: readonly { readonly id: string; readonly ceiling: string }[];
  readonly lugExposure: {
    readonly enabled: boolean;
    readonly resolutionEnabled: boolean;
    readonly maxAccountsPerNamespace: number;
    readonly maxGroupsPerNamespace: number;
    readonly maxSessionsPerDevice: number;
    readonly lastSeenBucketHours: number;
    readonly bindingConfirmThresholdPermille: number;
    readonly snapshotCadenceHours: number;
  };
  readonly disabledDecoderFamilies: readonly string[];
  readonly sourceFormatMap: readonly { readonly source: string; readonly format: string }[];
  /** Null when no narrative model is bound. */
  readonly socNarrativeModelRef: string | null;
}

/** The governed settings read. */
export interface SettingsView {
  /** The store version the values were read at (0 = nothing committed: fail-closed defaults). */
  readonly version: number;
  readonly rows: readonly SettingRow[];
  /** Every registry surface, as the engine lists them. */
  readonly surfaces: readonly string[];
  readonly dualControlRequired: boolean;
  readonly sectionValues: SectionValues | null;
}

function toSettingRow(row: WireSettingRow): SettingRow | null {
  if (!(SETTING_ORIGINS as readonly string[]).includes(row.origin)) {
    return null;
  }
  return {
    key: row.key,
    surface: row.surface,
    origin: row.origin as SettingOrigin,
    value: row.value === undefined ? null : row.value,
    valueType: row.value_type,
    defaultValue: row.default_value,
    bound: row.bound,
    liveApply: row.live_apply,
    changeVia: row.change_via,
    uiBinding: row.ui_binding,
    summary: row.summary,
    editable: row.editable,
  };
}

function toLug(l: WireLugExposureSettings): SectionValues['lugExposure'] {
  return {
    enabled: l.enabled,
    resolutionEnabled: l.resolution_enabled,
    maxAccountsPerNamespace: l.max_accounts_per_namespace,
    maxGroupsPerNamespace: l.max_groups_per_namespace,
    maxSessionsPerDevice: l.max_sessions_per_device,
    lastSeenBucketHours: l.last_seen_bucket_hours,
    bindingConfirmThresholdPermille: l.binding_confirm_threshold_permille,
    snapshotCadenceHours: l.snapshot_cadence_hours,
  };
}

/** The read's section values, or null unless EVERY field is present (the engine fills them all). */
function toSectionValues(p: WireSectionPatch | undefined): SectionValues | null {
  if (
    p === undefined ||
    p.dual_control === undefined ||
    p.egress_destinations === undefined ||
    p.lug_exposure === undefined ||
    p.disabled_decoder_families === undefined ||
    p.source_format_map === undefined ||
    p.soc_narrative_model_ref === undefined
  ) {
    return null;
  }
  return {
    dualControl: p.dual_control,
    egressDestinations: p.egress_destinations.map((e: WireEgressSetting) => ({
      id: e.id,
      ceiling: e.ceiling,
    })),
    lugExposure: toLug(p.lug_exposure),
    disabledDecoderFamilies: p.disabled_decoder_families,
    sourceFormatMap: p.source_format_map.map((m: WireSourceFormatMapping) => ({
      source: m.source,
      format: m.format,
    })),
    socNarrativeModelRef: p.soc_narrative_model_ref === '' ? null : p.soc_narrative_model_ref,
  };
}

/**
 * Project the `SETTINGS_READ` reply. `null` for the engine's refusal (a tier below Admin /
 * SecurityAudit, or an unknown surface) or any row whose origin this build does not know.
 */
export function toSettingsView(wire: WireSettings): SettingsView | null {
  if (wire.refused) {
    return null;
  }
  const rows: SettingRow[] = [];
  for (const wireRow of wire.rows) {
    const row = toSettingRow(wireRow);
    if (row === null) {
      return null;
    }
    rows.push(row);
  }
  return {
    version: wire.version,
    rows,
    surfaces: wire.surfaces,
    dualControlRequired: wire.dual_control_required,
    sectionValues: toSectionValues(wire.section_values),
  };
}

/**
 * Where a row's value comes from, in the operator's words (TRD-CONSOLE-11 Section 9.4,
 * `INV-SETTINGS-SOURCE-LABELLED`): the committed document at its version, the node's environment at
 * boot, or a compile-time constant.
 */
export function settingSourceLabel(row: SettingRow, version: number): string {
  switch (row.origin) {
    case 'knob':
    case 'section':
      return version === 0
        ? 'fail-closed default (nothing committed)'
        : `committed at version ${String(version)}`;
    case 'env':
      return 'node environment at boot';
    case 'const':
      return 'compile-time constant';
  }
}

/**
 * The apply class of a row, from the registry's own `live_apply` text: `live`, `boot-bound`,
 * `pending`, or `fixed` (env / const). Drives the read-only label; never an edit decision (that is
 * the engine's `editable`).
 */
export function settingApplyClass(row: SettingRow): 'live' | 'boot-bound' | 'pending' | 'fixed' {
  if (row.origin === 'env' || row.origin === 'const') {
    return 'fixed';
  }
  if (row.liveApply.startsWith('live')) {
    return 'live';
  }
  if (row.liveApply.startsWith('pending')) {
    return 'pending';
  }
  return 'boot-bound';
}
