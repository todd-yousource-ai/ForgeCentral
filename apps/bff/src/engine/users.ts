// apps/bff/src/engine/users.ts -- the Users-surface read resolvers (IP-CONSOLE-04 UY.2/UY.3).
//
// Projects the crdb TRD-35 directory reads into the Console view models: `users.list` merges the
// LUG principal directory (LIST_PRINCIPALS, ER.6 -- observed device accounts + operator-provisioned
// enterprise records in one row shape) with the AIG agent directory (LIST_AGENTS, ER.1 -- the
// AI-Agent cross-bind), so the one table lists every actor the engine authorizes; `groups.list`
// projects the group directory. Both reads are engine-bounded (the per-tenant ceiling refuses
// rather than truncating), tenant-private, and operator-delegated via `OperatorEngine`
// (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED: a record carrying an engine tag the contract cannot narrow collapses the WHOLE
// response to `UsersUnavailableError` -- a directory silently missing principals is exactly the lie
// the no-stub rule forbids on an identity surface (INV-CONSOLE-USERS-REAL).

import type {
  GroupCard,
  PrincipalDraft,
  PrincipalRow,
  ProvisionReceipt,
  WireListAgents,
  WireListGroups,
  WireListPrincipals,
} from '@forge/contracts';
import {
  toAgentPrincipalRow,
  toGroupCards,
  toPrincipalRows,
  toProvisionReceipt,
  toWirePrincipalSpec,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine returned a record the Console cannot render honestly; the route surfaces 503. */
export class UsersUnavailableError extends Error {
  constructor(what: string) {
    super(`users read cannot be rendered honestly: ${what}`);
    this.name = 'UsersUnavailableError';
  }
}

let nextRequestId = 1n;

/** A fresh correlation id per engine read (reads are non-mutating; the id is for tracing). */
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/**
 * Resolve the All Users table: the LUG principal directory merged with the AIG agent cross-bind,
 * sorted by username then id (stable across the two families).
 */
export async function resolveUsersList(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly PrincipalRow[]> {
  const principalsReq: WireListPrincipals = { request_id: requestId() };
  const agentsReq: WireListAgents = { request_id: requestId() };
  // Both directory reads are independent bounded reads; issue them concurrently.
  const [principalList, agentList] = await Promise.all([
    engine.listPrincipals(principal, principalsReq, opts),
    engine.listAgents(principal, agentsReq, opts),
  ]);
  const rows = toPrincipalRows(principalList);
  if (rows === null) {
    throw new UsersUnavailableError('a principal record carries an unknown engine tag');
  }
  const merged: PrincipalRow[] = [...rows];
  for (const record of agentList.agents) {
    const row = toAgentPrincipalRow(record);
    if (row === null) {
      throw new UsersUnavailableError('an agent record carries an unknown lifecycle status');
    }
    merged.push(row);
  }
  merged.sort(
    (a, b) => a.username.localeCompare(b.username) || a.principalId.localeCompare(b.principalId),
  );
  return merged;
}

/**
 * A provisioning command the engine refused, carried typed for the route (409 on a duplicate,
 * 400 on malformed input, 403 on a denial) -- never collapsed to one opaque failure.
 */
export class UsersCommandError extends Error {
  constructor(readonly wireClass: string) {
    super(`users command refused: ${wireClass}`);
    this.name = 'UsersCommandError';
  }
}

/**
 * Create an enterprise group (`groups.create`, crdb GROUP_CREATE): an audited atomic commit
 * attributed to the delegated operator; a duplicate name is an engine Conflict, never an upsert.
 */
export async function resolveCreateGroup(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  name: string,
  description: string,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.groupCreate(
    principal,
    { request_id: requestId(), name, description },
    opts,
  );
  return toProvisionReceipt(reply);
}

/**
 * Provision a local enterprise principal (`users.create`, crdb PRINCIPAL_CREATE): the Add User
 * form's draft, audited, duplicate-refused (TRD-35 6.3). NO trust field can travel (the draft
 * shape has none).
 */
export async function resolveCreatePrincipal(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: PrincipalDraft,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.principalCreate(
    principal,
    { request_id: requestId(), spec: toWirePrincipalSpec(draft) },
    opts,
  );
  return toProvisionReceipt(reply);
}

/** Edit a local principal's enterprise fields (`users.edit`, crdb PRINCIPAL_EDIT), audited. */
export async function resolveEditPrincipal(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  draft: PrincipalDraft,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.principalEdit(
    principal,
    { request_id: requestId(), spec: toWirePrincipalSpec(draft) },
    opts,
  );
  return toProvisionReceipt(reply);
}

/**
 * Transition a local principal's lifecycle (`users.setStatus`, crdb PRINCIPAL_SET_STATUS):
 * activate / suspend / revoke -- never a delete, history preserved (R-LUG-23).
 */
export async function resolveSetPrincipalStatus(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  username: string,
  status: 'active' | 'suspended' | 'revoked',
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.principalSetStatus(
    principal,
    { request_id: requestId(), username, status },
    opts,
  );
  return toProvisionReceipt(reply);
}

/** Edit an enterprise group's description (`groups.edit`, crdb GROUP_EDIT), audited. */
export async function resolveEditGroup(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  name: string,
  description: string,
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.groupEdit(
    principal,
    { request_id: requestId(), name, description },
    opts,
  );
  return toProvisionReceipt(reply);
}

/**
 * Set an enterprise group's DIRECT subject membership (`groups.setMembers`, crdb
 * GROUP_SET_MEMBERS): a set-diff engine-side (additions written, removals tombstoned; observed
 * device memberships never touched).
 */
export async function resolveSetGroupMembers(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  name: string,
  members: readonly string[],
  opts?: EngineCallOptions,
): Promise<ProvisionReceipt> {
  const reply = await engine.groupSetMembers(
    principal,
    { request_id: requestId(), name, members: [...members] },
    opts,
  );
  return toProvisionReceipt(reply);
}

/** Resolve the Groups tab: the LUG group directory (enterprise + observed device groups). */
export async function resolveGroupsList(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly GroupCard[]> {
  const request: WireListGroups = { request_id: requestId() };
  const list = await engine.listGroups(principal, request, opts);
  return toGroupCards(list);
}
