// packages/contracts/src/users.ts -- the Users and Identity contract (IP-CONSOLE-04 UY.1).
//
// The Users surface (TRD-CONSOLE-04) manages the platform's principals -- every actor the engine
// authorizes -- and the groups they belong to. This module is the ONE home for its data contract
// (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the view models the SPA renders and the BFF resolver
// produces, typed against the generated crdb wire DTOs. Both tiers import it, so a drifted field
// fails compilation on both sides (the cross-module gap guard).
//
// The engine half is the crdb TRD-35 Local User Graph: the ER.6 directory reads
// (LIST_PRINCIPALS / LIST_GROUPS) and the LU.P provisioning commands (PRINCIPAL_CREATE/EDIT/
// SET_STATUS + GROUP_CREATE/EDIT/SET_MEMBERS), all landed and gated. UY.1 lands the TYPES + the
// projections only; no route, no surface.
//
// GROUNDED-DESIGN NOTES (INV-CONSOLE-USERS-REAL):
//   * NO TRUST FIELD anywhere (operator ruling 2026-07-21; TRD-CONSOLE-04 amendment). The mock's
//     Override column is DELETED; {@link PrincipalRow.origin} takes its place -- the row's TRD-35
//     Section 9 authoritative source (`local` = operator-provisioned enterprise record, `observed` =
//     collector inventory fact; a federation connector name arrives with TRD-35 Phase 2).
//   * The engine emits TWO principal families through one read: observed device accounts (from the
//     torch identity collector) and operator-provisioned enterprise records (E3). Both are full
//     directory citizens (R-LUG-22); the row shape is identical.
//   * The mock's Type column maps onto the engine's kinds honestly: `human` / `service` are the
//     engine tags; Employee/Contractor/Partner sub-classification is an enterprise-record attribute
//     that does not exist engine-side yet, so the Console renders the engine tag, never a guess.
//   * `Remote` and `Compliance` columns have no engine substrate yet: the view model carries them as
//     honest empties (absent), never fabricated (the columns render blank, matching the Logs
//     precedent for not-yet-emitted fields).
//
// Every narrowing is FAIL-CLOSED: an engine tag the Console does not know collapses the projection
// to `null` rather than rendering a principal with a guessed identity. A mis-rendered identity row
// is a security-relevant lie on a governance surface.

import type {
  WireAgentRecord,
  WireGroupList,
  WireGroupRecord,
  WireIdamConfigure,
  WireIdamConnectorList,
  WireIdamConnectorRecord,
  WireIdamSyncStarted,
  WireLugProvisioned,
  WirePrincipalList,
  WirePrincipalRecord,
  WirePrincipalSpec,
} from './generated/wire-dto.js';

/**
 * The principal kinds the engine emits, narrowed closed: `human`/`service` are the LUG
 * `account_type`/`subject_type` tags; `agent` rows cross-bind from the AIG directory
 * (LIST_AGENTS, ER.1) so the one table lists every actor the engine authorizes (TRD-CONSOLE-04:
 * the mock's AI Agent rows).
 */
export const PRINCIPAL_KINDS = ['human', 'service', 'agent'] as const;
export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

/**
 * The lifecycle states a row can carry: the operator-set enterprise lifecycle
 * (`active`/`suspended`/`revoked`, E3) plus the observed-account `disabled` (a collector fact --
 * shadowed/locked accounts -- an operator command cannot change a device's passwd file).
 */
export const PRINCIPAL_STATUSES = [
  'active',
  'suspended',
  'revoked',
  'disabled',
  // The AIG lifecycle adds `compromised` (an agent flagged by the compromise assessor).
  'compromised',
] as const;
export type PrincipalStatus = (typeof PRINCIPAL_STATUSES)[number];

/** The row's authoritative source (TRD-35 Section 9); replaces the deleted Override column. */
export const PRINCIPAL_ORIGINS = ['local', 'observed'] as const;
export type PrincipalOrigin = (typeof PRINCIPAL_ORIGINS)[number];

/**
 * One row of the All Users table (TRD-CONSOLE-04 Section 2.1) -- a projection of the engine's
 * `WirePrincipalRecord`. Deliberately NO trust field. `email`/`org` are empty strings for an
 * observed account (no enterprise record); `remote`/`compliance` are absent until their engine
 * substrate exists (rendered blank, never fabricated).
 */
