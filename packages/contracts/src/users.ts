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
 * One External IDAM connector card (TRD-CONSOLE-04 Section 2.3). UY.4 ships the HONEST shell: the
 * three well-known connectors render `not-connected` with non-live controls until the TRD-35
 * Phase-2 IdAM adapters land (Auth0 is the planned first live connector). `lastSyncAt` is null
 * until a real sync has happened -- never a fabricated timestamp.
 */
export interface IdamConnector {
  /** The connector's stable id (e.g. `okta`, `azure-ad`, `google-workspace`). */
  readonly connectorId: string;
  /** The display name. */
  readonly displayName: string;
  /** The connection state; only `not-connected` is producible until Phase 2. */
  readonly state: 'not-connected' | 'connected';
  /** The last successful sync (unix seconds), or null if none has ever run. */
  readonly lastSyncAt: number | null;
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

/**
 * The three well-known connector shells UY.4 renders (TRD-CONSOLE-04 Section 2.3), honest
 * `not-connected` until TRD-35 Phase 2. A REAL connector list replaces this constant when the
 * `idam.connectors` binding goes live; nothing here fabricates a sync.
 */
export const IDAM_CONNECTOR_SHELLS: readonly IdamConnector[] = [
  { connectorId: 'okta', displayName: 'Okta', state: 'not-connected', lastSyncAt: null },
  { connectorId: 'azure-ad', displayName: 'Azure AD', state: 'not-connected', lastSyncAt: null },
  {
    connectorId: 'google-workspace',
    displayName: 'Google Workspace',
    state: 'not-connected',
    lastSyncAt: null,
  },
];
