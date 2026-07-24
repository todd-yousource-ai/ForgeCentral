// packages/contracts/src/policies.ts -- the Policies (Forge access-contract) contract (IP-CONSOLE-05 P5.1).
//
// The Policies surface (TRD-CONSOLE-05) is the operator's authoring plane for FORGE POLICY (Crucible
// TRD-32 v2, Forge Agent Runtime Control), organized by Virtual Trust Zone: the per-VTZ rulesets that
// govern a subject's access to a destination, composed most-restrictive-wins and signed into a bundle.
// This module is the ONE home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the view
// models the SPA renders and the BFF resolver produces, typed against the generated crdb wire DTOs. Both
// tiers import it, so a drifted field fails compilation on both sides.
//
// The engine half is the crdb policy store (crdb IP-CONSOLE-POLICY-SUBSTRATE PS.1-PS.N, landed): a policy
// is a per-VTZ Ruleset (source -> destination -> action) plus a NetworkMatch (ports/protocol), authored
// restrictions (schedule/active-window/geo/tags), a logging level, and an Applied-To distribution scope.
// P5.1 lands the TYPES + projections only; no route, no surface.
//
// GROUNDED-DESIGN NOTES (INV-CONSOLE-POLICIES-REAL):
//   * FOUR-ACTION LATTICE: the action control offers exactly `permit < monitor < quarantine < deny`
//     (the TRD-32 v2 restrictiveness lattice), never three. `quarantine` is the containment rung.
//   * LOGGING is exactly `full` / `sampled` / `off` (the engine `TelemetryMode`); the mock's
//     "triggered"/"verbose" do not exist engine-side and would be a stub.
//   * A rule endpoint's kind IS a TRD-32 v2 ObjectKind and its selector IS an object Selector, so this
//     module REUSES `ObjectKind` / `SelectorKind` from the Objects contract (the shared-types rule)
//     rather than re-declaring the registries.
//   * The Applied-To scope (who ENFORCES) is distinct from the rule source/destination (who a rule
//     MATCHES). An empty Applied-To distributes nowhere (fail-closed), never everywhere.
//
// Every narrowing is FAIL-CLOSED: an engine action/logging/protocol/selector/kind/lifecycle/day/
// classification tag the Console does not know collapses the WHOLE projection to `null` rather than
// rendering a guessed disposition -- a mis-rendered action on a governance surface is a security-relevant
// lie. The genuinely free-form fields (ports string, geo tags, restriction tags) are carried verbatim.

import { OBJECT_KINDS, SELECTOR_KINDS, type ObjectKind, type SelectorKind } from './objects.js';
import type {
  WirePolicyDetail,
  WirePolicyList,
  WirePolicyMutated,
  WirePolicyRecord,
  WirePolicyRule,
  WirePolicySpec,
  WireScopeMember,
} from './generated/wire-dto.js';

/** The restrictiveness lattice, narrowed closed (TRD-32 v2 R-FRG-93/94). Order is least -> most. */
export const POLICY_ACTIONS = ['permit', 'monitor', 'quarantine', 'deny'] as const;
export type PolicyAction = (typeof POLICY_ACTIONS)[number];

/** The zone telemetry level, narrowed closed (the engine `TelemetryMode`). */
export const POLICY_LOGGING = ['full', 'sampled', 'off'] as const;
export type PolicyLogging = (typeof POLICY_LOGGING)[number];

/** The network-match protocol tags, narrowed closed (`Protocol::tag`). */
export const POLICY_PROTOCOLS = ['tcp', 'udp', 'https', 'ssh'] as const;
export type PolicyProtocol = (typeof POLICY_PROTOCOLS)[number];

/** The authoring lifecycle of a policy version. */
export const POLICY_LIFECYCLES = ['draft', 'published'] as const;
export type PolicyLifecycle = (typeof POLICY_LIFECYCLES)[number];

/** The recurring-schedule day tags, narrowed closed. */
export const SCHEDULE_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type ScheduleDay = (typeof SCHEDULE_DAYS)[number];