export interface PrincipalRow {
  /** The stable engine id (`lug:local_account:...` or `lug:identity_subject:enterprise:...`). */
  readonly principalId: string;
  /** The display username. */
  readonly username: string;
  /** The owning identity-namespace reference (device scope or `enterprise`). */
  readonly namespace: string;
  /** The principal kind (the engine tag, never a guessed sub-classification). */
  readonly kind: PrincipalKind;
  /** The lifecycle status. */
  readonly status: PrincipalStatus;
  /** The authoritative source: `local` or `observed`. */
  readonly origin: PrincipalOrigin;
  /** The enterprise record's e-mail (empty for an observed account). */
  readonly email: string;
  /** The enterprise record's organization (empty for an observed account). */
  readonly org: string;
  /** The DIRECT group-membership chips, sorted, deduplicated (engine-computed). */
  readonly groups: readonly string[];
  /** The CONFIRMED resolved identity subject, when one exists. */
  readonly subjectId: string | null;
  /** The privilege tags DIRECTLY granted (observed accounts; empty for a local record). */
  readonly privileges: readonly string[];
  /** When this principal was first observed/provisioned (unix seconds). */
  readonly firstSeen: number;
}

/** One Groups-tab card (TRD-CONSOLE-04 Section 2.2) -- a projection of `WireGroupRecord`. */
export interface GroupCard {
  /** The stable engine id. */
  readonly groupId: string;
  /** The group name. */
  readonly name: string;
  /** The owning namespace reference (device scope or `enterprise`). */
  readonly namespace: string;
  /** Whether this is a built-in/system group (observed) vs an authored one. */
  readonly builtIn: boolean;
  /** The DIRECT member count (accounts + provisioned subjects, engine-computed). */
  readonly memberCount: number;
  /** The operator-authored description (empty for an observed device group). */
  readonly description: string;
}

/**
 * The completeness of a connector's last sync, narrowed CLOSED from the engine's
 * `last_completeness` string (`complete` / `partial` / `failed`, crdb `LugCompleteness`). An
 * unrecognized value narrows to `null` (see {@link toIdamConnector}) rather than a guessed outcome,
 * so a card can never claim `complete` on a tag the Console does not understand.
 */
export const IDAM_SYNC_OUTCOMES = ['complete', 'partial', 'failed'] as const;
export type IdamSyncOutcome = (typeof IDAM_SYNC_OUTCOMES)[number];

/**
 * The derived health state of a connector card. This is NOT an engine tag -- the engine record
 * carries `enabled` / `running` / `last_error` / `last_sync_unix_ms` / `last_completeness`, and this
 * state is {@link toIdamConnector}'s conservative projection of them. FAIL-CLOSED: any combination the
 * projection does not confidently recognize as healthy yields `unknown`, never `healthy`, so an
 * unparseable record never renders as a connected connector (INV-CONSOLE-IDAM-CONTRACT).
 */
export const IDAM_CONNECTOR_STATES = [
  'disabled',
  'never-synced',
  'syncing',
  'healthy',
  'partial',
  'error',
  'unknown',
] as const;
export type IdamConnectorState = (typeof IDAM_CONNECTOR_STATES)[number];

/**
 * One External IDAM connector card (TRD-CONSOLE-04 Section 2.3), the camelCase mirror of the engine's
 * `WireIdamConnectorRecord` (crdb IA.8). Every field derives from a real connector record; there is
 * NO secret or secret reference here (the Auth0 client secret is placed on the node out of band and
 * is not representable in any Console type). `lastSyncAt` is `null` until a real sync has run --
 * rendered `Never`, never a fabricated timestamp.
 */
export interface IdamConnector {
  /** The connector's stable provider id (e.g. `auth0`). Engine `provider`. */
  readonly connectorId: string;
  /** The display name (engine `display_name`, e.g. `Auth0`). */
  readonly displayName: string;
  /** The provider tenant/domain (engine `provider_tenant`, e.g. the Auth0 domain). */
  readonly providerTenant: string;
  /** The derived, fail-closed health state (see {@link IdamConnectorState}). */
  readonly state: IdamConnectorState;
  /** Whether the connector is enabled (engine `enabled`). */
  readonly enabled: boolean;
  /** Whether a sync is running right now (engine `running`); drives the in-flight indicator. */
  readonly running: boolean;
  /** The last sync time (unix MILLISECONDS, engine `last_sync_unix_ms`), or null if none ever ran. */
  readonly lastSyncAt: number | null;
  /** The last sync's completeness, narrowed closed, or null when absent/unrecognized. */
  readonly lastSyncOutcome: IdamSyncOutcome | null;
  /** The object count from the last sync (engine `objects_synced`; 0 before any sync). */
  readonly objectsSynced: number;
  /** The last error string the engine reported, or null. */
  readonly lastError: string | null;
  /** The delta-poll interval in seconds (engine `poll_interval_secs`). */
  readonly pollIntervalSecs: number;
  /** The full-directory-sync cadence in hours (engine `full_sync_cadence_hours`). */
  readonly fullSyncCadenceHours: number;
}

