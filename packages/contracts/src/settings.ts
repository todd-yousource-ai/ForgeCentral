// packages/contracts/src/settings.ts -- the governed settings view (IP-CONSOLE-11 ST.1 over crdb
// IP-CONSOLE-SETTINGS-WIRE SET.1 / SET.2b, `SETTINGS_READ`).
//
// Every row is the engine's registry entry beside the committed value in the ENGINE's own rendering
// (the renderer `cdb-actl config-get-key` and the config diff use), so the Console never renders a
// value itself. The narrowers fail closed: an unknown origin refuses the whole view rather than
// guessing whether a setting is committed, boot configuration, or a constant.

import { CLASSIFICATION_TAGS } from './soc.js';
import type {
  WireEgressSetting,
  WireSectionPatch as WireSectionPatchDto,
  WireSettingsCommit,
  WireSettingsCommitted,
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

// ── The governed commit (IP-CONSOLE-11 ST.2a over crdb SET.2, `SETTINGS_COMMIT`) ──

/** One knob edit: the registry key and the value as `cdb-actl config-set-key` takes it. */
export interface SettingEdit {
  readonly key: string;
  readonly value: string;
}

/**
 * The admin capability names a dual-control set is drawn from (crdb `AdminCapability::name`). The
 * engine refuses an unknown name, so a stale list here fails closed, never open.
 */
export const ADMIN_CAPABILITIES = [
  'read-status',
  'server-lifecycle',
  'storage-manage',
  'maintenance-manage',
  'security-policy-change',
  'key-issue',
  'identity-manage',
  'artifact-approve',
  'tenant-config',
  'config-read',
  'audit-read',
  'audit-export',
] as const;

/** A typed patch over the live sections (crdb SET.2b); absent parts are unchanged. */
export interface SectionPatch {
  readonly dualControl?: readonly string[];
  readonly egressDestinations?: readonly { readonly id: string; readonly ceiling: string }[];
  readonly lugExposure?: SectionValues['lugExposure'];
  readonly disabledDecoderFamilies?: readonly string[];
  readonly sourceFormatMap?: readonly { readonly source: string; readonly format: string }[];
  /** Empty = unbind the narrative model. */
  readonly socNarrativeModelRef?: string;
}

/** A settings commit request: an atomic batch of knob edits and / or a section patch. */
export interface SettingsCommitRequest {
  readonly edits: readonly SettingEdit[];
  readonly sections?: SectionPatch;
}

/** Why the engine refused one edit (crdb SET.2 cause tags). */
export const SETTING_REFUSAL_CAUSES = [
  'unknown_key',
  'not_a_knob',
  'boot_bound',
  'pending_subsystem',
  'unparseable',
  'kind_mismatch',
  'duplicate',
] as const;
export type SettingRefusalCause = (typeof SETTING_REFUSAL_CAUSES)[number];

export interface SettingRefusal {
  readonly key: string;
  /** The cause tag; an unknown tag is kept verbatim as `other` so a refusal is never hidden. */
  readonly cause: SettingRefusalCause | 'other';
  readonly causeTag: string;
  readonly detail: string | null;
}

/** What the engine did with a settings commit: committed, or refused with its own reasons. */
export interface SettingsReceipt {
  readonly version: number;
  readonly needsRestart: readonly string[];
  readonly dualControlRequired: boolean;
  readonly refusedEdits: readonly SettingRefusal[];
  readonly violations: readonly string[];
  readonly refused: boolean;
  readonly explanation: string | null;
}

/** The most edits one commit carries (the engine bounds a batch by its registry size). */
export const MAX_SETTING_EDITS = 64;

/**
 * Narrow a client request body closed: `{key, value}` strings in the registry key shape (at most
 * [`MAX_SETTING_EDITS`]) and / or a well-formed section patch; at least one of the two. The ENGINE
 * decides whether each change may apply; this only refuses a malformed body before it leaves the BFF.
 */
export function toSettingsCommitRequest(raw: unknown): SettingsCommitRequest | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const rawEdits = body['edits'] ?? [];
  if (!Array.isArray(rawEdits) || rawEdits.length > MAX_SETTING_EDITS) {
    return null;
  }
  const edits: SettingEdit[] = [];
  for (const edit of rawEdits as unknown[]) {
    if (typeof edit !== 'object' || edit === null) {
      return null;
    }
    const e = edit as Record<string, unknown>;
    const key = e['key'];
    const value = e['value'];
    if (
      typeof key !== 'string' ||
      typeof value !== 'string' ||
      !/^[a-z_][a-z0-9_.]{0,127}$/.test(key) ||
      value.length > 256
    ) {
      return null;
    }
    edits.push({ key, value });
  }
  let sections: SectionPatch | undefined;
  if (body['sections'] !== undefined) {
    const parsed = toSectionPatch(body['sections']);
    if (parsed === null) {
      return null;
    }
    sections = parsed;
  }
  if (edits.length === 0 && sections === undefined) {
    return null;
  }
  return sections === undefined ? { edits } : { edits, sections };
}

