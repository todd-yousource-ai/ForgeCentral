// apps/bff/src/engine/soc.ts -- the SOC Operations read resolvers (IP-CONSOLE-03 S3.2).
//
// Projects the crdb SOC substrate reads into the Console view models: `soc.incidents` is the ranked
// decision queue (SOC_INCIDENT_LIST, crdb SS.4b), `soc.incident.detail` is one incident assembled --
// lineage, evidence, plan, narrative reference -- in ONE answer (SOC_INCIDENT_DETAIL, SS.4b), and
// `soc.narrative` is the recorded verdict write-up (SOC_NARRATIVE, VN.7b). All three are
// engine-bounded, tenant-private, and operator-delegated via `OperatorEngine`
// (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED: a payload carrying an engine tag the contract cannot narrow collapses the WHOLE
// response to `SocUnavailableError`. On this surface that is not fussiness -- a mis-rendered edge
// state or authority is a security-relevant lie, and a queue silently missing an incident reads as a
// calmer environment than the one the analyst is standing in.
//
// THE ENGINE'S REFUSALS ARE PRESERVED, NOT REINTERPRETED:
//   * An over-ceiling queue is REFUSED by the engine rather than truncated. That refusal surfaces as
//     `SocUnavailableError` (503), never as an empty queue -- rendering "no open incidents" for a
//     queue too large to return is the one direction a SOC number must never fail in.
//   * An unknown incident, another tenant's, and one above the caller's clearance are ONE
//     indistinguishable refusal by design (crdb SS.4b). The resolver preserves that: it returns
//     `null` for all three and the route maps it to a single 404. Reconstructing a difference here
//     would rebuild the oracle the engine deliberately removed.
//   * A narrative is never an error. Absent, refused, and published are three legitimate states the
//     surface renders distinctly, so the resolver returns all three intact.

import type {
  BusinessImpact,
  CaseActDraft,
  CaseActResult,
  CognitionRunState,
  DispositionDraft,
  DispositionResult,
  IncidentActRow,
  IncidentNote,
  IncidentTelemetry,
  ResponseStepDraft,
  SocIncidentDetail,
  SocIncidentRow,
  SocKpis,
  SocPlanEffect,
  VerdictNarrative,
  WireDetectSummaryQuery,
  WireSocIncidentDetailQuery,
  WireSocIncidentListQuery,
  WireSocAuditQuery,
  WireSocCognitionRun,
  WireSocImpactQuery,
  WireSocNarrativeQuery,
  WireSocNotesQuery,
  WireSocPlanApprove,
  WireSocPlanModify,
  WireSocTelemetryQuery,
  SocReport,
  WireSocReportQuery,
  SocWeekly,
  WireSocWeeklyQuery,
  SocSettings,
  SocSettingsPatch,
  SocSettingsReceipt,
  WireSocSettingsCommit,
  WireSocSettingsQuery,
} from '@forge/contracts';
import {
  toAuditTrail,
  toBusinessImpact,
  toCaseActResult,
  toCognitionRunState,
  toDispositionResult,
  toIncidentDetail,
  toIncidentTelemetry,
  toIncidentNotes,
  toIncidentQueue,
  toPlanEffect,
  toSocKpis,
  toVerdictNarrative,
  toWireCaseAct,
  toWireDisposition,
  toWirePlanSteps,
  toSocReport,
  toSocWeekly,
  toSocSettings,
  toSocSettingsReceipt,
  toWireSocSettingsCommitFields,
} from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine returned a SOC payload the Console cannot render honestly; the route surfaces 503. */
export class SocUnavailableError extends Error {
  constructor(what: string) {
    super(`SOC read cannot be rendered honestly: ${what}`);
    this.name = 'SocUnavailableError';
  }
}

/**
 * The queue page size requested of the engine.
 *
 * The engine clamps this to its own ceiling (crdb `MAX_QUEUE_ROWS`) and REFUSES rather than
 * truncating when a tenant has more open incidents than that, so this is a request, not a bound the
 * Console enforces. Asking for the engine's own maximum means the Console never introduces a second,
 * smaller, invisible limit of its own.
 */
const QUEUE_LIMIT = 200;

