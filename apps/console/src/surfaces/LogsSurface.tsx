// apps/console/src/surfaces/LogsSurface.tsx -- the Logs (decision LOG) surface (IP-CONSOLE-09 LG.3).
//
// The authoritative, filterable table of every governed decision. The controls (search / confidence /
// outcome / time range) compile to a `LogQueryFilter` that the BFF sends to crdb's LOG_QUERY; the engine
// applies every filter, so the table only renders the page it is given (INV-CONSOLE-LOGS-REAL: no
// client-side filtering, no fabricated row). Loading is a skeleton; an engine error degrades to an
// ErrorState with a retry; no matches is an honest empty state that echoes the active filters. Rows are
// inert here -- the row -> entity-drawer drill-in + the decision EXPLAIN land in LG.5.

import { useMemo, useState, type ReactElement } from 'react';
import { Badge, DataTable, type BadgeVariant, type DataTableColumn } from '@forge/design';
import type { DecisionStatus, LogQueryFilter, LogRow } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useLogs } from './useLogs.js';

/** The default page size (matches the BFF default; the engine clamps to its per-tenant ceiling). */
const PAGE_LIMIT = 100;

/** A time-range preset -> a `since` lower bound (unix ms), or undefined for "all time". */
const RANGES: Readonly<Record<string, number | undefined>> = {
  all: undefined,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

/** Map a decision status to the Badge's semantic variant (color cue; the label carries the meaning too). */
function statusVariant(status: DecisionStatus): BadgeVariant {
  if (status === 'denied') return 'critical';
  if (status === 'flagged') return 'caution';
  return 'good';
}

/** Format a unix-ms instant as a compact UTC timestamp (stable, locale-independent). */
function formatAt(atMillis: number): string {
  return new Date(atMillis).toISOString().replace('T', ' ').slice(0, 19);
}

const COLUMNS: readonly DataTableColumn<LogRow>[] = [
  { id: 'at', header: 'Time (UTC)', cell: (r) => formatAt(r.at), width: '11rem' },
  {
    id: 'decision',
    header: 'Decision',
    cell: (r) => (
      <span className="fcx-log-decision">
        <span className="fcx-log-decision__summary">{r.summary}</span>
        <span className="fcx-log-decision__rule">{r.ruleId}</span>
      </span>
    ),
  },
  {
    id: 'technique',
    header: 'ATT&CK',
    cell: (r) => (r.technique === '' ? '--' : r.technique),
    width: '8rem',
  },
  {
    id: 'confidence',
    header: 'Confidence',
    cell: (r) => (r.confidence === '' ? '--' : r.confidence),
    width: '8rem',
  },
  {
    id: 'outcome',
    header: 'Outcome',
    cell: (r) => <Badge variant={statusVariant(r.status)}>{r.outcome}</Badge>,
    width: '9rem',
  },
];

/** The Logs surface: filter controls + the live decision-LOG table + honest states. */
export function LogsSurface(): ReactElement {
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState('');
  const [action, setAction] = useState('');
  const [range, setRange] = useState('all');

  // The controls compile to the engine filter. A blank control does not constrain (undefined). `since`
  // derives from the preset relative to now, resolved at render (the query key captures the value).
  const filter = useMemo<LogQueryFilter>(() => {
    const window = RANGES[range];
    const trimmed = search.trim();
    return {
      ...(trimmed !== '' ? { search: trimmed } : {}),
      ...(confidence !== '' ? { confidence } : {}),
      ...(action !== '' ? { action } : {}),
      ...(window !== undefined ? { since: Date.now() - window } : {}),
      limit: PAGE_LIMIT,
    };
  }, [search, confidence, action, range]);

  const logs = useLogs(filter);
  const activeFilters = [
    search.trim() !== '' ? `search "${search.trim()}"` : null,
    confidence !== '' ? `confidence ${confidence}` : null,
    action !== '' ? `outcome ${action}` : null,
    range !== 'all' ? `last ${range}` : null,
  ].filter((f): f is string => f !== null);

  return (
    <section className="fcx-surface" aria-labelledby="surface-logs">
      <h2 id="surface-logs" className="fcx-surface__heading">
        Logs
      </h2>

      <div className="fcx-log-controls" role="search">
        <label className="fcx-field">
          <span className="fcx-field__label">Search</span>
          <input
            type="search"
            className="fcx-input"
            value={search}
            placeholder="finding, rule, or evidence"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Confidence</span>
          <select
            className="fcx-input"
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
          >
            <option value="">Any</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="CONTESTED">Contested</option>
          </select>
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Outcome</span>
          <select className="fcx-input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Any</option>
            <option value="escalate">Escalate</option>
            <option value="candidate">Candidate</option>
            <option value="observe-only">Observe only</option>
          </select>
        </label>
        <label className="fcx-field">
          <span className="fcx-field__label">Time range</span>
          <select className="fcx-input" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="all">All time</option>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
        </label>
      </div>

      {logs.isLoading ? (
        <LoadingState label="Loading decisions" />
      ) : logs.isError ? (
        <ErrorState title="Could not load the decision log." onRetry={() => void logs.refetch()} />
      ) : (
        <DataTable
          caption="Governed decisions, newest first"
          columns={COLUMNS}
          rows={logs.data?.rows ?? []}
          rowKey={(r) => r.decisionId}
          empty={
            <EmptyState
              title="No decisions match"
              hint={
                activeFilters.length > 0
                  ? `No governed decision matches ${activeFilters.join(', ')}.`
                  : 'No governed decisions have been recorded yet.'
              }
            />
          }
        />
      )}
    </section>
  );
}
