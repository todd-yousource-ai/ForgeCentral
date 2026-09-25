// apps/bff/src/routes.ts -- the BFF's API route table (IP-CONSOLE-11-guide GD.1).
//
// INV-BINDING-ROUTE-COVERAGE: every `/api` route the BFF serves is declared here with the no-stub
// bindings (INV-CONSOLE-NO-STUB, @forge/bindings) it realizes, and the dispatcher refuses any `/api`
// request no declared route matches (server.ts `route`), so an undeclared handler is unreachable and the
// table cannot silently miss a route. The contract test (test/routes.test.ts) proves the rest: every
// declared binding is registered and LIVE, every LIVE binding is served by a declared route, a GET route
// serves only reads and any other method only commands, and every declared route is claimed by a real
// handler.
//
// A path template is literal segments plus `:name` (exactly one segment) or `:name+` (one or more
// segments: the entity and log-explain ids may carry a percent-encoded `/`). The query string is not
// part of the path.

import { type BindingId, bindingId } from '@forge/contracts';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/** One declared `/api` route and the bindings it realizes (at least one). */
export interface ApiRoute {
  readonly method: ApiMethod;
  readonly path: string;
  readonly bindings: readonly BindingId[];
}

function r(method: ApiMethod, path: string, ...ids: readonly string[]): ApiRoute {
  return { method, path, bindings: ids.map(bindingId) };
}