/** The policy maximum-classification tags, narrowed closed (never widens across a lineage, R-FRG-7). */
export const POLICY_CLASSIFICATIONS = [
  'unclassified',
  'internal',
  'confidential',
  'restricted',
  'secret',
] as const;
export type PolicyClassification = (typeof POLICY_CLASSIFICATIONS)[number];

/** One end of a rule (a source or a destination): a TRD-32 v2 ObjectRef rendered read-only. */
export interface RuleEndpoint {
  /** The object kind (the shared TRD-32 v2 ObjectKind registry). */
  readonly kind: ObjectKind;
  /** The selector form (`exact` / `glob` / `group_ref` / `cidr`). */
  readonly selectorKind: SelectorKind;
  /** The selector value (pattern, exact value, group id, or CIDR block). */
  readonly selectorValue: string;
}

/** One rule of a policy's ruleset: a source, a destination, and the lattice action between them. */
export interface PolicyRule {
  readonly source: RuleEndpoint;
  readonly destination: RuleEndpoint;
  readonly action: PolicyAction;
}

/** The network qualifier (`NetworkMatch`): protocol chips + the canonical port form. Empty = unrestricted. */
export interface NetworkMatchView {
  readonly protocols: readonly PolicyProtocol[];
  /** The ports in the canonical operator form (`80, 443, 8080-8090`); empty = unrestricted. */
  readonly ports: string;
}

/**
 * The authored restrictions. A recurring SCHEDULE (days + an intra-day minute window) and an absolute
 * ACTIVE WINDOW (`from`/`until`, HLC; `until` is producer-enforced expiry) plus a geo allowlist and
 * reporting tags. Schedule/geo runtime evaluation is deferred to torch (enforcement AG.7-OFF); the
 * fields are authored + carried now.
 */
export interface PolicyRestrictionsView {
  readonly scheduleDays: readonly ScheduleDay[];
  /** Minutes since midnight, inclusive; null = all day. */
  readonly scheduleStartMinute: number | null;
  /** Minutes since midnight, exclusive; null = all day. */
  readonly scheduleEndMinute: number | null;
  /** Absolute activation start (HLC), inclusive; null = active since authoring. */
  readonly activeFrom: number | null;
  /** Absolute activation end (HLC), exclusive; null = never expires. Producer-enforced expiry. */
  readonly activeUntil: number | null;
  /** The residency-allowlist geo tags (verbatim); empty = no geo restriction. */
  readonly geo: readonly string[];
  /** The classification/grouping labels (`PHI`, `PII`; verbatim, reporting only). */
  readonly tags: readonly string[];
}

/** One Applied-To member: the attested endpoint CN and, where agent-scoped, the agent correlation id. */
export interface AppliedToMember {
  readonly endpointCn: string;
  readonly agent: string | null;
}

/**
 * One policy (TRD-CONSOLE-05) -- a projection of the engine's `WirePolicyRecord` at its newest authored
 * version. The full authored record: identity + ruleset + network match + restrictions + logging +
 * Applied-To scope + max classification. The table row renders a subset; the editor renders the whole.
 */
export interface PolicyRow {
  /** The policy id (UUID, hyphenated). */
  readonly id: string;
  /** The interned id of the VTZ this policy scopes (the grouping key). */
  readonly vtz: string;
  /** The operator-authored policy name. */
  readonly name: string;
  /** The store-minted SemVer (`major.minor.patch`); the version chip. */
  readonly version: string;
  /** The authoring lifecycle (`draft` / `published`). */
  readonly lifecycle: PolicyLifecycle;
  /** The operator description (bounded metadata, never a disposition input). */
  readonly description: string;
  /** The order-independent ruleset. */
  readonly rules: readonly PolicyRule[];
  /** The network qualifier (ports + protocols). */
  readonly network: NetworkMatchView;
  /** The authored restrictions (schedule / active window / geo / tags). */
  readonly restrictions: PolicyRestrictionsView;
  /** The zone telemetry level. */
  readonly logging: PolicyLogging;
  /** The Applied-To distribution scope; empty distributes nowhere (fail-closed). */
  readonly appliedTo: readonly AppliedToMember[];
  /** The policy's maximum classification. */
  readonly maxClassification: PolicyClassification;
}

