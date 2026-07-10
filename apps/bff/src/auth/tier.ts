// apps/bff/src/auth/tier.ts -- the operator's Crucible EXPLAIN tier, derived from OIDC claims (F0.5a).
//
// The Console maps an authenticated operator to a Crucible EXPLAIN tier (TRD-03 Section 8.1): the tier
// governs what the engine reveals (redacted fields are absent, not masked). The tier is derived from the
// operator's role/group claims and is FAIL-CLOSED: an operator with no recognized role gets the
// least-privileged `User` tier. Client-asserted tier is never trusted; this is the BFF's mapping, and the
// engine re-authorizes under the operator's Principal regardless (INV-CONSOLE-ENGINE-AUTHZ).

/** The Crucible EXPLAIN tiers, least- to most-privileged. */
export type ExplainTier = 'User' | 'Developer' | 'Admin' | 'SecurityAudit';

/** Privilege order (index = rank); the highest of an operator's roles wins. */
const TIER_ORDER: readonly ExplainTier[] = ['User', 'Developer', 'Admin', 'SecurityAudit'];

// TUNE: the default role-name -> tier map. A deployment may override the role claim + mapping via config;
// unknown roles never grant a tier (fail-closed).
const DEFAULT_ROLE_TIERS: Readonly<Record<string, ExplainTier>> = {
  'console-user': 'User',
  'console-developer': 'Developer',
  'console-admin': 'Admin',
  'console-security-audit': 'SecurityAudit',
};

/** Derive the EXPLAIN tier from an operator's roles. Fail-closed to `User` (least privilege). */
export function deriveTier(
  roles: readonly string[],
  roleTiers: Readonly<Record<string, ExplainTier>> = DEFAULT_ROLE_TIERS,
): ExplainTier {
  let tier: ExplainTier = 'User';
  for (const role of roles) {
    const mapped = roleTiers[role.toLowerCase()];
    if (mapped && TIER_ORDER.indexOf(mapped) > TIER_ORDER.indexOf(tier)) {
      tier = mapped;
    }
  }
  return tier;
}
