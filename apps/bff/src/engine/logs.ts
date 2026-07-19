// apps/bff/src/engine/logs.ts -- the Logs (decision LOG) read resolvers (IP-CONSOLE-09 LG.2).
//
// Brokers the Logs surface reads to crdb's LOG_QUERY / LOG_EXPLAIN verbs over the OperatorEngine
// (IP-CONSOLE-LOG-QUERY): the tenant-wide, filtered, time-ranged, searchable decision LOG and the
// decision-by-id EXPLAIN detail. The engine applies every filter (INV-CONSOLE-LOGS-REAL: never a
// client-side filter), the OperatorEngine injects the operator delegation server-side, and these
// resolvers only PROJECT the returned DTOs into the view models (`LogRow` / `LogDetailView`). No value is
// fabricated: a not-emitted field renders empty, and a decision with no source entity yields a null
// acting entity (the row -> drawer drill-in is disabled rather than opening an empty drawer).

import { decisionId, principalId } from '@forge/contracts';
import type {
  EntityRef,
  LogDetailView,
  LogExportRequest,
  LogExportView,
  LogPage,
  LogQueryFilter,
  LogRow,
  WireDecisionDetail,
  WireDecisionRow,
  WireLogQuery,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import { toDecisionStatus } from './entity-detail.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** Project a `WireDecisionRow` into a Logs table row. The engine emits `created_at` in unix SECONDS. */
function toLogRow(row: WireDecisionRow): LogRow {
  return {
    decisionId: decisionId(row.decision_id),
    at: row.created_at * 1000,
    ruleId: row.rule_id,
    summary: row.finding,
    outcome: row.recommended_action,
    status: toDecisionStatus(row.recommended_action),
    technique: row.technique,
    tactics: row.tactics,
    confidence: row.confidence,
    evidenceCount: row.evidence.length,
  };
}

/**
 * The acting entity for the row -> drawer drill-in (LG.5), derived from the decision's source subject (a
 * process identity, an enrolled agent for the drawer). `null` when the decision names no source subject,
 * so the drill-in is disabled rather than opening on a non-entity.
 */
function actingEntityOf(detail: WireDecisionDetail): EntityRef | null {
  const subject = detail.source_subjects[0];
  if (subject !== undefined && subject !== '') {
    return { kind: 'principal', id: principalId(subject) };
  }
  return null;
}

/** Project a `WireDecisionDetail` into the full LOG detail view (`logs.explain`). */
function toLogDetail(detail: WireDecisionDetail): LogDetailView {
  return {
    decisionId: decisionId(detail.decision_id),
    at: detail.created_at * 1000,
    ruleId: detail.rule_id,
    finding: detail.finding,
    technique: detail.technique,
    tactics: detail.tactics,
    evidence: detail.evidence,
    confidence: detail.confidence,
    outcome: detail.recommended_action,
    scope: detail.scope,
    sourceHosts: detail.source_hosts,
    sourceSubjects: detail.source_subjects,
    sourceContext: detail.source_context,
    sourceObservations: detail.source_observations,
    correlationId: detail.correlation_id,
    replayAsOf: detail.replay_as_of,
    watermarkSeconds: detail.watermark_seconds,
    windowSeconds: detail.window_seconds,
    replayDigest: detail.replay_digest,
    actingEntity: actingEntityOf(detail),
  };
}

/** Compile a `LogQueryFilter` (view-model, unix millis) into a `WireLogQuery` (engine, unix seconds). */
function filterToWire(filter: LogQueryFilter): WireLogQuery {
  return {
    request_id: 0,
    since: filter.since !== undefined ? Math.floor(filter.since / 1000) : null,
    until: filter.until !== undefined ? Math.floor(filter.until / 1000) : null,
    technique: filter.technique ?? null,
    tactic: filter.tactic ?? null,
    rule_id: filter.ruleId ?? null,
    confidence: filter.confidence ?? null,
    action: filter.action ?? null,
    search: filter.search ?? null,
    limit: filter.limit,
    ...(filter.offset !== undefined && filter.offset > 0 ? { offset: filter.offset } : {}),
  };
}

/**
 * Resolve a page of the decision LOG for `filter`, brokered on behalf of `principal`. The engine applies
 * every filter + the time range + the bound (LOG_QUERY); this only projects the rows, newest-first.
 */
export async function resolveLogQuery(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  filter: LogQueryFilter,
  opts?: EngineCallOptions,
): Promise<LogPage> {
  const list = await engine.logQuery(principal, filterToWire(filter), opts);
  return { rows: list.decisions.map(toLogRow) };
}

/**
 * Resolve the full detail of one decision by id, brokered on behalf of `principal` (LOG_EXPLAIN). An
 * absent id is refused by the engine (a non-oracle `Refused`), surfaced as an `EngineRefusedError`.
 */
export async function resolveLogExplain(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  decision: string,
  opts?: EngineCallOptions,
): Promise<LogDetailView> {
  const detail = await engine.logExplain(principal, { request_id: 0, decision_id: decision }, opts);
  return toLogDetail(detail);
}

/**
 * Resolve an audited export of the filtered LOG (`LOG_EXPORT`), brokered on behalf of `principal`. The
 * engine records the audit receipt and returns the exported rows; this projects the rows + the receipt.
 * Idempotent by `request.commandId`. `now` is the export instant stamped on the audited receipt.
 */
export async function resolveLogExport(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  request: LogExportRequest,
  now: number,
  opts?: EngineCallOptions,
): Promise<LogExportView> {
  const effect = await engine.logExport(
    principal,
    {
      operator: null,
      query: filterToWire(request.filter),
      command_id: request.commandId,
      issued_at: Math.floor(now / 1000),
    },
    opts,
  );
  return {
    exportId: effect.export_id,
    commitVersion: effect.commit_version,
    rowCount: effect.row_count,
    rows: effect.rows.map(toLogRow),
  };
}
