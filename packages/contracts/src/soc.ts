// packages/contracts/src/soc.ts -- the SOC Operations contract (IP-CONSOLE-03 S3.1).
//
// The SOC Ops surface (TRD-CONSOLE-03) is a DECISION surface, not a dashboard: a ranked queue of open
// incidents, one incident's lineage graph, the generated verdict, and the evidence behind it. This
// module is the ONE home for its data contract (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the view models
// the SPA renders and the BFF resolver produces, typed against the generated crdb wire DTOs. Both tiers
// import it, so a drifted field fails compilation on both sides.
//
// The engine half is the crdb SOC substrate (crdb IP-SOC-SUBSTRATE SS.1-SS.N + SS.5, all landed and
// capstone-proven 2026-07-26) plus the verdict narrative (IP-SOC-VERDICT-NARRATIVE VN.7/VN.8, live).
// S3.1 lands the TYPES + projections only; no route, no surface.
//
// GROUNDED-DESIGN NOTES (INV-SOC-NO-FABRICATED-NUMBER):
//   * THERE IS NO SCORE. The prototype leads each queue card with a 94.1 and a dollar exposure. The
//     engine records neither, and `TRD-CONSOLE-03` Section 9 omits the fields rather than estimating
//     them. There is no `score` on `SocIncidentRow` and there must not be one: a composite number an
//     analyst would trust, computed from arithmetic nobody specified, is worse than a blank.
//   * RANKING IS THE ENGINE'S. The queue arrives ordered by what an incident needs from a human
//     (`AuthorityState`), then posture, confidence, recency, id. `toIncidentQueue` preserves that
//     order and the surface must not re-sort: the same field drives the `Decision Waiting` count, and
//     a client-side sort would make two panels disagree about what is blocking a person.
//   * EDGE STATE IS NEVER UPGRADED (INV-SOC-EDGE-STATE-HONEST). `observed` is backed by a cited
//     telemetry leg, `inferred` is the correlator with no direct leg, `verified` means an action was
//     carried out, `pending` is waiting on a human. With enforcement OFF nothing is ever `verified`,
//     so a graph rendered from this contract shows an approved-but-refused containment as `pending`.
//   * AUTO-CONTAINED IS 0, HONESTLY. The counter counts EXECUTION, never authorization, and
//     enforcement is OFF (AG.7). `SocPlanEffect.enforcementActive` is the same fact at command level:
//     a successful approval is an AUTHORIZATION, and a surface that rendered it as containment would
//     tell an analyst the agent was stopped while it is still running.
//   * THERE IS NO PLAN YET. crdb has no production PROPOSER (`propose_plan` has no caller outside
//     tests), so `SocIncidentDetail.plan` is an honest empty array on a live box until that lands.
//     The Console must render that emptiness, never compose a plan client-side: INV-SOC-PLAN-DURABLE
//     forbids exactly that, and the approve command would refuse a plan the engine never stored.
//
// Every narrowing is FAIL-CLOSED: an engine authority/posture/confidence/lane/kind/edge-state/step-state
// tag the Console does not know collapses the WHOLE projection to `null` rather than rendering a guessed
// disposition. On a security surface a mis-rendered edge state or authority is a lie with consequences,
// and a blank panel that says so is strictly better than a confident wrong one.

import type {
  WireIncidentRow,
  WireLineageEdge,
  WireLineageNode,
  WirePlanStep,
  WirePlanStepInput,
  WireSocIncidentDetail,
  WireSocIncidentList,
  WireSocNarrative,
  WireSocPlanEffect,
  WireWithheldClaim,
} from './generated/wire-dto.js';

// -- closed vocabularies (each pinned by a crdb accessor, never a Debug rendering) -------------------

/**
 * What an incident needs from a human (crdb `AuthorityState::as_str`). This is the queue's PRIMARY
 * ordering key and the `Decision Waiting` KPI's source -- one field, so the two can never disagree.
 *
 * Order here is declaration order, NOT urgency: use `isWaitingOnAHuman` for the KPI and trust the
 * engine's ordering for the queue.
 */