/** The most entries a list-valued section may carry in one patch. */
export const MAX_SECTION_ENTRIES = 256;

function stringList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_SECTION_ENTRIES) {
    return null;
  }
  const out: string[] = [];
  for (const v of raw as unknown[]) {
    if (typeof v !== 'string' || v.length > 256) {
      return null;
    }
    out.push(v);
  }
  return out;
}

function nonNegativeInt(v: unknown, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : null;
}

/** Narrow a section patch closed; `null` on any malformed field (the ENGINE validates the values). */
export function toSectionPatch(raw: unknown): SectionPatch | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const p = raw as Record<string, unknown>;
  const out: {
    dualControl?: string[];
    egressDestinations?: { id: string; ceiling: string }[];
    lugExposure?: SectionValues['lugExposure'];
    disabledDecoderFamilies?: string[];
    sourceFormatMap?: { source: string; format: string }[];
    socNarrativeModelRef?: string;
  } = {};
  if (p['dualControl'] !== undefined) {
    const list = stringList(p['dualControl']);
    if (list === null) return null;
    out.dualControl = list;
  }
  if (p['egressDestinations'] !== undefined) {
    const raws = p['egressDestinations'];
    if (!Array.isArray(raws) || raws.length > MAX_SECTION_ENTRIES) return null;
    const list: { id: string; ceiling: string }[] = [];
    for (const r of raws as unknown[]) {
      if (typeof r !== 'object' || r === null) return null;
      const e = r as Record<string, unknown>;
      const id = e['id'];
      const ceiling = e['ceiling'];
      if (
        typeof id !== 'string' ||
        id.trim() === '' ||
        id.length > 128 ||
        typeof ceiling !== 'string' ||
        !(CLASSIFICATION_TAGS as readonly string[]).includes(ceiling)
      ) {
        return null;
      }
      list.push({ id, ceiling });
    }
    out.egressDestinations = list;
  }
  if (p['lugExposure'] !== undefined) {
    const l = p['lugExposure'];
    if (typeof l !== 'object' || l === null) return null;
    const x = l as Record<string, unknown>;
    const u32 = 4_294_967_295;
    const fields = [
      nonNegativeInt(x['maxAccountsPerNamespace'], u32),
      nonNegativeInt(x['maxGroupsPerNamespace'], u32),
      nonNegativeInt(x['maxSessionsPerDevice'], u32),
      nonNegativeInt(x['lastSeenBucketHours'], u32),
      nonNegativeInt(x['bindingConfirmThresholdPermille'], 65_535),
      nonNegativeInt(x['snapshotCadenceHours'], u32),
    ];
    if (
      typeof x['enabled'] !== 'boolean' ||
      typeof x['resolutionEnabled'] !== 'boolean' ||
      fields.some((f) => f === null)
    ) {
      return null;
    }
    const [a, g, se, lb, bt, sc] = fields as number[];
    out.lugExposure = {
      enabled: x['enabled'],
      resolutionEnabled: x['resolutionEnabled'],
      maxAccountsPerNamespace: a ?? 0,
      maxGroupsPerNamespace: g ?? 0,
      maxSessionsPerDevice: se ?? 0,
      lastSeenBucketHours: lb ?? 0,
      bindingConfirmThresholdPermille: bt ?? 0,
      snapshotCadenceHours: sc ?? 0,
    };
  }
  if (p['disabledDecoderFamilies'] !== undefined) {
    const list = stringList(p['disabledDecoderFamilies']);
    if (list === null) return null;
    out.disabledDecoderFamilies = list;
  }
  if (p['sourceFormatMap'] !== undefined) {
    const raws = p['sourceFormatMap'];
    if (!Array.isArray(raws) || raws.length > MAX_SECTION_ENTRIES) return null;
    const list: { source: string; format: string }[] = [];
    for (const r of raws as unknown[]) {
      if (typeof r !== 'object' || r === null) return null;
      const m = r as Record<string, unknown>;
      if (
        typeof m['source'] !== 'string' ||
        typeof m['format'] !== 'string' ||
        m['source'].trim() === '' ||
        m['format'].trim() === ''
      ) {
        return null;
      }
      list.push({ source: m['source'], format: m['format'] });
    }
    out.sourceFormatMap = list;
  }
  if (p['socNarrativeModelRef'] !== undefined) {
    const ref = p['socNarrativeModelRef'];
    if (typeof ref !== 'string' || ref.length > 256) return null;
    out.socNarrativeModelRef = ref;
  }
  return Object.keys(out).length === 0 ? null : out;
}

