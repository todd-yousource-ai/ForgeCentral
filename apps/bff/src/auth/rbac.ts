// apps/bff/src/auth/rbac.ts -- ForgeCentral operator RBAC v1 (F0.5c producer).
//
// ForgeCentral (not the engine) owns which tenant an operator acts in. This is the lightweight v1: the
// operator's role + active tenant are resolved from the IDAM groups the OIDC token carries, falling back
// to a local RBAC map only when the token carries NO group. Roles:
//   - global-admin  -> authorized across ALL tenants (acts in a configured active tenant per request);
//   - tenant-admin  -> their assigned tenant;
//   - tenant-user   -> their assigned tenant.
// Fail-closed: an operator with no resolvable authority gets `undefined` (no tenant -> a delegated read is
// refused). This is the seam a richer RBAC store (with automation) replaces later, without touching the
// wire or the engine.

/** An operator's role in the Console. */
export type OperatorRole = 'global-admin' | 'tenant-admin' | 'tenant-user';

/** Privilege order (index = rank); the highest of an operator's matched grants wins. */
const ROLE_ORDER: readonly OperatorRole[] = ['tenant-user', 'tenant-admin', 'global-admin'];

/** A role grant assigned to a group or a subject. */
export interface RoleGrant {
  readonly role: OperatorRole;
  /** The tenant for a tenant-scoped role (`tenant-admin` / `tenant-user`). Ignored for `global-admin`. */
  readonly tenant?: string;
}

/** The RBAC configuration (BFF config; the v1 store). */
export interface RbacConfig {
  /** IDAM group -> grant. Consulted first, whenever the token carries any group. */
  readonly groupRoles: Readonly<Record<string, RoleGrant>>;
  /** Local RBAC fallback: OIDC subject -> grant. Used ONLY when the token carries no group. */
  readonly localRbac: Readonly<Record<string, RoleGrant>>;
  /** The tenant a global admin acts in by default (they span all tenants; the UI may switch it later). */
  readonly defaultTenant?: string;
}

/** The resolved authority the BFF asserts to the engine on the operator's behalf. */
export interface OperatorAuthority {
  readonly role: OperatorRole;
  /** The tenant this operator acts in for a request (the delegation narrows the read to it). */
  readonly activeTenant: string;
  /** True for a global admin (authorized across all tenants); the wire still names one tenant per read. */
  readonly allTenants: boolean;
}

/** Pick the highest-privilege grant among the token's groups (unmatched groups are ignored). */
function highestGroupGrant(
  groups: readonly string[],
  groupRoles: Readonly<Record<string, RoleGrant>>,
): RoleGrant | undefined {
  let best: RoleGrant | undefined;
  for (const group of groups) {
    const grant = groupRoles[group];
    if (
      grant &&
      (best === undefined || ROLE_ORDER.indexOf(grant.role) > ROLE_ORDER.indexOf(best.role))
    ) {
      best = grant;
    }
  }
  return best;
}

/**
 * Resolve an operator's authority (role + active tenant). IDAM groups win; the local RBAC map is the
 * fallback only when the token carries no group. Fail-closed: `undefined` when nothing maps, when a global
 * admin has no configured default tenant, or when a tenant-scoped role names no tenant.
 */
export function resolveAuthority(
  subject: string,
  groups: readonly string[],
  config: RbacConfig,
): OperatorAuthority | undefined {
  const grant =
    groups.length > 0 ? highestGroupGrant(groups, config.groupRoles) : config.localRbac[subject];
  if (grant === undefined) return undefined;
  if (grant.role === 'global-admin') {
    if (config.defaultTenant === undefined) return undefined;
    return { role: 'global-admin', activeTenant: config.defaultTenant, allTenants: true };
  }
  if (grant.tenant === undefined) return undefined;
  return { role: grant.role, activeTenant: grant.tenant, allTenants: false };
}
