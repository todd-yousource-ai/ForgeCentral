// apps/console/src/surfaces/PoliciesSurface.tsx -- the Policies (Forge access-contract) surface (P5.3).
//
// The operator's per-VTZ policy authoring plane (TRD-CONSOLE-05), read-only in this step: the tenant's
// policies grouped by Virtual Trust Zone into collapsible accordions, each expanding to a table of that
// zone's policies over the real engine store (GET /api/policies -> POLICY_LIST_BY_ZONE, PS.5). Grounded on
// the `06-*.png` (collapsed groups) + `07-*.png` (expanded table) prototype; the TRD wins on conflict.
//
// HONESTY RULES (INV-CONSOLE-POLICIES-REAL):
//   * Every row + field comes from the engine record; the surface fabricates nothing.
//   * The grouped list is bounded AND complete, so search + zone filter narrow a COMPLETE dataset.
//   * The action cell shows exactly the four-action lattice; logging exactly Full/Sampled/Off -- both are
//     the contract's closed projections, so no value the engine cannot store can render here.
//   * Authoring (Create/Edit/Publish/Delete) is NOT wired in this step (P5.4): the Create control is
//     present but disabled, never a dead action that pretends to work.

import { useMemo, useState, type ReactElement } from 'react';
import {
  AccordionGroup,
  Badge,
  ConfirmDialog,
  DataTable,
  type BadgeVariant,
  type DataTableColumn,
} from '@forge/design';
import type { PolicyAction, PolicyRow, PolicyZoneGroup, RuleEndpoint } from '@forge/contracts';
import { policyActionLabel, policyLoggingLabel, policyProtocolLabel } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { usePolicies } from './usePolicies.js';
import { useVtzTree } from './useVtzTree.js';
import { useDeletePolicy } from './usePolicyMutation.js';
import { PolicyForm } from './PolicyForm.js';

/** The lattice action -> its semantic badge color (permit calm, deny critical, quarantine its own rung). */
export function actionVariant(action: PolicyAction): BadgeVariant {
  switch (action) {
    case 'permit':
      return 'good';
    case 'monitor':
      return 'info';
    case 'quarantine':
      return 'quarantine';
    case 'deny':
      return 'critical';
  }
}

/** A rule endpoint rendered compactly, e.g. `agent:demo-agent` or `network:10.8.0.0/16`. */
function endpointLabel(endpoint: RuleEndpoint): string {
  return `${endpoint.kind}:${endpoint.selectorValue}`;
}

/** The Scope cell: one rule reads `source -> destination`; many collapse to a `N sources -> M targets` count. */
export function scopeSummary(policy: PolicyRow): string {
  if (policy.rules.length === 0) return '--';
  if (policy.rules.length === 1) {
    const rule = policy.rules[0];
    if (rule === undefined) return '--';
    return `${endpointLabel(rule.source)} -> ${endpointLabel(rule.destination)}`;
  }
  const sources = new Set(policy.rules.map((r) => endpointLabel(r.source)));
  const targets = new Set(policy.rules.map((r) => endpointLabel(r.destination)));
  return `${sources.size} sources -> ${targets.size} targets`;
}

/** The Protocol/Ports cell: the protocol chips + the canonical port form; `any` when unrestricted. */
export function networkSummary(policy: PolicyRow): string {
  const protocols = policy.network.protocols.map(policyProtocolLabel).join('/');
  const parts = [protocols, policy.network.ports].filter((p) => p !== '');
  return parts.length === 0 ? 'any' : parts.join(' ');
}

/**
 * The Restrictions cell: a compact summary of the authored restrictions. The absolute-window bound is an
 * engine HLC, not a wall-clock, so it is reported as a flag ("expires"), never a fabricated date; the
 * recurring schedule + geo are authored-and-carried (their runtime evaluation is the deferred torch leg).
 */
export function restrictionsSummary(policy: PolicyRow): string {
  const r = policy.restrictions;
  const parts: string[] = [];
  if (r.scheduleDays.length > 0 || r.scheduleStartMinute !== null || r.scheduleEndMinute !== null) {
    parts.push('scheduled');
  }
  if (r.activeUntil !== null) parts.push('expires');
  if (r.geo.length > 0) parts.push(`geo(${String(r.geo.length)})`);
  for (const tag of r.tags) parts.push(tag);
  return parts.length === 0 ? '--' : parts.join(' · ');
}

/** The distinct actions across a policy's ruleset, in lattice order (usually one). */
function distinctActions(policy: PolicyRow): readonly PolicyAction[] {
  const order: readonly PolicyAction[] = ['permit', 'monitor', 'quarantine', 'deny'];
  const present = new Set(policy.rules.map((r) => r.action));
  return order.filter((a) => present.has(a));
}

const COLUMNS: readonly DataTableColumn<PolicyRow>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: (p) => (
      <span className="fcx-policy-name">
        {p.name} <Badge variant="neutral">v{p.version}</Badge>
      </span>
    ),
  },
  { id: 'scope', header: 'Scope', cell: (p) => scopeSummary(p) },
  { id: 'network', header: 'Protocol / Ports', cell: (p) => networkSummary(p) },
  {
    id: 'action',
    header: 'Action',
    cell: (p) => (
      <span className="fcx-policy-actions">
        {distinctActions(p).map((a) => (
          <Badge key={a} variant={actionVariant(a)}>
            {policyActionLabel(a)}
          </Badge>
        ))}
      </span>
    ),
  },
  { id: 'restrictions', header: 'Restrictions', cell: (p) => restrictionsSummary(p) },
  { id: 'logging', header: 'Logging', cell: (p) => policyLoggingLabel(p.logging) },
  {
    id: 'status',
    header: 'Status',
    cell: (p) => (
      <Badge variant={p.lifecycle === 'published' ? 'good' : 'caution'}>{p.lifecycle}</Badge>
    ),
  },
];