function toWireSectionPatch(p: SectionPatch): WireSectionPatchDto {
  const l = p.lugExposure;
  return {
    ...(p.dualControl === undefined ? {} : { dual_control: [...p.dualControl] }),
    ...(p.egressDestinations === undefined
      ? {}
      : {
          egress_destinations: p.egressDestinations.map((e) => ({ id: e.id, ceiling: e.ceiling })),
        }),
    ...(l === undefined
      ? {}
      : {
          lug_exposure: {
            enabled: l.enabled,
            resolution_enabled: l.resolutionEnabled,
            max_accounts_per_namespace: l.maxAccountsPerNamespace,
            max_groups_per_namespace: l.maxGroupsPerNamespace,
            max_sessions_per_device: l.maxSessionsPerDevice,
            last_seen_bucket_hours: l.lastSeenBucketHours,
            binding_confirm_threshold_permille: l.bindingConfirmThresholdPermille,
            snapshot_cadence_hours: l.snapshotCadenceHours,
          },
        }),
    ...(p.disabledDecoderFamilies === undefined
      ? {}
      : { disabled_decoder_families: [...p.disabledDecoderFamilies] }),
    ...(p.sourceFormatMap === undefined
      ? {}
      : {
          source_format_map: p.sourceFormatMap.map((m) => ({ source: m.source, format: m.format })),
        }),
    ...(p.socNarrativeModelRef === undefined
      ? {}
      : { soc_narrative_model_ref: p.socNarrativeModelRef }),
  };
}

/** The engine commit fields for a request (the BFF adds request_id and the delegation). */
export function toWireSettingsCommitFields(
  request: SettingsCommitRequest,
): Omit<WireSettingsCommit, 'request_id' | 'operator'> {
  const edits = request.edits.map((e) => ({ key: e.key, value: e.value }));
  return request.sections === undefined
    ? { edits }
    : { edits, sections: toWireSectionPatch(request.sections) };
}

/** Project the commit reply. Never null: a refusal is a state the surface renders. */
export function toSettingsReceipt(wire: WireSettingsCommitted): SettingsReceipt {
  return {
    version: wire.version,
    needsRestart: wire.needs_restart,
    dualControlRequired: wire.dual_control_required,
    refusedEdits: wire.refused_edits.map((r) => ({
      key: r.key,
      cause: (SETTING_REFUSAL_CAUSES as readonly string[]).includes(r.cause)
        ? (r.cause as SettingRefusalCause)
        : 'other',
      causeTag: r.cause,
      detail: r.detail === undefined || r.detail === '' ? null : r.detail,
    })),
    violations: wire.violations,
    refused: wire.refused,
    explanation:
      wire.explanation === undefined || wire.explanation === '' ? null : wire.explanation,
  };
}

/** A refusal cause in the operator's words. */
export function refusalCauseLabel(refusal: SettingRefusal): string {
  switch (refusal.cause) {
    case 'unknown_key':
      return 'not a governed setting';
    case 'not_a_knob':
      return 'a section: change it through its form';
    case 'boot_bound':
      return 'boot-bound: needs a restart, not editable here';
    case 'pending_subsystem':
      return 'pending: nothing applies it yet';
    case 'unparseable':
      return 'not a valid value for this setting';
    case 'kind_mismatch':
      return 'the wrong kind of value';
    case 'duplicate':
      return 'listed twice in one commit';
    case 'other':
      return `refused (${refusal.causeTag})`;
  }
}

/** Whether the Configuration tab offers a key edit for this row (knob, editable, not a set). */
export function isKeyEditable(row: SettingRow): boolean {
  return row.editable && row.origin === 'knob' && row.valueType !== 'CapabilitySet';
}