/**
 * The Configure form's authored shape (`idam.configure`), the camelCase mirror of the NON-transport
 * fields of `WireIdamConfigure` (crdb IA.8). The engine's configure verb carries ONLY these settings
 * plus `enabled`: domain, client id, and the client secret are ABSENT from the wire DTO by
 * construction (re-pointing a connector at a different tenant is a deployment act, not a settings
 * one). There is deliberately no secret or secret-reference field -- a form that could carry a secret
 * is unrepresentable. The BFF wire codec (ID.4) adds `request_id` + the operator delegation.
 */
export interface IdamConnectorDraft {
  /** The connector this configuration targets (engine `provider`). */
  readonly provider: string;
  /** Whether the connector should be enabled. */
  readonly enabled: boolean;
  /** The delta-poll interval in seconds (engine-bounded 60..=86400; the engine re-validates). */
  readonly pollIntervalSecs: number;
  /** The full-directory-sync cadence in hours (engine-bounded 1..=168; the engine re-validates). */
  readonly fullSyncCadenceHours: number;
}

/**
 * A `idam.sync` acknowledgment (`WireIdamSyncStarted`). IDAM_SYNC is an ACK, not a result: it marks a
 * sync DUE and returns immediately, naming the provider it queued. The card's `running` / `lastSyncAt`
 * (re-read via `idam.connectors`) is the source of truth for progress -- never a client-side timer.
 */
export interface SyncReceipt {
  /** The connector the sync was queued for (engine `provider`). */
  readonly provider: string;
}

/** The Add/Edit User form's engine shape (E3 `WirePrincipalSpec`); NO trust field. */
export interface PrincipalDraft {
  readonly username: string;
  readonly kind: PrincipalKind;
  readonly email: string | null;
  readonly org: string | null;
}

/** A provisioning command's acknowledgment (`LugProvisioned`). */
export interface ProvisionReceipt {
  /** The audited commit version (0 = an exact-replay membership set changed nothing). */
  readonly commitVersion: number;
}

/** Narrow an engine kind tag, fail-closed. */
function toKind(tag: string): PrincipalKind | null {
  return (PRINCIPAL_KINDS as readonly string[]).includes(tag) ? (tag as PrincipalKind) : null;
}

/** Narrow an engine status tag, fail-closed. */
function toStatus(tag: string): PrincipalStatus | null {
  return (PRINCIPAL_STATUSES as readonly string[]).includes(tag) ? (tag as PrincipalStatus) : null;
}

/** Narrow an engine origin tag, fail-closed. */
function toOrigin(tag: string): PrincipalOrigin | null {
  return (PRINCIPAL_ORIGINS as readonly string[]).includes(tag) ? (tag as PrincipalOrigin) : null;
}

/**
 * Project one engine principal record into the table row. FAIL-CLOSED: an unknown kind, status, or
 * origin tag returns `null` (the resolver surfaces unavailability rather than a guessed identity).
 */
export function toPrincipalRow(record: WirePrincipalRecord): PrincipalRow | null {
  const kind = toKind(record.account_type);
  const status = toStatus(record.status);
  const origin = toOrigin(record.origin);
  if (kind === null || status === null || origin === null) {
    return null;
  }
  return {
    principalId: record.principal_id,
    username: record.username,
    namespace: record.namespace,
    kind,
    status,
    origin,
    email: record.email,
    org: record.org,
    groups: record.groups,
    subjectId: record.subject_id ?? null,
    privileges: record.privileges,
    firstSeen: record.first_seen,
  };
}

/**
 * Project the LIST_PRINCIPALS reply into rows. One malformed record collapses the WHOLE projection
 * (`null`), not just the row: a directory silently missing principals is exactly the lie the
 * no-stub rule forbids on an identity surface.
 */
export function toPrincipalRows(list: WirePrincipalList): readonly PrincipalRow[] | null {
  const rows: PrincipalRow[] = [];
  for (const record of list.principals) {
    const row = toPrincipalRow(record);
    if (row === null) {
      return null;
    }
    rows.push(row);
  }
  return rows;
}

/** Project one engine group record into its card (no closed narrowing needed: all fields total). */
export function toGroupCard(record: WireGroupRecord): GroupCard {
  return {
    groupId: record.group_id,
    name: record.name,
    namespace: record.namespace,
    builtIn: record.built_in,
    memberCount: record.member_count,
    description: record.description,
  };
}

/**
 * Project one AIG agent-directory record into a principal row (the AI-Agent cross-bind,
 * LIST_AGENTS ER.1). FAIL-CLOSED on an unknown lifecycle status. The AIG record is machine
 * identity: kind `agent`, origin `observed` (enrollment is an observed engine fact), namespace
 * `aig`, enterprise fields honestly empty, first-seen = the enrollment instant.
 */
export function toAgentPrincipalRow(record: WireAgentRecord): PrincipalRow | null {
  const status = toStatus(record.status);
  if (status === null) {
    return null;
  }
  return {
    principalId: record.agent_id,
    username: record.agent_id,
    namespace: 'aig',
    kind: 'agent',
    status,
    origin: 'observed',
    email: '',
    org: '',
    groups: [],
    subjectId: null,
    privileges: [],
    firstSeen: record.enrolled_at,
  };
}