export const AUTHORITY_STATES = [
  'automatic',
  'approval_required',
  'review_required',
  'contained',
] as const;
export type AuthorityState = (typeof AUTHORITY_STATES)[number];

/** The advisory posture (crdb `posture_tag`, the vocabulary shared across the whole wire). */
export const INCIDENT_POSTURES = ['observe-only', 'candidate', 'escalate'] as const;
export type IncidentPosture = (typeof INCIDENT_POSTURES)[number];

/** The confidence tier (crdb `ConfidenceTier::tag`; uppercase is the shared on-wire spelling). */
export const CONFIDENCE_TIERS = ['HIGH', 'MEDIUM', 'LOW', 'CONTESTED'] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

/** Which band of the lineage graph a node draws in (crdb `LineageLane::tag`). */
export const LINEAGE_LANES = ['attack_path', 'evidence', 'decision'] as const;
export type LineageLane = (typeof LINEAGE_LANES)[number];

/** What kind of thing a lineage node is (crdb `LineageNodeKind::tag`). */
export const LINEAGE_NODE_KINDS = [
  'subject',
  'network',
  'process',
  'evidence',
  'decision',
  'response',
] as const;
export type LineageNodeKind = (typeof LINEAGE_NODE_KINDS)[number];

/**
 * How well-founded a lineage edge is (crdb `EdgeState::tag`). The Console draws all four distinctly
 * and NEVER upgrades one (INV-SOC-EDGE-STATE-HONEST) -- an inferred edge rendered as observed is the
 * surface asserting something the engine did not.
 */
export const EDGE_STATES = ['observed', 'inferred', 'verified', 'pending'] as const;
export type EdgeState = (typeof EDGE_STATES)[number];

/** Where one response step stands (crdb `PlanStepState::tag`). */
export const PLAN_STEP_STATES = ['proposed', 'approved', 'executed', 'refused'] as const;
export type PlanStepState = (typeof PLAN_STEP_STATES)[number];

/** The containment actions a response step may carry (crdb `Action`, containment rungs only). */
export const RESPONSE_ACTIONS = ['quarantine', 'deny'] as const;
export type ResponseAction = (typeof RESPONSE_ACTIONS)[number];

/**
 * How the skeptic ruled on a claim it WITHHELD (crdb `Ruling`, the withheld subset).
 *
 * The engine's `Ruling` has a third variant, `supported` -- but a supported claim is published, not
 * withheld, so its appearance in this list would be an engine bug. Narrowing closed on these two is
 * what makes that bug visible instead of rendering a rejection the pipeline never made.
 */
export const WITHHELD_RULINGS = ['overstated', 'unsupported'] as const;
export type WithheldRuling = (typeof WITHHELD_RULINGS)[number];

// -- view models ------------------------------------------------------------------------------------

/**
 * One row of the decision queue (`WireIncidentRow`).
 *
 * Deliberately carries NO score and NO exposure. See the module header: the engine records neither.
 */
export interface SocIncidentRow {
  /** The incident (episode) id. */
  readonly incidentId: string;
  /** The rule that fired. */
  readonly ruleId: string;
  /** The ATT&CK technique anchor (e.g. `T1071`). */
  readonly anchor: string;
  /** The attributed subject (an agent, a process, an account). */
  readonly subject: string;
  /** The human finding summary. */
  readonly finding: string;
  /** What it needs from a human. The queue's primary ordering key. */
  readonly authority: AuthorityState;
  /** The advisory posture the gate reached. */
  readonly posture: IncidentPosture;
  /** The confidence tier the gate reached. */
  readonly confidence: ConfidenceTier;
  /** When it opened (unix seconds). */
  readonly openedAt: number;
  /** When it last fired (unix seconds). */
  readonly lastSeen: number;
  /** How many distinct evidence legs it cites. */
  readonly evidenceCount: number;
}

