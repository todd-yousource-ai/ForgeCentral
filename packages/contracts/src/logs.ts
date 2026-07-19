// packages/contracts/src/logs.ts -- the Logs (decision LOG) contract (IP-CONSOLE-09 LG.1).
//
// The Logs surface (TRD-CONSOLE-09) is the authoritative, searchable record of every governed decision --
// the Crucible LOG. This module is the ONE home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-
// SOURCE): the row + detail view models (Console PROJECTIONS of the engine DTOs) and the query filter
// shape. Both tiers import it -- the BFF resolver (LG.2) produces these view models from the crdb
// LOG_QUERY / LOG_EXPLAIN reads, the SPA table (LG.3) renders them -- so a drifted field fails
// compilation on both sides (the cross-module gap guard, AI Quality Guide bug category 3).
//
// LG.1 lands the TYPES only; no table, no live data. The view models are narrowed, tier-redacted
// projections of the generated DTOs (`WireDecisionRow` for a row, `WireDecisionDetail` for the EXPLAIN
// detail). The DTO -> view-model mapping lives in the LG.2 resolver; the contract test proves the
// projection is well-typed against the generated DTOs.
//
// GROUNDED-COLUMN NOTE (INV-CONSOLE-LOGS-REAL): the mock Logs screen shows Time / Entity / Category /
// Decision / Trust delta / VTZ / Confidence. Grounded against what the engine actually emits on a decision
// row (`WireDecisionRow`), only Time, Decision (rule + finding + advisory outcome), the ATT&CK technique /
// tactics, Confidence, and the evidence count are real at row level. Entity, Category, and VTZ are NOT
// carried on a decision row (the acting entity is resolved on drill-in via `logs.explain` ->
// {@link LogDetailView.actingEntity}; VTZ is Forge-side, the same cross-repo deferral the drawer named);
// Trust delta is removed (a legacy of the old architecture, dropped in the drawer's DR.1). Those columns
// render empty/absent in the table, never fabricated.

import type { DecisionId } from './ids.js';
import type { DecisionStatus, EntityRef } from './entity.js';

/**
 * One row of the decision LOG, projected from a `WireDecisionRow` (`logs.query`). Every field is a real
 * decision fact; the row is the unit the table lists and the unit a click drills into ({@link
 * LogDetailView}). `outcome` is the advisory recommended posture, never an enforcement fact.
 */
export interface LogRow {
  readonly decisionId: DecisionId;
  /**
   * The decision's time, unix MILLISECONDS. The engine emits `created_at` in unix seconds; the LG.2
   * resolver scales it, so the SPA renders it directly as a JS timestamp (matching the drawer's
   * `RecentDecisionRow.at` convention).
   */
  readonly at: number;
  /** The engine rule that fired (`WireDecisionRow.rule_id`). */
  readonly ruleId: string;
  /** A short human summary of the decision (`WireDecisionRow.finding`), e.g. "Suspicious command". */
  readonly summary: string;
  /** The advisory recommended posture tag (`observe-only` / `candidate` / `escalate`), never enforcement. */
  readonly outcome: string;
  /** The semantic classification for the row's badge color, derived from `outcome` server-side. */
  readonly status: DecisionStatus;
  /** The ATT&CK technique anchor the decision fired on (`WireDecisionRow.technique`). */
  readonly technique: string;
  /** The ATT&CK tactics the decision maps to. */
  readonly tactics: readonly string[];
  /** The confidence-tier tag (`HIGH`/`MEDIUM`/`LOW`/`CONTESTED`); empty when the detector emitted none. */
  readonly confidence: string;
  /** How many evidence nodes back the decision; the full evidence set is on the detail (`logs.explain`). */
  readonly evidenceCount: number;
}

/**
 * The full detail of one governed decision, projected from a `WireDecisionDetail` (`logs.explain`). This
 * is the "see a decision's why" drill-in: the row fields plus the blast-radius scope, the source
 * entities/context/observations, the correlation id, and the replay anchor. The engine stores no ML-DSA
 * signature on a decision, so this detail surfaces the rationale honestly and carries no fabricated
 * signature (one is added additively when decision signing lands).
 */