/** One zone group of the grouped list (`WirePolicyZone`): a VTZ id + its policies (newest version each). */
export interface PolicyZoneGroup {
  readonly vtz: string;
  readonly policies: readonly PolicyRow[];
}

/** One row of a policy's version history. */
export interface PolicyVersionView {
  readonly version: string;
  readonly lifecycle: PolicyLifecycle;
}

/**
 * A policy's full definition plus its version history (the editor + view drawer). `policy` is null when
 * the named id does not exist (an honest absence, never a fabricated record).
 */
export interface PolicyDetailView {
  readonly policy: PolicyRow | null;
  readonly versions: readonly PolicyVersionView[];
}

/**
 * The Create/Edit Policy form's engine shape (`WirePolicySpec`): the same flat field set as the record
 * MINUS the store-owned fields -- no `id` (create derives it), no `version` (store-minted), and no
 * `lifecycle` (authoring always lands a Draft; publish is a separate atomic transition).
 */
export interface PolicyDraft {
  readonly vtz: string;
  readonly name: string;
  readonly description: string;
  readonly rules: readonly PolicyRule[];
  readonly network: NetworkMatchView;
  readonly restrictions: PolicyRestrictionsView;
  readonly logging: PolicyLogging;
  readonly appliedTo: readonly AppliedToMember[];
  readonly maxClassification: PolicyClassification;
}

/** A policy command's acknowledgment (`WirePolicyMutated`): the mutated id, its new version + lifecycle. */
export interface PolicyMutation {
  readonly id: string;
  readonly version: string;
  readonly lifecycle: PolicyLifecycle;
  /** Whether the publish revoked previously-granted access (a breaking version bump). */
  readonly breaking: boolean;
}

// -- fail-closed narrowers (an unknown engine tag returns null) --------------------------------------

function toAction(tag: string): PolicyAction | null {
  return (POLICY_ACTIONS as readonly string[]).includes(tag) ? (tag as PolicyAction) : null;
}
function toLogging(tag: string): PolicyLogging | null {
  return (POLICY_LOGGING as readonly string[]).includes(tag) ? (tag as PolicyLogging) : null;
}
function toProtocol(tag: string): PolicyProtocol | null {
  return (POLICY_PROTOCOLS as readonly string[]).includes(tag) ? (tag as PolicyProtocol) : null;
}
function toLifecycle(tag: string): PolicyLifecycle | null {
  return (POLICY_LIFECYCLES as readonly string[]).includes(tag) ? (tag as PolicyLifecycle) : null;
}
function toScheduleDay(tag: string): ScheduleDay | null {
  return (SCHEDULE_DAYS as readonly string[]).includes(tag) ? (tag as ScheduleDay) : null;
}
function toClassification(tag: string): PolicyClassification | null {
  return (POLICY_CLASSIFICATIONS as readonly string[]).includes(tag)
    ? (tag as PolicyClassification)
    : null;
}
function toObjectKind(tag: string): ObjectKind | null {
  return (OBJECT_KINDS as readonly string[]).includes(tag) ? (tag as ObjectKind) : null;
}
function toSelectorKind(tag: string): SelectorKind | null {
  return (SELECTOR_KINDS as readonly string[]).includes(tag) ? (tag as SelectorKind) : null;
}

/** Project one wire rule endpoint. FAIL-CLOSED on an unknown kind or selector form. */
function toRuleEndpoint(
  kind: string,
  selectorKind: string,
  selectorValue: string,
): RuleEndpoint | null {
  const objectKind = toObjectKind(kind);
  const selector = toSelectorKind(selectorKind);
  if (objectKind === null || selector === null) {
    return null;
  }
  return { kind: objectKind, selectorKind: selector, selectorValue };
}

/** Project one wire rule. FAIL-CLOSED on an unknown endpoint kind/selector or action. */
function toPolicyRule(rule: WirePolicyRule): PolicyRule | null {
  const source = toRuleEndpoint(
    rule.source_kind,
    rule.source_selector_kind,
    rule.source_selector_value,
  );
  const destination = toRuleEndpoint(
    rule.destination_kind,
    rule.destination_selector_kind,
    rule.destination_selector_value,
  );
  const action = toAction(rule.action);
  if (source === null || destination === null || action === null) {
    return null;
  }
  return { source, destination, action };
}