/** Every `/api` route the BFF serves, grouped by surface in dispatch order. */
export const API_ROUTES: readonly ApiRoute[] = [
  // The entity drawer (IP-CONSOLE-12).
  r(
    'GET',
    '/api/entity/:kind/:id+',
    'entity.header',
    'entity.info',
    'entity.recentDecisions',
    'entity.capabilities',
    'objects.detail',
  ),
  r('POST', '/api/entity/:kind/:id+/isolate', 'entity.isolate'),
  // Logs (IP-CONSOLE-09).
  r('GET', '/api/logs', 'logs.query'),
  r('GET', '/api/logs/explain/:id+', 'logs.explain'),
  r('POST', '/api/logs/export', 'logs.export'),
  // Overview (IP-CONSOLE-01).
  r('GET', '/api/overview/sankey', 'overview.graph', 'vtz.riskBand'),
  r('GET', '/api/overview/entity-connections', 'overview.entityConnections'),
  r('GET', '/api/overview/members', 'overview.members'),
  // Virtual Trust Zones (IP-CONSOLE-02) and distribution (IP-CONSOLE-02-FORGE-DISTRIBUTION).
  r('GET', '/api/vtz/tree', 'vtz.tree'),
  r('GET', '/api/vtz/detail', 'vtz.detail'),
  r('GET', '/api/vtz/convergence', 'policies.convergence'),
  r('POST', '/api/vtz', 'vtz.create'),
  r('PUT', '/api/vtz/:id', 'vtz.edit'),
  r('DELETE', '/api/vtz/:id', 'vtz.delete'),
  r('POST', '/api/vtz/:id/rescope', 'vtz.rescope'),
  r('POST', '/api/vtz/:id/distribute', 'policies.distribute'),
  // Users, groups and identity providers (IP-CONSOLE-04).
  r('GET', '/api/users', 'users.list', 'users.detail'),
  r('GET', '/api/users/groups', 'groups.list', 'groups.detail'),
  r('POST', '/api/users', 'users.create'),
  r('POST', '/api/users/edit', 'users.edit'),
  r('POST', '/api/users/status', 'users.setStatus'),
  r('POST', '/api/users/groups', 'groups.create'),
  r('POST', '/api/users/groups/edit', 'groups.edit'),
  r('POST', '/api/users/groups/members', 'groups.setMembers'),
  r('GET', '/api/idam/connectors', 'idam.connectors'),
  r('POST', '/api/idam/sync', 'idam.sync'),
  r('POST', '/api/idam/connect', 'idam.connect'),
  r('POST', '/api/idam/secret', 'idam.secret'),
  r('POST', '/api/idam/configure', 'idam.configure'),
  // Objects (IP-CONSOLE-10).
  r('GET', '/api/objects', 'objects.list'),
  r('GET', '/api/objects/detail', 'objects.detail'),
  r('POST', '/api/objects', 'objects.create'),
  r('POST', '/api/objects/edit', 'objects.edit'),
  r('POST', '/api/objects/delete', 'objects.delete'),
  // Policies (IP-CONSOLE-05).
  r('GET', '/api/policies', 'policies.byZone'),
  r('GET', '/api/policies/detail', 'policies.detail'),
  r('POST', '/api/policies', 'policies.create'),
  r('POST', '/api/policies/edit', 'policies.edit'),
  r('POST', '/api/policies/publish', 'policies.publish'),
  r('POST', '/api/policies/delete', 'policies.delete'),
  // SOC Ops and Reports (IP-CONSOLE-03).
  r('GET', '/api/soc/kpis', 'soc.kpis'),
  r('GET', '/api/soc/incidents', 'soc.incidents'),
  r('GET', '/api/soc/incident', 'soc.incident.detail', 'soc.plan.propose'),
  r('GET', '/api/soc/narrative', 'soc.narrative'),
  r('GET', '/api/soc/telemetry', 'soc.telemetry.raw'),
  r('GET', '/api/soc/audit', 'soc.audit.trail'),
  r('GET', '/api/soc/notes', 'soc.notes'),
  r('GET', '/api/soc/impact', 'soc.impact'),
  r('GET', '/api/soc/report', 'soc.report'),
  r('GET', '/api/soc/weekly', 'soc.weekly'),
  r('POST', '/api/soc/plan/approve', 'soc.plan.approve'),
  r('POST', '/api/soc/plan/modify', 'soc.plan.modify'),
  r('POST', '/api/soc/generate', 'soc.cognition.run'),
  r('POST', '/api/soc/act', 'soc.case.assign', 'soc.case.ack', 'soc.case.note', 'soc.case.close'),
  r('POST', '/api/soc/disposition', 'soc.disposition'),
  // Settings (IP-CONSOLE-11).
  r('GET', '/api/settings', 'settings.read'),
  r('POST', '/api/settings', 'settings.commit'),
  r('GET', '/api/settings/console-rbac', 'settings.consoleRbac'),
  r('GET', '/api/settings/reports', 'settings.reports'),
  r('GET', '/api/settings/security-session', 'settings.securitySession'),
  r('POST', '/api/settings/propose', 'settings.propose'),
  r('GET', '/api/settings/approvals', 'settings.approvals'),
  r('POST', '/api/settings/approvals/:proposal/approve', 'settings.approve'),
  r('GET', '/api/settings/history', 'settings.history'),
  r('POST', '/api/settings/rollback', 'settings.rollback'),
  r('GET', '/api/settings/soc', 'soc.settings.read'),
  r('POST', '/api/settings/soc', 'soc.settings.commit'),
];

/** Compile a path template to an anchored regular expression. */
export function templatePattern(template: string): RegExp {
  const parts = template.split('/').map((segment) => {
    if (segment.startsWith(':') && segment.endsWith('+')) return '(.+)';
    if (segment.startsWith(':')) return '([^/]+)';
    return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  return new RegExp(`^${parts.join('/')}$`);
}

const COMPILED: readonly { readonly route: ApiRoute; readonly pattern: RegExp }[] = API_ROUTES.map(
  (route) => ({ route, pattern: templatePattern(route.path) }),
);

/**
 * How the table answers a request: `declared` (a route matches method and path), `method` (a route
 * matches the path but not the method), or `undeclared` (no route matches the path).
 */
export type RouteVerdict = 'declared' | 'method' | 'undeclared';

export function apiRouteVerdict(method: string, path: string): RouteVerdict {
  let pathMatched = false;
  for (const { route, pattern } of COMPILED) {
    if (!pattern.test(path)) continue;
    if (route.method === method) return 'declared';
    pathMatched = true;
  }
  return pathMatched ? 'method' : 'undeclared';
}
