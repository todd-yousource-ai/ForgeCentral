// apps/bff/src/engine/principal.ts -- the operator Principal the BFF acts on behalf of (F0.5b).
//
// An authenticated operator (an OperatorSession, F0.5a) becomes an `OperatorPrincipal`: the identity +
// EXPLAIN tier every engine call is made ON BEHALF OF. The BFF brokers each read under a Principal, never
// anonymously (INV-CONSOLE-ENGINE-AUTHZ) -- the operator-engine facade (operator-engine.ts) makes that a
// type-level requirement.
//
// The operator's TENANT IS carried: `operator-engine.ts` injects `OperatorDelegation { principal, tenant }`
// onto every wire request, the engine narrows the read to it (gated by the peer's `Delegation` grant), and
// the crdb control plane refuses a delegation naming a reserved service tenant (IP-CONSOLE-CONTROL-PLANE
// C4). Per the locked design decision D3, the operator -> tenant mapping stays OWNED BY ForgeCentral (its
// RBAC, resolved at login): the engine trusts the Delegation-granted broker rather than re-verifying a
// signed assertion. This Principal is that BFF authority record -- who each call runs as, and the tenant
// it is scoped to.

import type { OperatorSession } from '../auth/session.js';
import type { ExplainTier } from '../auth/tier.js';

/** The operator an engine call is made on behalf of. */
export interface OperatorPrincipal {
  /** The verified OIDC subject (`sub`). */
  readonly subject: string;
  /** The operator's Crucible EXPLAIN tier (bounds what the engine reveals). */
  readonly tier: ExplainTier;
  /** The stable engine `PrincipalId` (a UUID) the delegation asserts the read runs as. */
  readonly principalId: string;
  /** The tenant the read is scoped to (resolved by the Console's RBAC). */
  readonly tenant: string;
}

/**
 * Derive the Principal from a live operator session.
 *
 * `activeTenantOverride` lets a GLOBAL-ADMIN scope this request to a chosen tenant (the tenant selector):
 * a global admin spans all tenants but the wire always names exactly one per read, so the UI picks it per
 * request. The override is honored ONLY for `global-admin`; a tenant-scoped operator is pinned to their own
 * tenant and the override is ignored (fail-closed -- a tenant-user can never switch tenants). An empty or
 * missing override keeps the session's resolved tenant.
 */
export function principalFromSession(
  session: OperatorSession,
  activeTenantOverride?: string,
): OperatorPrincipal {
  const override = activeTenantOverride?.trim();
  const tenant = session.role === 'global-admin' && override ? override : session.tenant;
  return {
    subject: session.subject,
    tier: session.tier,
    principalId: session.principalId,
    tenant,
  };
}