/** Project the wire protocol tags. FAIL-CLOSED: one unknown protocol collapses the set to null. */
function toProtocols(tags: readonly string[] | undefined): readonly PolicyProtocol[] | null {
  const out: PolicyProtocol[] = [];
  for (const tag of tags ?? []) {
    const protocol = toProtocol(tag);
    if (protocol === null) {
      return null;
    }
    out.push(protocol);
  }
  return out;
}

/** Project the wire schedule days. FAIL-CLOSED: one unknown day collapses the set to null. */
function toScheduleDays(tags: readonly string[] | undefined): readonly ScheduleDay[] | null {
  const out: ScheduleDay[] = [];
  for (const tag of tags ?? []) {
    const day = toScheduleDay(tag);
    if (day === null) {
      return null;
    }
    out.push(day);
  }
  return out;
}

function toAppliedToMember(member: WireScopeMember): AppliedToMember {
  return { endpointCn: member.endpoint_cn, agent: member.agent ?? null };
}

/**
 * Project one engine policy record into a row. FAIL-CLOSED: an unknown action, logging level, protocol,
 * selector form, object kind, lifecycle, schedule day, or classification returns `null` (the resolver
 * surfaces unavailability rather than a guessed disposition on a governance surface).
 */
export function toPolicyRow(record: WirePolicyRecord): PolicyRow | null {
  const lifecycle = toLifecycle(record.lifecycle);
  const logging = toLogging(record.logging);
  const maxClassification = toClassification(record.max_classification);
  const protocols = toProtocols(record.protocols);
  const scheduleDays = toScheduleDays(record.schedule_days);
  if (
    lifecycle === null ||
    logging === null ||
    maxClassification === null ||
    protocols === null ||
    scheduleDays === null
  ) {
    return null;
  }
  const rules: PolicyRule[] = [];
  for (const wireRule of record.rules) {
    const rule = toPolicyRule(wireRule);
    if (rule === null) {
      return null;
    }
    rules.push(rule);
  }
  return {
    id: record.id,
    vtz: record.vtz,
    name: record.name,
    version: record.version,
    lifecycle,
    description: record.description,
    rules,
    network: { protocols, ports: record.ports ?? '' },
    restrictions: {
      scheduleDays,
      scheduleStartMinute: record.schedule_start_minute ?? null,
      scheduleEndMinute: record.schedule_end_minute ?? null,
      activeFrom: record.active_from ?? null,
      activeUntil: record.active_until ?? null,
      geo: record.geo ?? [],
      tags: record.restriction_tags ?? [],
    },
    logging,
    appliedTo: (record.applied_to ?? []).map(toAppliedToMember),
    maxClassification,
  };
}

/**
 * Project the `POLICY_LIST_BY_ZONE` reply into zone groups. One malformed record collapses the WHOLE
 * list (`null`), not just the row: a list silently missing policies is the lie the no-stub rule forbids
 * on a governance surface. An empty tenant projects honest empty zones.
 */
export function toPolicyZones(list: WirePolicyList): readonly PolicyZoneGroup[] | null {
  const groups: PolicyZoneGroup[] = [];
  for (const zone of list.zones) {
    const policies: PolicyRow[] = [];
    for (const record of zone.policies) {
      const row = toPolicyRow(record);
      if (row === null) {
        return null;
      }
      policies.push(row);
    }
    groups.push({ vtz: zone.vtz, policies });
  }
  return groups;
}

/** Project one version-history row. FAIL-CLOSED on an unknown lifecycle. */
function toPolicyVersion(version: {
  version: string;
  lifecycle: string;
}): PolicyVersionView | null {
  const lifecycle = toLifecycle(version.lifecycle);
  if (lifecycle === null) {
    return null;
  }
  return { version: version.version, lifecycle };
}

/**
 * Project the `POLICY_DETAIL` reply. A present-but-unprojectable record (or a malformed version row)
 * collapses to `null` (unavailability); an absent record is `policy: null` with whatever versions
 * resolved (normally none). The engine carries versions ascending by SemVer.
 */
