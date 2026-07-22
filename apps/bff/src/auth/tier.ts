// apps/bff/src/auth/tier.ts -- the operator's Crucible EXPLAIN tier, derived from OIDC claims (F0.5a).
//
// The Console maps an authenticated operator to a Crucible EXPLAIN tier (TRD-03 Section 8.1): the tier
// governs what the engine reveals (redacted fields are absent, not masked). The tier is derived from the
// operator's role/group claims and is FAIL-CLOSED: an operator with no recognized role gets the
// least-privileged `User` tier. Client-asserted tier is never trusted; this is the BFF's mapping, and the
// engine re-authorizes under the operator's Principal regardless (INV-CONSOLE-ENGINE-AUTHZ).

import type { OperatorRole } from './rbac.js';

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

// The resolved Console RBAC role (F0.5c) -> its EXPLAIN tier. This is the authority the operator ACTS
// with (from IDAM groups OR the localRbac fallback), which is distinct from the raw OIDC group claims
// deriveTier() reads: the box owner is `global-admin` via localRbac and carries NO group claim, so tier
// must come from the resolved role, not the token groups. A platform/tenant admin reads Confidential
// engine records (the LUG identity directory, the Overview users lane); a tenant-user stays at User.
// Live-found 2026-07-22: without this path the global admin fail-closed to User (Internal clearance) and
// the users container read empty for the operator who runs the platform.
const ROLE_TIER: Readonly<Record<OperatorRole, ExplainTier>> = {
  'global-admin': 'Admin',
  'tenant-admin': 'Admin',
  'tenant-user': 'User',
};

/** The EXPLAIN tier granted by a resolved Console RBAC role. */
export function tierForRole(role: OperatorRole): ExplainTier {
  return ROLE_TIER[role];
}

/** Return the more-privileged of two tiers. */
export function maxTier(a: ExplainTier, b: ExplainTier): ExplainTier {
  return TIER_ORDER.indexOf(a) >= TIER_ORDER.indexOf(b) ? a : b;
}

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
