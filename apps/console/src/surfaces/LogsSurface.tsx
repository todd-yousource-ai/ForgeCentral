// apps/console/src/surfaces/LogsSurface.tsx -- the Logs (decision LOG) surface (IP-CONSOLE-09 LG.3, LG.5).
//
// The authoritative, filterable table of every governed decision. The controls (search / confidence /
// outcome / time range) compile to a `LogQueryFilter` that the BFF sends to crdb's LOG_QUERY; the engine
// applies every filter, so the table only renders the page it is given (INV-CONSOLE-LOGS-REAL: no
// client-side filtering, no fabricated row). Loading is a skeleton; an engine error degrades to an
// ErrorState with a retry; no matches is an honest empty state that echoes the active filters.
//
// LG.5 (row interaction): the Decision cell opens that decision's EXPLAIN rationale inline (logs.explain);
// activating a row opens the entity drawer for the decision's acting entity (the select-then-act
// drill-in, IP-CONSOLE-12 reused), and a row hover prefetches its detail so the open is instant. Both the
// row activation and the EXPLAIN panel's "View acting entity" open the same drawer.

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, DataTable, type BadgeVariant, type DataTableColumn } from '@forge/design';
import type { DecisionStatus, LogQueryFilter, LogRow } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useDrawer } from '../shell/DrawerHost.js';
import { downloadExport, useExportLogs } from './useExportLogs.js';
import { fetchLogExplain, logExplainQueryKey, useLogExplain, useLogs } from './useLogs.js';

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

/**
 * The live-tail indicator (LG.4): `Paused` when the operator paused the poll; `Reconnecting` when a
 * background poll failed but stale rows are still shown; otherwise `Live`. Pure so the derivation is tested
 * directly. `degraded` is a failed refetch that kept its data (INV-CONSOLE-LIVE: honest, never a fake live).
 */
export function liveIndicator(opts: { readonly paused: boolean; readonly degraded: boolean }): {
  readonly label: string;
  readonly variant: BadgeVariant;
} {
  if (opts.paused) return { label: 'Paused', variant: 'neutral' };
  if (opts.degraded) return { label: 'Reconnecting', variant: 'caution' };
  return { label: 'Live', variant: 'good' };
}