export interface LogDetailView {
  readonly decisionId: DecisionId;
  /** The decision's time, unix MILLISECONDS (see {@link LogRow.at}). */
  readonly at: number;
  readonly ruleId: string;
  readonly finding: string;
  readonly technique: string;
  readonly tactics: readonly string[];
  readonly evidence: readonly string[];
  readonly confidence: string;
  /** The advisory recommended posture tag, never an enforcement fact. */
  readonly outcome: string;
  /** The blast-radius scope the decision applies to. */
  readonly scope: string;
  readonly sourceHosts: readonly string[];
  readonly sourceSubjects: readonly string[];
  /** The LEG neighborhood context (`"RELATION:node"`) the decision was built over. */
  readonly sourceContext: readonly string[];
  /** The LOG observation ids the decision was built over. */
  readonly sourceObservations: readonly string[];
  readonly correlationId: string;
  /** The replay-anchor commit version the decision is reproducible at. */
  readonly replayAsOf: number;
  readonly watermarkSeconds: number;
  readonly windowSeconds: number;
  /** The SHA-512 digest binding the id to `(as_of, watermark, window)`. */
  readonly replayDigest: string;
  /**
   * The acting entity for the row -> entity-drawer click (LG.5), derived server-side from the decision's
   * source subjects/hosts (a process subject, else a host). `null` when the decision names no source
   * entity, so the drill-in is disabled rather than opening an empty drawer.
   */
  readonly actingEntity: EntityRef | null;
}

/**
 * The filter for a tenant-wide LOG read (`logs.query` -> crdb `LOG_QUERY`). Every filter is optional and
 * AND-combined; the engine applies them, so the Console never filters client-side (INV-CONSOLE-LOGS-REAL).
 * `since`/`until` are unix MILLISECONDS (the resolver converts to the engine's unix seconds).
 */
export interface LogQueryFilter {
  readonly since?: number;
  readonly until?: number;
  /** Exact ATT&CK technique anchor. */
  readonly technique?: string;
  /** ATT&CK tactic membership. */
  readonly tactic?: string;
  /** Exact engine rule id. */
  readonly ruleId?: string;
  /** Confidence-tier tag (`HIGH`/`MEDIUM`/`LOW`/`CONTESTED`). */
  readonly confidence?: string;
  /** Recommended-posture tag (`observe-only`/`candidate`/`escalate`). */
  readonly action?: string;
  /** Free-text substring over the finding, the rule id, and the evidence (compiled to the predicate). */
  readonly search?: string;
  /** The maximum number of most-recent matching rows to return (bounded further by the engine ceiling). */
  readonly limit: number;
  /** Rows to skip before the page (SQ.8b background paging); absent = the first page. */
  readonly offset?: number;
}

/**
 * A page of the decision LOG (`logs.query` result). Newest-first and bounded. Deep cursor paging beyond
 * the engine's result ceiling is a named crdb deferral (single-shot bounded read today), so no cursor is
 * modelled yet; the field is added additively when the engine's cursor paging lands.
 */
export interface LogPage {
  readonly rows: readonly LogRow[];
}

/**
 * An operator's request to export the filtered LOG (`logs.export` -> crdb `LOG_EXPORT`). The export is a
 * REAL audited engine op -- the engine records a receipt on the audit chain -- so the Console never
 * assembles a client-side CSV of a plain read; it downloads the rows the audited op returns. Idempotent by
 * `commandId`.
 */
export interface LogExportRequest {
  readonly commandId: string;
  readonly filter: LogQueryFilter;
}

/**
 * The result of an audited `logs.export`: the exported rows plus the audit receipt (`exportId` +
 * `commitVersion`) proving it landed on the chain. The Console shows the receipt and offers the rows as a
 * download of the audited set.
 */
export interface LogExportView {
  /** The content address of the committed export manifest (the audit receipt id). */
  readonly exportId: string;
  /** The commit version the audited export landed at (its audit-chain position); 0 on an idempotent replay. */
  readonly commitVersion: number;
  readonly rowCount: number;
  readonly rows: readonly LogRow[];
}
