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
  PrincipalRow,
  WireListAgents,
  WireListGroups,
  WireListPrincipals,
} from '@forge/contracts';
import { toAgentPrincipalRow, toGroupCards, toPrincipalRows } from '@forge/contracts';

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
