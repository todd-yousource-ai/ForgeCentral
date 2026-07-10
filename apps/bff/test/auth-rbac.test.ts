// apps/bff/test/auth-rbac.test.ts -- F0.5c producer: operator RBAC v1 + deterministic principal id.

import { describe, expect, it } from 'vitest';

import { operatorPrincipalId } from '../src/auth/operator-id.js';
import { resolveAuthority, type RbacConfig } from '../src/auth/rbac.js';

describe('operatorPrincipalId', () => {
  it('is deterministic and a valid v5 UUID', () => {
    const a = operatorPrincipalId('auth0|abc');
    const b = operatorPrincipalId('auth0|abc');
    expect(a).toBe(b);
    // v5: the 13th hex digit is 5, the 17th is one of 8/9/a/b (RFC 4122 variant).
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('maps different subjects to different ids', () => {
    expect(operatorPrincipalId('auth0|a')).not.toBe(operatorPrincipalId('auth0|b'));
  });
});

const config: RbacConfig = {
  groupRoles: {
    'admins.global': { role: 'global-admin' },
    'tenant.acme.admin': { role: 'tenant-admin', tenant: 'tenant-acme' },
    'tenant.acme.user': { role: 'tenant-user', tenant: 'tenant-acme' },
  },
  localRbac: {
    'auth0|local-admin': { role: 'tenant-admin', tenant: 'tenant-local' },
  },
  defaultTenant: 'tenant-default',
};

describe('resolveAuthority', () => {
  it('resolves a global admin to all tenants + the default active tenant', () => {
    expect(resolveAuthority('auth0|x', ['admins.global'], config)).toEqual({
      role: 'global-admin',
      activeTenant: 'tenant-default',
      allTenants: true,
    });
  });

  it('resolves a tenant admin to their assigned tenant', () => {
    expect(resolveAuthority('auth0|x', ['tenant.acme.admin'], config)).toEqual({
      role: 'tenant-admin',
      activeTenant: 'tenant-acme',
      allTenants: false,
    });
  });

  it('picks the highest-privilege role among the token groups', () => {
    expect(resolveAuthority('auth0|x', ['tenant.acme.user', 'admins.global'], config)?.role).toBe(
      'global-admin',
    );
  });

  it('falls back to local RBAC only when the token carries no group', () => {
    expect(resolveAuthority('auth0|local-admin', [], config)).toEqual({
      role: 'tenant-admin',
      activeTenant: 'tenant-local',
      allTenants: false,
    });
  });

  it('does NOT fall back to local RBAC when groups are present but unmatched (fail-closed)', () => {
    // The subject has a local grant, but the token carries a group -> groups win, and none match.
    expect(resolveAuthority('auth0|local-admin', ['unknown.group'], config)).toBeUndefined();
  });

  it('fails closed when nothing maps', () => {
    expect(resolveAuthority('auth0|nobody', [], config)).toBeUndefined();
  });

  it('fails closed for a global admin with no configured default tenant', () => {
    const { defaultTenant: _omitted, ...noDefault } = config;
    expect(resolveAuthority('auth0|x', ['admins.global'], noDefault)).toBeUndefined();
  });

  it('fails closed for a tenant-scoped grant that names no tenant', () => {
    const bad: RbacConfig = {
      groupRoles: { 'broken.admin': { role: 'tenant-admin' } },
      localRbac: {},
    };
    expect(resolveAuthority('auth0|x', ['broken.admin'], bad)).toBeUndefined();
  });
});