/** One node of the lineage graph. */
export interface LineageNode {
  /** Stable within one detail read; edges reference it. */
  readonly id: string;
  readonly lane: LineageLane;
  readonly kind: LineageNodeKind;
  readonly label: string;
  /** The secondary line; empty when there is nothing true to say. */
  readonly sublabel: string;
}

/** One edge of the lineage graph. */
export interface LineageEdge {
  readonly from: string;
  readonly to: string;
  readonly state: EdgeState;
}

/**
 * One cited evidence leg, for the investigation dock.
 *
 * The engine returns the leg REFERENCE only; the dock follows it to `LOG_EXPLAIN` for the record
 * itself. Carrying a ref rather than an inlined record is what keeps opening an incident one read.
 */
export interface EvidenceRow {
  /** The leg reference (e.g. `leg:net:198.51.100.7`). */
  readonly leg: string;
}

/** One step of the coordinated response plan. */
export interface ResponseStep {
  /** Position in the plan, from 0. The order is the response's order. */
  readonly ordinal: number;
  /** What the step does, in an analyst's language. */
  readonly title: string;
  /**
   * The containment action, or null for an INVESTIGATIVE step.
   *
   * Null is not a missing value: an investigative step ("inspect adjacent workspaces") changes no
   * state and needs no enforcement to complete.
   */
  readonly action: ResponseAction | null;
  /** Who must authorize this step. */
  readonly authority: AuthorityState;
  /** Where the step stands. */
  readonly state: PlanStepState;
  /** Why it is in that state -- carries the refusal reason on a `refused` step. */
  readonly explanation: string;
}

/**
 * One incident, assembled (`WireSocIncidentDetail`). ONE read populates every panel
 * (INV-SOC-ONE-PAYLOAD): the queue header, the lineage graph, the evidence dock, and the plan.
 */
export interface SocIncidentDetail {
  /** The queue row's fields, so the header needs no second lookup. */
  readonly row: SocIncidentRow;
  readonly nodes: readonly LineageNode[];
  readonly edges: readonly LineageEdge[];
  readonly evidence: readonly EvidenceRow[];
  /**
   * The response plan's steps. EMPTY until crdb ships a plan proposer -- an honest absence, and the
   * surface renders it as one rather than composing a plan client-side.
   */
  readonly plan: readonly ResponseStep[];
  /** The plan's revision; an approval must echo it back or be refused as stale. */
  readonly planRevision: number;
  /** Whether an operator has approved the plan. */
  readonly planApproved: boolean;
  /**
   * The narrative artifact's reuse key, or null when none is recorded.
   *
   * A REFERENCE. The Console reads `SOC_NARRATIVE` separately, so opening an incident never triggers
   * generation and cannot pay for two model runs over the same evidence.
   */
  readonly narrativeRef: string | null;
}

/**
 * One claim the skeptic withheld from the published narrative (`WireWithheldClaim`).
 *
 * Carries what was claimed, how it was ruled, why, AND what it cited, so an analyst can check the
 * evidence themselves rather than take the pipeline's word for the rejection. This is the substance
 * of the `Model Reasoning` dock pane: what the model was given, and what was thrown away.
 */
export interface WithheldClaim {
  /** The section it would have appeared in. */
  readonly section: string;
  /** What it said. */
  readonly text: string;
  /** How it was ruled. */
  readonly ruling: WithheldRuling;
  /**
   * Why it landed there, in the adjudicator's words.
   *
   * A sentence an analyst reads, not an enumerable code -- `ruling` above is the typed part.
   */
  readonly explanation: string;
  /** The evidence ids it cited. */
  readonly cited: readonly string[];
}