/** A policy matches the free-text search over its name, scope, protocol/ports, and restriction tags. */
function policyMatches(policy: PolicyRow, needle: string): boolean {
  if (needle === '') return true;
  const haystack = [
    policy.name,
    scopeSummary(policy),
    networkSummary(policy),
    policy.restrictions.tags.join(' '),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

export function PoliciesSurface(): ReactElement {
  const policies = usePolicies();
  const tree = useVtzTree();
  const deletePolicy = useDeletePolicy();
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [form, setForm] = useState<'closed' | 'add' | PolicyRow>('closed');
  const [confirming, setConfirming] = useState<PolicyRow | null>(null);

  // The row action affordances (Edit / Delete) close over the surface handlers, so they live here rather
  // than in the module-level display columns.
  const columns = useMemo<readonly DataTableColumn<PolicyRow>[]>(
    () => [
      ...COLUMNS,
      {
        id: 'actions',
        header: 'Actions',
        cell: (p) => (
          <span className="fcx-policy-actions">
            <button type="button" className="fcx-btn" onClick={() => setForm(p)}>
              Edit
            </button>
            <button
              type="button"
              className="fcx-btn fcx-btn--danger"
              onClick={() => setConfirming(p)}
            >
              Delete
            </button>
          </span>
        ),
      },
    ],
    [],
  );

  // The zone display order + the filter options come from the live VTZ tree when available; the surface
  // never blocks on it (policies drive the content). A policy zone absent from the tree still renders,
  // ordered after the known zones, under its own id.
  const treeOrder = useMemo(() => {
    const index = new Map<string, number>();
    (tree.data?.zones ?? []).forEach((z, i) => index.set(z.id, i));
    return index;
  }, [tree.data]);

  const needle = search.trim().toLowerCase();

  // Filter each zone's policies, then drop empty zones, then order by the tree (unknown zones last).
  const groups = useMemo(() => {
    const filtered = (policies.data ?? [])
      .filter((g) => zone === '' || g.vtz === zone)
      .map((g) => ({ vtz: g.vtz, policies: g.policies.filter((p) => policyMatches(p, needle)) }))
      .filter((g) => g.policies.length > 0);
    return filtered.sort((a, b) => {
      const ia = treeOrder.get(a.vtz) ?? Number.MAX_SAFE_INTEGER;
      const ib = treeOrder.get(b.vtz) ?? Number.MAX_SAFE_INTEGER;
      return ia === ib ? a.vtz.localeCompare(b.vtz) : ia - ib;
    });
  }, [policies.data, zone, needle, treeOrder]);

  // The zone dropdown lists every zone that has policies (a complete, honest set over the real data).
  const zoneOptions = useMemo(() => {
    const ids = new Set((policies.data ?? []).map((g: PolicyZoneGroup) => g.vtz));
    return [...ids].sort((a, b) => a.localeCompare(b));
  }, [policies.data]);

  const activeFilters = [
    search.trim() !== '' ? `search "${search.trim()}"` : null,
    zone !== '' ? `zone ${zone}` : null,
  ].filter((f): f is string => f !== null);
  const filtering = activeFilters.length > 0;

  return (
    <section className="fcx-surface" aria-labelledby="surface-policies">
      <div className="fcx-surface__header">
        <h2 id="surface-policies" className="fcx-surface__heading">
          Policies
        </h2>
        <button
          type="button"
          className="fcx-btn fcx-btn--primary"
          onClick={() => setForm((f) => (f === 'add' ? 'closed' : 'add'))}
        >
          + Create Policy
        </button>
      </div>

      {form !== 'closed' ? (
        <PolicyForm editing={form === 'add' ? null : form} onDone={() => setForm('closed')} />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming !== null ? `Delete ${confirming.name}?` : ''}
        description="Deleting a policy tombstones every version (history is preserved) and removes it from future distribution. Enforcement is unaffected until separately engaged."
        tone="critical"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirming !== null) {
            deletePolicy.mutate({ vtz: confirming.vtz, id: confirming.id });
          }
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />

      <div className="fcx-surface__controls">
        <input
          type="search"
          className="fcx-input"
          placeholder="Search policies..."
          aria-label="Search policies"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="fcx-filter">
          Zone
          <select className="fcx-select" value={zone} onChange={(e) => setZone(e.target.value)}>
            <option value="">All</option>
            {zoneOptions.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>

      {policies.isLoading ? (
        <LoadingState label="Loading the policies" />
      ) : policies.isError ? (
        <ErrorState title="Could not load the policies." onRetry={() => void policies.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          title="No policies match"
          hint={
            filtering
              ? `No policy matches ${activeFilters.join(', ')}.`
              : 'No policies have been authored yet.'
          }
        />
      ) : (
        <div className="fcx-policies">
          {groups.map((group) => {
            const label = `${group.vtz}, ${String(group.policies.length)} ${
              group.policies.length === 1 ? 'policy' : 'policies'
            }`;
            return (
              <AccordionGroup
                key={`${group.vtz}:${filtering ? 'open' : 'closed'}`}
                title={group.vtz}
                meta={<Badge variant="neutral">{group.policies.length}</Badge>}
                defaultOpen={filtering}
                label={label}
              >
                <DataTable
                  caption={`Policies in ${group.vtz}`}
                  columns={columns}
                  rows={group.policies}
                  rowKey={(p) => p.id}
                />
              </AccordionGroup>
            );
          })}
        </div>
      )}
    </section>
  );
}
