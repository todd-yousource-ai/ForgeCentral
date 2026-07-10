// apps/bff/src/engine/principal.ts -- the operator Principal the BFF acts on behalf of (F0.5b).
//
// An authenticated operator (an OperatorSession, F0.5a) becomes an `OperatorPrincipal`: the identity +
// EXPLAIN tier every engine call is made ON BEHALF OF. The BFF brokers each read under a Principal, never
// anonymously (INV-CONSOLE-ENGINE-AUTHZ) -- the operator-engine facade (operator-engine.ts) makes that a
// type-level requirement.
//
// The operator's TENANT is intentionally not carried here yet. The BFF holds one device-wide service cert
// (the engine authorizes the transport by that cert today), so the engine cannot yet re-authorize per
// operator: `WireQuerySubmit` has no operator-identity field. Carrying the operator identity + resolved
// tenant to the engine so it re-authorizes under the operator (the device-wide envelope, admin scoped to
// their own tenant) is the crdb INV-CROSS **F0.5c** (a new wire delegation field + the admin-scope read
// path). Until it lands, the Principal is the BFF's authority record: it names who each call is for and
// is recorded on every delegation, and it is exactly what F0.5c will serialize onto the wire.

import type { OperatorSession } from '../auth/session.js';
import type { ExplainTier } from '../auth/tier.js';

/** The operator an engine call is made on behalf of. */
export interface OperatorPrincipal {
  /** The verified OIDC subject (`sub`). */
  readonly subject: string;
  /** The operator's Crucible EXPLAIN tier (bounds what the engine reveals). */
  readonly tier: ExplainTier;
  /**
   * The operator's resolved tenant, when known. Unset today: the tenant is resolved engine-side under the
   * operator delegation (F0.5c). Present here once that delegation carries it.
   */
  readonly tenant?: string;
}

/** Derive the Principal from a live operator session. */
export function principalFromSession(session: OperatorSession): OperatorPrincipal {
  return { subject: session.subject, tier: session.tier };
}