/**
 * The generated verdict write-up (`WireSocNarrative`), always rendered as GENERATED and always linked
 * to its artifact (INV-SOC-NARRATIVE-LABELLED).
 *
 * Three states stay distinguishable, because an operator must be able to tell "nobody has looked" from
 * "the pipeline looked and would not stand behind it":
 *   * `found: false`          -- no run recorded. Nobody has looked.
 *   * `published: false`      -- a run exists and was REFUSED; `refusal` says why.
 *   * `published: true`       -- the write-up stands, with its grounding set and adjudications.
 */
export interface VerdictNarrative {
  /** Whether any run is recorded for this incident. */
  readonly found: boolean;
  /** Whether the recorded run was published (false = the pipeline refused to stand behind it). */
  readonly published: boolean;
  /** Why the run was refused, when it was; null on a published or absent narrative. */
  readonly refusal: string | null;
  /** The generated headline. Empty unless published. */
  readonly headline: string;
  /** The narrative body, one entry per paragraph. Empty unless published. */
  readonly narrative: readonly string[];
  /** The assessed impact statements. */
  readonly impact: readonly string[];
  /** The recommended response statements. */
  readonly response: readonly string[];
  /** The evidence the write-up is grounded in (the `Model Reasoning` dock pane). */
  readonly citedEvidence: readonly string[];
  /** The claims the skeptic threw out, and why (also the `Model Reasoning` pane). */
  readonly withheld: readonly WithheldClaim[];
  /** Whether the pipeline flagged this for human review. */
  readonly needsHumanReview: boolean;
  /** The model binding the run used. */
  readonly modelRef: string;
  /** The content address of the run's input (the artifact link). */
  readonly inputHash: string;
}

/**
 * The effect of a plan command (`WireSocPlanEffect`), carrying the plan as it now stands so the
 * surface re-renders from the engine's answer rather than from what it assumed the command would do.
 */
export interface SocPlanEffect {
  readonly incidentId: string;
  /** The revision AFTER the command. */
  readonly revision: number;
  readonly approved: boolean;
  readonly steps: readonly ResponseStep[];
  /**
   * Whether any step was actually CARRIED OUT. False on this deployment (AG.7).
   *
   * The surface must render this, never treat a successful approval as containment. An approved
   * containment step comes back `refused` with its reason; the authorization is real, the containment
   * did not happen.
   */
  readonly enforcementActive: boolean;
}

/** A step as the operator composes it for `SOC_PLAN_MODIFY` (title + action only). */
export interface ResponseStepDraft {
  readonly title: string;
  /** Null for an investigative step. */
  readonly action: ResponseAction | null;
}

// -- fail-closed narrowers (an unknown engine tag returns null) --------------------------------------

function toAuthority(tag: string): AuthorityState | null {
  return (AUTHORITY_STATES as readonly string[]).includes(tag) ? (tag as AuthorityState) : null;
}
function toPosture(tag: string): IncidentPosture | null {
  return (INCIDENT_POSTURES as readonly string[]).includes(tag) ? (tag as IncidentPosture) : null;
}
function toConfidence(tag: string): ConfidenceTier | null {
  return (CONFIDENCE_TIERS as readonly string[]).includes(tag) ? (tag as ConfidenceTier) : null;
}
function toLane(tag: string): LineageLane | null {
  return (LINEAGE_LANES as readonly string[]).includes(tag) ? (tag as LineageLane) : null;
}
function toNodeKind(tag: string): LineageNodeKind | null {
  return (LINEAGE_NODE_KINDS as readonly string[]).includes(tag) ? (tag as LineageNodeKind) : null;
}
function toEdgeState(tag: string): EdgeState | null {
  return (EDGE_STATES as readonly string[]).includes(tag) ? (tag as EdgeState) : null;
}
function toStepState(tag: string): PlanStepState | null {
  return (PLAN_STEP_STATES as readonly string[]).includes(tag) ? (tag as PlanStepState) : null;
}

/**
 * A step's action. An EMPTY tag is an investigative step (a real, valid step), so it narrows to
 * `null` ACTION rather than a failed projection -- the one place where absence is meaningful rather
 * than unknown. Any other unrecognized tag fails the projection closed.
 */