/** Project the LIST_GROUPS reply into cards. */
export function toGroupCards(list: WireGroupList): readonly GroupCard[] {
  return list.groups.map(toGroupCard);
}

/** Project a form draft into the E3 wire spec (the only direction a draft travels). */
export function toWirePrincipalSpec(draft: PrincipalDraft): WirePrincipalSpec {
  return {
    username: draft.username,
    subject_type: draft.kind,
    ...(draft.email === null ? {} : { email: draft.email }),
    ...(draft.org === null ? {} : { org: draft.org }),
  };
}

/** Project a provisioning acknowledgment. */
export function toProvisionReceipt(reply: WireLugProvisioned): ProvisionReceipt {
  return { commitVersion: reply.commit_version };
}

/** Narrow the engine `last_completeness` string, fail-closed (unrecognized/absent -> null). */
function toIdamSyncOutcome(tag: string | null | undefined): IdamSyncOutcome | null {
  if (tag == null) {
    return null;
  }
  return (IDAM_SYNC_OUTCOMES as readonly string[]).includes(tag) ? (tag as IdamSyncOutcome) : null;
}

/**
 * Derive the connector card's health state from the engine record, CONSERVATIVELY. Precedence:
 * disabled (config off) -> syncing (a walk is in flight) -> error (the engine reported one) ->
 * never-synced (no sync has ever completed) -> the last completeness. The final branch is
 * FAIL-CLOSED: a synced, error-free connector whose completeness the Console does not recognize is
 * `unknown`, NOT `healthy`, so an unparseable record can never render as a green connected card.
 */
function deriveIdamState(record: WireIdamConnectorRecord): IdamConnectorState {
  if (!record.enabled) {
    return 'disabled';
  }
  if (record.running) {
    return 'syncing';
  }
  if (record.last_error != null) {
    return 'error';
  }
  if (record.last_sync_unix_ms == null) {
    return 'never-synced';
  }
  const outcome = toIdamSyncOutcome(record.last_completeness);
  if (outcome === 'complete') {
    return 'healthy';
  }
  if (outcome === 'partial') {
    return 'partial';
  }
  if (outcome === 'failed') {
    return 'error';
  }
  return 'unknown';
}

/**
 * Project one engine connector record into its card. Total (every engine field is well-typed by the
 * schema), with the fail-closed derivations {@link deriveIdamState} and {@link toIdamSyncOutcome}:
 * an unrecognized completeness never becomes a healthy card, and an absent `last_sync_unix_ms`
 * renders `Never` (null) rather than an epoch. No field is defaulted or invented.
 */
export function toIdamConnector(record: WireIdamConnectorRecord): IdamConnector {
  return {
    connectorId: record.provider,
    displayName: record.display_name,
    providerTenant: record.provider_tenant,
    state: deriveIdamState(record),
    enabled: record.enabled,
    running: record.running,
    lastSyncAt: record.last_sync_unix_ms ?? null,
    lastSyncOutcome: toIdamSyncOutcome(record.last_completeness),
    objectsSynced: record.objects_synced,
    lastError: record.last_error ?? null,
    pollIntervalSecs: record.poll_interval_secs,
    fullSyncCadenceHours: record.full_sync_cadence_hours,
  };
}

/**
 * Project the `idam.connectors` reply into cards. An unfederated node returns an EMPTY list (not an
 * error), which projects to `[]` and renders as "no connector configured" -- the engine deliberately
 * made those distinguishable, so the Console never turns an empty directory into a failure state.
 */
export function toIdamConnectors(list: WireIdamConnectorList): readonly IdamConnector[] {
  return list.connectors.map(toIdamConnector);
}

/** Project a sync acknowledgment (`WireIdamSyncStarted` -> the view-model {@link SyncReceipt}). */
export function toSyncReceipt(reply: WireIdamSyncStarted): SyncReceipt {
  return { provider: reply.provider };
}

/**
 * Compile a Configure draft into the NON-transport fields of the engine's `WireIdamConfigure`. The
 * BFF wire codec (ID.4) adds `request_id` + the operator delegation; this helper is the ONE home for
 * the camelCase->snake_case field mapping. By type there is no secret to carry. The engine
 * re-validates the cadence bounds and refuses out-of-range values regardless of this projection.
 */
export function toWireIdamConfigureFields(
  draft: IdamConnectorDraft,
): Omit<WireIdamConfigure, 'request_id' | 'operator'> {
  return {
    provider: draft.provider,
    enabled: draft.enabled,
    poll_interval_secs: draft.pollIntervalSecs,
    full_sync_cadence_hours: draft.fullSyncCadenceHours,
  };
}