/** The Logs surface: filter controls + the live decision-LOG table + the EXPLAIN drill-in + honest states. */
export function LogsSurface(): ReactElement {
  const [search, setSearch] = useState('');
  const [confidence, setConfidence] = useState('');
  const [action, setAction] = useState('');
  const [range, setRange] = useState('all');
  const [explainId, setExplainId] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);

  const drawer = useDrawer();
  const queryClient = useQueryClient();
  const exportLogs = useExportLogs();

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

  const logs = useLogs(filter, !paused);
  const explain = useLogExplain(explainId);

  // A failed background poll that kept its rows is a reconnecting (degraded) live state, not a full error;
  // the full ErrorState is only the initial load with no data at all.
  const degraded = logs.isError && logs.data !== undefined;
  const showFullError = logs.isError && logs.data === undefined;
  const live = liveIndicator({ paused, degraded });

  // Warm the EXPLAIN cache on row hover/focus so a click opens the drawer / rationale instantly.
  const prefetchDetail = useCallback(
    (row: LogRow) => {
      void queryClient.prefetchQuery({
        queryKey: logExplainQueryKey(row.decisionId),
        queryFn: () => fetchLogExplain(row.decisionId),
      });
    },
    [queryClient],
  );

  // Activate a row -> open the entity drawer for the decision's acting entity (resolved from the cached
  // EXPLAIN detail). A decision that names no acting entity opens its EXPLAIN rationale instead of a drawer.
  const openRow = useCallback(
    (row: LogRow) => {
      void queryClient
        .fetchQuery({
          queryKey: logExplainQueryKey(row.decisionId),
          queryFn: () => fetchLogExplain(row.decisionId),
        })
        .then((detail) => {
          if (detail.actingEntity !== null) drawer.openEntity(detail.actingEntity);
          else setExplainId(row.decisionId);
        })
        .catch(() => setExplainId(row.decisionId));
    },
    [queryClient, drawer],
  );

  const columns = useMemo<readonly DataTableColumn<LogRow>[]>(
    () => [
      { id: 'at', header: 'Time (UTC)', cell: (r) => formatAt(r.at), width: '11rem' },
      {
        id: 'decision',
        header: 'Decision',
        cell: (r) => (
          <button
            type="button"
            className="fcx-log-decision fcx-log-decision--button"
            aria-expanded={explainId === r.decisionId}
            onClick={(e) => {
              e.stopPropagation();
              setExplainId((cur) => (cur === r.decisionId ? null : r.decisionId));
            }}
          >
            <span className="fcx-log-decision__summary">{r.summary}</span>
            <span className="fcx-log-decision__rule">{r.ruleId}</span>
          </button>
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
    ],
    [explainId],
  );

  const activeFilters = [
    search.trim() !== '' ? `search "${search.trim()}"` : null,
    confidence !== '' ? `confidence ${confidence}` : null,
    action !== '' ? `outcome ${action}` : null,
    range !== 'all' ? `last ${range}` : null,
  ].filter((f): f is string => f !== null);

  return (
    <section className="fcx-surface" aria-labelledby="surface-logs">
      <div className="fcx-surface__header">
        <h2 id="surface-logs" className="fcx-surface__heading">
          Logs
        </h2>
        <div className="fcx-log-live">
          <Badge variant={live.variant}>{live.label}</Badge>
          <button
            type="button"
            className="fcx-btn"
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            type="button"
            className="fcx-btn"
            disabled={exportLogs.isPending}
            onClick={() => {
              exportLogs.mutate(
                { commandId: crypto.randomUUID(), filter },
                { onSuccess: (view) => downloadExport(view) },
              );
            }}
          >
            {exportLogs.isPending ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      {exportLogs.isSuccess ? (
        <p className="fcx-log-export-result" role="status">
          Exported {exportLogs.data.rowCount} decision(s); audit receipt{' '}
          <code>{exportLogs.data.exportId.slice(0, 16)}</code>
          {exportLogs.data.commitVersion > 0
            ? ` recorded at version ${String(exportLogs.data.commitVersion)}.`
            : ' (already recorded).'}
        </p>
      ) : null}
      {exportLogs.isError ? (
        <p className="fcx-log-export-result" role="alert">
          The export was refused or unavailable. Nothing was recorded.
        </p>
      ) : null}

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
      ) : showFullError ? (
        <ErrorState title="Could not load the decision log." onRetry={() => void logs.refetch()} />
      ) : (
        <DataTable
          caption="Governed decisions, newest first"
          columns={columns}
          rows={logs.data?.rows ?? []}
          rowKey={(r) => r.decisionId}
          onRowActivate={openRow}
          rowLabel={(r) => `Open the acting entity for ${r.summary}`}
          onRowHover={prefetchDetail}
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

      {explainId !== null ? (
        <aside className="fcx-log-explain" aria-label="Decision rationale">
          <div className="fcx-log-explain__head">
            <h3 className="fcx-log-explain__title">Why this decision fired</h3>
            <button type="button" className="fcx-btn" onClick={() => setExplainId(null)}>
              Close
            </button>
          </div>
          {explain.isLoading ? (
            <LoadingState label="Loading the rationale" />
          ) : explain.isError || explain.data === undefined ? (
            <ErrorState
              title="Could not load the rationale."
              onRetry={() => void explain.refetch()}
            />
          ) : (
            <dl className="fcx-log-explain__body">
              <div>
                <dt>Finding</dt>
                <dd>{explain.data.finding}</dd>
              </div>
              <div>
                <dt>Rule</dt>
                <dd>{explain.data.ruleId}</dd>
              </div>
              <div>
                <dt>ATT&CK</dt>
                <dd>
                  {explain.data.technique === '' ? '--' : explain.data.technique}
                  {explain.data.tactics.length > 0 ? ` (${explain.data.tactics.join(', ')})` : ''}
                </dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>{explain.data.scope === '' ? '--' : explain.data.scope}</dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>
                  {explain.data.evidence.length > 0
                    ? explain.data.evidence.join(', ')
                    : 'None recorded'}
                </dd>
              </div>
              {explain.data.actingEntity !== null ? (
                <div>
                  <dt>Acting entity</dt>
                  <dd>
                    <button
                      type="button"
                      className="fcx-btn"
                      onClick={() => {
                        if (explain.data?.actingEntity != null)
                          drawer.openEntity(explain.data.actingEntity);
                      }}
                    >
                      View {explain.data.actingEntity.id}
                    </button>
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </aside>
      ) : null}
    </section>
  );
}