function toResponseAction(
  tag: string | undefined,
): { readonly action: ResponseAction | null } | null {
  if (tag === undefined || tag === '') {
    return { action: null };
  }
  const lowered = tag.toLowerCase();
  return (RESPONSE_ACTIONS as readonly string[]).includes(lowered)
    ? { action: lowered as ResponseAction }
    : null;
}

// -- projections ------------------------------------------------------------------------------------

/** Project one queue row. FAIL-CLOSED on an unknown authority, posture, or confidence tag. */
export function toIncidentRow(row: WireIncidentRow): SocIncidentRow | null {
  const authority = toAuthority(row.authority);
  const posture = toPosture(row.posture);
  const confidence = toConfidence(row.confidence);
  if (authority === null || posture === null || confidence === null) {
    return null;
  }
  return {
    incidentId: row.incident_id,
    ruleId: row.rule_id,
    anchor: row.anchor,
    subject: row.subject,
    finding: row.finding,
    authority,
    posture,
    confidence,
    openedAt: row.opened_at,
    lastSeen: row.last_seen,
    evidenceCount: row.evidence_count,
  };
}

/**
 * Project the `SOC_INCIDENT_LIST` reply into the ranked queue, IN THE ENGINE'S ORDER.
 *
 * `null` on a refusal (the engine refused rather than truncating an over-ceiling queue) or on one
 * malformed row. One bad row collapses the WHOLE queue, not just itself: a queue silently missing an
 * incident reads as a calmer environment than the one the analyst is standing in, which is the single
 * direction a SOC number must never fail in.
 */
export function toIncidentQueue(list: WireSocIncidentList): readonly SocIncidentRow[] | null {
  if (list.refused) {
    return null;
  }
  const rows: SocIncidentRow[] = [];
  for (const wireRow of list.rows) {
    const row = toIncidentRow(wireRow);
    if (row === null) {
      return null;
    }
    rows.push(row);
  }
  return rows;
}

/** Project one lineage node. FAIL-CLOSED on an unknown lane or kind. */
function toLineageNode(node: WireLineageNode): LineageNode | null {
  const lane = toLane(node.lane);
  const kind = toNodeKind(node.kind);
  if (lane === null || kind === null) {
    return null;
  }
  return { id: node.id, lane, kind, label: node.label, sublabel: node.sublabel };
}

/** Project one lineage edge. FAIL-CLOSED on an unknown state -- the state IS the meaning. */
function toLineageEdge(edge: WireLineageEdge): LineageEdge | null {
  const state = toEdgeState(edge.state);
  return state === null ? null : { from: edge.from, to: edge.to, state };
}

/** Project one response step. FAIL-CLOSED on an unknown authority, state, or action. */
export function toResponseStep(step: WirePlanStep): ResponseStep | null {
  const authority = toAuthority(step.authority);
  const state = toStepState(step.state);
  const action = toResponseAction(step.action);
  if (authority === null || state === null || action === null) {
    return null;
  }
  return {
    ordinal: step.ordinal,
    title: step.title,
    action: action.action,
    authority,
    state,
    explanation: step.explanation ?? '',
  };
}

/**
 * Project the `SOC_INCIDENT_DETAIL` reply.
 *
 * `null` when the engine refused (unknown incident, another tenant's, or above the caller's
 * clearance -- one indistinguishable refusal by design) or when any node, edge, row, or step fails to
 * narrow. A partially-drawn lineage graph is worse than none: the operator cannot tell which hop is
 * missing, and every hop that IS drawn looks equally complete.
 */