export function toPolicyDetail(detail: WirePolicyDetail): PolicyDetailView | null {
  const versions: PolicyVersionView[] = [];
  for (const wireVersion of detail.versions) {
    const version = toPolicyVersion(wireVersion);
    if (version === null) {
      return null;
    }
    versions.push(version);
  }
  if (detail.record === undefined || detail.record === null) {
    return { policy: null, versions };
  }
  const policy = toPolicyRow(detail.record);
  if (policy === null) {
    return null;
  }
  return { policy, versions };
}

/** Project a form draft into the wire spec (the only direction a draft travels). Empty axes are omitted. */
export function toWirePolicySpec(draft: PolicyDraft): WirePolicySpec {
  const spec: WirePolicySpec = {
    name: draft.name,
    vtz: draft.vtz,
    description: draft.description,
    logging: draft.logging,
    max_classification: draft.maxClassification,
    rules: draft.rules.map((rule) => ({
      source_kind: rule.source.kind,
      source_selector_kind: rule.source.selectorKind,
      source_selector_value: rule.source.selectorValue,
      destination_kind: rule.destination.kind,
      destination_selector_kind: rule.destination.selectorKind,
      destination_selector_value: rule.destination.selectorValue,
      action: rule.action,
    })),
  };
  if (draft.network.protocols.length > 0) {
    spec.protocols = [...draft.network.protocols];
  }
  if (draft.network.ports !== '') {
    spec.ports = draft.network.ports;
  }
  if (draft.restrictions.scheduleDays.length > 0) {
    spec.schedule_days = [...draft.restrictions.scheduleDays];
  }
  if (draft.restrictions.scheduleStartMinute !== null) {
    spec.schedule_start_minute = draft.restrictions.scheduleStartMinute;
  }
  if (draft.restrictions.scheduleEndMinute !== null) {
    spec.schedule_end_minute = draft.restrictions.scheduleEndMinute;
  }
  if (draft.restrictions.activeFrom !== null) {
    spec.active_from = draft.restrictions.activeFrom;
  }
  if (draft.restrictions.activeUntil !== null) {
    spec.active_until = draft.restrictions.activeUntil;
  }
  if (draft.restrictions.geo.length > 0) {
    spec.geo = [...draft.restrictions.geo];
  }
  if (draft.restrictions.tags.length > 0) {
    spec.restriction_tags = [...draft.restrictions.tags];
  }
  if (draft.appliedTo.length > 0) {
    spec.applied_to = draft.appliedTo.map((member) => ({
      endpoint_cn: member.endpointCn,
      ...(member.agent === null ? {} : { agent: member.agent }),
    }));
  }
  return spec;
}

/** Project a command acknowledgment. FAIL-CLOSED on an unknown lifecycle; a null `breaking` is `false`. */
export function toPolicyMutation(reply: WirePolicyMutated): PolicyMutation | null {
  const lifecycle = toLifecycle(reply.lifecycle);
  if (lifecycle === null) {
    return null;
  }
  return { id: reply.id, version: reply.version, lifecycle, breaking: reply.breaking ?? false };
}

/** The human display label for a lattice action (the Action control + column). */
export function policyActionLabel(action: PolicyAction): string {
  switch (action) {
    case 'permit':
      return 'Permit';
    case 'monitor':
      return 'Monitor';
    case 'quarantine':
      return 'Quarantine';
    case 'deny':
      return 'Deny';
  }
}

/** The human display label for a logging level. */
export function policyLoggingLabel(logging: PolicyLogging): string {
  switch (logging) {
    case 'full':
      return 'Full';
    case 'sampled':
      return 'Sampled';
    case 'off':
      return 'Off';
  }
}

/** The human display label for a protocol chip. */
export function policyProtocolLabel(protocol: PolicyProtocol): string {
  switch (protocol) {
    case 'tcp':
      return 'TCP';
    case 'udp':
      return 'UDP';
    case 'https':
      return 'HTTPS';
    case 'ssh':
      return 'SSH';
  }
}