let nextRequestId = 1n;
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/**
 * Resolve the ranked decision queue.
 *
 * The order is the ENGINE's (authority first, then posture, confidence, recency, id) and is passed
 * through untouched: the same authority field drives the `Decision Waiting` KPI, so a re-sort here
 * would make two panels disagree about what is blocking a person.
 */
export async function resolveIncidentQueue(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly SocIncidentRow[]> {
  const request: WireSocIncidentListQuery = { request_id: requestId(), limit: QUEUE_LIMIT };
  const list = await engine.socIncidentList(principal, request, opts);
  const queue = toIncidentQueue(list);
  if (queue === null) {
    // Both causes land here on purpose: the engine refused the queue (over its ceiling), or a row
    // carries a tag the Console cannot narrow. Either way the honest answer is "this queue cannot
    // be shown", never a shorter queue that reads as the whole one.
    throw new SocUnavailableError(
      list.refused
        ? `the engine refused the queue (${list.explanation ?? 'no reason given'})`
        : 'an incident row carries an unknown engine tag',
    );
  }
  return queue;
}

/**
 * Resolve one incident, assembled.
 *
 * `null` when the engine refused -- unknown, another tenant's, or above the caller's clearance, all
 * indistinguishable by design. A payload that arrives but cannot be narrowed is a different failure
 * (`SocUnavailableError`): the incident exists and the Console cannot draw it honestly, which the
 * operator needs told rather than shown as "not found".
 */
export async function resolveIncidentDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<SocIncidentDetail | null> {
  const request: WireSocIncidentDetailQuery = { request_id: requestId(), incident };
  const wire = await engine.socIncidentDetail(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const detail = toIncidentDetail(wire);
  if (detail === null) {
    throw new SocUnavailableError('the incident carries an unknown lane, edge state, or authority');
  }
  return detail;
}

/**
 * Resolve one incident's recorded verdict narrative.
 *
 * Never triggers generation (crdb VN.7b is a read), and never collapses the three states: `found`
 * false means nobody has looked, `published` false means the pipeline looked and would not stand
 * behind it, and an operator deciding from this screen needs to tell those apart.
 */
export async function resolveNarrative(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<VerdictNarrative> {
  const request: WireSocNarrativeQuery = { request_id: requestId(), incident };
  const wire = await engine.socNarrative(principal, request, opts);
  const narrative = toVerdictNarrative(wire);
  if (narrative === null) {
    throw new SocUnavailableError('a withheld claim carries an unknown ruling');
  }
  return narrative;
}

/**
 * Resolve the five KPI tiles.
 *
 * Reads BOTH the detection summary and the queue, because `Decision Waiting` has no engine field of
 * its own -- it is derived from the same authority the queue orders by, which is what makes the tile
 * and the queue incapable of disagreeing.
 *
 * A refused summary is `SocUnavailableError`, never a partial strip: five numbers read as sharing a
 * window, and showing three of them against a window the other two do not describe is the kind of
 * quiet wrongness this surface exists to avoid.
 */
export async function resolveSocKpis(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<SocKpis> {
  const summaryRequest: WireDetectSummaryQuery = { request_id: requestId() };
  const [summary, queue] = await Promise.all([
    engine.detectSummary(principal, summaryRequest, opts),
    resolveIncidentQueue(engine, principal, opts),
  ]);
  const kpis = toSocKpis(summary, queue);
  if (kpis === null) {
    throw new SocUnavailableError('the engine refused the detection summary');
  }
  return kpis;
}

/**
 * Approve an incident's response plan on the operator's behalf (crdb SS.5).
 *
 * `atRevision` must echo the revision the operator was SHOWN. The engine refuses a stale one rather
 * than applying an authorization to steps they never read, and that refusal reaches the route as an
 * `EngineRefusedError` carrying `Conflict`.
 *
 * The effect is returned intact, INCLUDING `enforcementActive: false`. A resolver that dropped that
 * flag on a successful approval would let the surface render containment that did not happen.
 */
export async function resolveApprovePlan(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  atRevision: number,
  opts?: EngineCallOptions,
): Promise<SocPlanEffect> {
  const request: WireSocPlanApprove = {
    request_id: requestId(),
    incident,
    at_revision: atRevision,
  };
  const effect = await engine.socPlanApprove(principal, request, opts);
  const view = toPlanEffect(effect);
  if (view === null) {
    throw new SocUnavailableError('the approved plan carries a step the Console cannot narrow');
  }
  return view;
}

/**
 * Replace an unapproved plan's steps on the operator's behalf (crdb SS.5).
 *
 * Steps carry title + action ONLY; the engine assigns authority and state. Refused once the plan is
 * approved, so the audit trail can never say an operator approved steps they never saw.
 */
export async function resolveModifyPlan(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  steps: readonly ResponseStepDraft[],
  opts?: EngineCallOptions,
): Promise<SocPlanEffect> {
  const request: WireSocPlanModify = {
    request_id: requestId(),
    incident,
    steps: [...toWirePlanSteps(steps)],
  };
  const effect = await engine.socPlanModify(principal, request, opts);
  const view = toPlanEffect(effect);
  if (view === null) {
    throw new SocUnavailableError('the modified plan carries a step the Console cannot narrow');
  }
  return view;
}

/**
 * Resolve the dock's Raw Telemetry pane (crdb ED.2): the incident's cited evidence and every leg
 * resolved to the record behind it -- or the honest reason it cannot be (`aged_out`, `restricted`),
 * reported WITH its reference rather than omitted.
 *
 * `null` for the engine's one indistinguishable refusal (unknown / foreign / over-clearance).
 */
export async function resolveIncidentTelemetry(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<IncidentTelemetry | null> {
  const request: WireSocTelemetryQuery = { request_id: requestId(), incident };
  const wire = await engine.socTelemetry(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const telemetry = toIncidentTelemetry(wire);
  if (telemetry === null) {
    throw new SocUnavailableError('a telemetry row carries an unknown anchor, outcome, or kind');
  }
  return telemetry;
}

/**
 * Resolve the dock's Audit Trail pane (crdb ED.3): the operator acts recorded against this
 * incident, an INDEX into the hash-chained audit record -- never a second log, and never assembled
 * client-side from the live stream.
 */
export async function resolveAuditTrail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<readonly IncidentActRow[] | null> {
  const request: WireSocAuditQuery = { request_id: requestId(), incident };
  const wire = await engine.socAudit(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const trail = toAuditTrail(wire);
  if (trail === null) {
    throw new SocUnavailableError('an audit act carries an unknown verb');
  }
  return trail;
}

/**
 * Resolve the Business impact panel (crdb ED.4 + ED.5).
 *
 * The BAND never waits on a model -- it is deterministic Rust recomputed on every read. The
 * sentence arrives in its three honest states, and `not_assessed` is a state the surface renders,
 * never a gap it fills. A READ: it must not trigger generation (that is the Generate control's
 * explicit job), or opening an incident would spend minutes of model time per viewer.
 */
export async function resolveBusinessImpact(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<BusinessImpact | null> {
  const request: WireSocImpactQuery = { request_id: requestId(), incident };
  const wire = await engine.socImpact(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const impact = toBusinessImpact(wire);
  if (impact === null) {
    throw new SocUnavailableError('the impact carries an unknown band or sentence state');
  }
  return impact;
}

/**
 * Read one incident's shaped report (crdb C.5, `SOC_INCIDENT_REPORT`): the six sections, each with
 * its declared source. A READ: it never triggers generation. `null` is the engine's one
 * indistinguishable refusal; a report whose sections do not narrow is unavailable, never rendered
 * under a guessed label.
 */
export async function resolveIncidentReport(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<SocReport | null> {
  const request: WireSocReportQuery = { request_id: requestId(), incident };
  const wire = await engine.socReport(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const report = toSocReport(wire);
  if (report === null) {
    throw new SocUnavailableError(
      'the report carries an unknown section, source or narrative state',
    );
  }
  return report;
}

/** The most weeks a Console read asks for. TUNE: the engine clamps to 12; the tab shows a quarter. */
export const MAX_WEEKLY_WEEKS = 12;

/**
 * Read the last `weeks` ISO weeks of detection volume (crdb C.9b, `SOC_WEEKLY_SUMMARY`): every
 * number derived by the engine from its persisted rollup and episode records. `null` is the
 * engine's refusal; weeks out of order are unavailable, never re-sorted here.
 */
export async function resolveWeekly(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  weeks: number,
  opts?: EngineCallOptions,
): Promise<SocWeekly | null> {
  const request: WireSocWeeklyQuery = {
    request_id: requestId(),
    weeks: Math.min(Math.max(1, Math.trunc(weeks)), MAX_WEEKLY_WEEKS),
  };
  const wire = await engine.socWeekly(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const weekly = toSocWeekly(wire);
  if (weekly === null) {
    throw new SocUnavailableError('the weekly summary is not in week order');
  }
  return weekly;
}

/**
 * Read the committed SOC settings the Console binds (crdb C.9c, `SOC_SETTINGS_READ`). `null` is the
 * engine's refusal (a tier below Admin / SecurityAudit); an unnarrowable vendor or ceiling is
 * unavailable, never rendered under a guessed label.
 */
export async function resolveSocSettings(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<SocSettings | null> {
  const request: WireSocSettingsQuery = { request_id: requestId() };
  const wire = await engine.socSettingsRead(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const settings = toSocSettings(wire);
  if (settings === null) {
    throw new SocUnavailableError('the settings carry an unknown vendor or ceiling');
  }
  return settings;
}

/**
 * Commit a typed SOC settings patch (crdb C.9c, `SOC_SETTINGS_COMMIT`), Admin tier only, on the
 * operator's behalf. The reply is a RECEIPT: a refusal (tier, dual control, validation) is a state
 * the form renders with the engine's own violations, never a throw.
 */
export async function resolveSocSettingsCommit(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  patch: SocSettingsPatch,
  opts?: EngineCallOptions,
): Promise<SocSettingsReceipt> {
  const request: WireSocSettingsCommit = {
    request_id: requestId(),
    ...toWireSocSettingsCommitFields(patch),
  };
  return toSocSettingsReceipt(await engine.socSettingsCommit(principal, request, opts));
}

/**
 * Start a cognition run for one incident (crdb SOC_COGNITION_RUN), on the operator's behalf and
 * audited under them.
 *
 * The reply is what the engine DID with the request -- started / running / recorded / refused --
 * never the run's result. A narrative is `1 + 2N` model calls on a bounded sidecar; the run is
 * explicit and deduplicated engine-side, and the Console polls the reads for the outcome.
 */
export async function resolveCognitionRun(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<CognitionRunState> {
  const request: WireSocCognitionRun = { request_id: requestId(), incident };
  const wire = await engine.socCognitionRun(principal, request, opts);
  const state = toCognitionRunState(wire);
  if (state === null) {
    throw new SocUnavailableError('the run state is outside the contract vocabulary');
  }
  return state;
}

/**
 * Apply one operator case act -- assign / ack / note / close -- on the operator's behalf (crdb
 * IP-AISOC-STEP1 C.1). One engine transaction: the act's effect and its audit row commit together.
 * An in-band refusal (unknown incident, already closed, a blank or over-long note) is returned AS a
 * refusal with the engine's reason, never swallowed and never rendered as a recorded act.
 */
export async function resolveCaseAct(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  draft: CaseActDraft,
  opts?: EngineCallOptions,
): Promise<CaseActResult> {
  const wire = await engine.socIncidentAct(
    principal,
    toWireCaseAct(draft, incident, requestId()),
    opts,
  );
  const result = toCaseActResult(wire);
  if (result === null) {
    throw new SocUnavailableError('the recorded act carries a verb the Console cannot narrow');
  }
  return result;
}

/** Resolve the dock's case notes (crdb C.1): each note was written with its `noted` audit act. */
export async function resolveIncidentNotes(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<readonly IncidentNote[] | null> {
  const request: WireSocNotesQuery = { request_id: requestId(), incident };
  const wire = await engine.socNotes(principal, request, opts);
  return toIncidentNotes(wire);
}

/**
 * Record the operator's closure verdict (crdb SC.7 / GV.4): the training signal, the closure out of
 * both SOC channels, and the audit act in one transaction. `false_positive` is the ONE verdict that
 * down-weights the rule tenant-wide; the three true-positive verdicts are calibration's positive
 * labels. Refusals are in-band with the engine's reason.
 */
export async function resolveDisposition(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  draft: DispositionDraft,
  opts?: EngineCallOptions,
): Promise<DispositionResult> {
  const wire = await engine.socDisposition(
    principal,
    toWireDisposition(draft, incident, requestId()),
    opts,
  );
  const result = toDispositionResult(wire);
  if (result === null) {
    throw new SocUnavailableError(
      'the recorded disposition carries a verdict the Console cannot narrow',
    );
  }
  return result;
}