export function toIncidentDetail(detail: WireSocIncidentDetail): SocIncidentDetail | null {
  if (detail.refused) {
    return null;
  }
  const row = toIncidentRow(detail.row);
  if (row === null) {
    return null;
  }
  const nodes: LineageNode[] = [];
  for (const wireNode of detail.nodes) {
    const node = toLineageNode(wireNode);
    if (node === null) {
      return null;
    }
    nodes.push(node);
  }
  const edges: LineageEdge[] = [];
  for (const wireEdge of detail.edges) {
    const edge = toLineageEdge(wireEdge);
    if (edge === null) {
      return null;
    }
    edges.push(edge);
  }
  const plan: ResponseStep[] = [];
  for (const wireStep of detail.plan) {
    const step = toResponseStep(wireStep);
    if (step === null) {
      return null;
    }
    plan.push(step);
  }
  return {
    row,
    nodes,
    edges,
    evidence: detail.evidence.map((leg) => ({ leg })),
    plan,
    planRevision: detail.plan_revision,
    planApproved: detail.plan_approved,
    narrativeRef:
      detail.narrative_ref === undefined || detail.narrative_ref === ''
        ? null
        : detail.narrative_ref,
  };
}

function toWithheldRuling(tag: string): WithheldRuling | null {
  return (WITHHELD_RULINGS as readonly string[]).includes(tag) ? (tag as WithheldRuling) : null;
}

function toWithheldClaim(claim: WireWithheldClaim): WithheldClaim | null {
  const ruling = toWithheldRuling(claim.ruling);
  if (ruling === null) {
    return null;
  }
  return {
    section: claim.section,
    text: claim.text,
    ruling,
    explanation: claim.explanation,
    cited: claim.cited,
  };
}

/**
 * Project the `SOC_NARRATIVE` reply.
 *
 * `null` ONLY on an unnarrowable withheld ruling. The three legitimate states (absent / refused /
 * published) all project successfully and the surface renders them distinctly -- collapsing those
 * would lose exactly the distinction an operator needs, so they are states, not failures.
 */
export function toVerdictNarrative(narrative: WireSocNarrative): VerdictNarrative | null {
  const withheld: WithheldClaim[] = [];
  for (const wireClaim of narrative.withheld) {
    const claim = toWithheldClaim(wireClaim);
    if (claim === null) {
      return null;
    }
    withheld.push(claim);
  }
  return {
    found: narrative.found,
    published: narrative.published,
    refusal:
      narrative.refusal === undefined || narrative.refusal === null || narrative.refusal === ''
        ? null
        : narrative.refusal,
    headline: narrative.headline,
    narrative: narrative.narrative,
    impact: narrative.impact,
    response: narrative.response,
    citedEvidence: narrative.cited_evidence,
    withheld,
    needsHumanReview: narrative.needs_human_review,
    modelRef: narrative.model_ref,
    inputHash: narrative.input_hash,
  };
}

/** Project a plan command's effect. FAIL-CLOSED on any step that does not narrow. */
export function toPlanEffect(effect: WireSocPlanEffect): SocPlanEffect | null {
  const steps: ResponseStep[] = [];
  for (const wireStep of effect.steps) {
    const step = toResponseStep(wireStep);
    if (step === null) {
      return null;
    }
    steps.push(step);
  }
  return {
    incidentId: effect.incident,
    revision: effect.revision,
    approved: effect.approved,
    steps,
    enforcementActive: effect.enforcement_active,
  };
}

/**
 * Build the wire step inputs for `SOC_PLAN_MODIFY`.
 *
 * Carries title + action ONLY. `authority` and `state` are the engine's to assign, and a Console that
 * submitted them could hand over a step claiming to be already `executed`.
 */
export function toWirePlanSteps(steps: readonly ResponseStepDraft[]): readonly WirePlanStepInput[] {
  return steps.map((step) => ({
    title: step.title,
    action: step.action ?? '',
  }));
}

/** Whether this authority state is blocking a person (the `Decision Waiting` KPI's predicate). */
export function isWaitingOnAHuman(authority: AuthorityState): boolean {
  return authority === 'approval_required' || authority === 'review_required';
}
