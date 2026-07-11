// packages/contracts/src/entity.ts -- the entity-drawer contract (IP-CONSOLE-12 DR.1).
//
// The shared right-side drawer (TRD-CONSOLE-12) opens on ANY entity from ANY surface and shows that
// entity's real detail plus its confirm-gated quick actions. This module is the ONE home for its data
// contract (INV-CONSOLE-CONTRACTS-SINGLE-SOURCE): the entity ref, the six section view models, the
// per-section state envelope, the aggregate detail view, and the quick-action command shapes. Both tiers
// import it -- the BFF resolvers (DR.3) produce these view models from engine reads, the SPA drawer
// (DR.2) renders them -- so a drifted field fails compilation on both sides (the cross-module gap guard,
// AI Quality Guide bug category 3).
//
// DR.1 lands the TYPES only; no live data. The view models are Console PROJECTIONS of the engine DTOs
// (`WireDecision`, `WireAuditEntry`, and the branded ids), narrowed and tier-redacted server-side. The
// mapping from a DTO to a view model lives in the DR.3 resolver; the contract test proves the projection
// is well-typed against the generated DTOs.

import type { DecisionId, PolicyId, PrincipalId, VtzId, ObjectId } from './ids.js';

/**
 * The kind of thing the drawer describes. The trigger passes an {@link EntityRef} `{ kind, id }`; the
 * drawer is kind-aware and populates only the sections that apply to that kind (TRD-CONSOLE-12 Section 3).
 */
export type EntityKind = 'principal' | 'vtz' | 'object';

/**
 * A typed reference to the entity the drawer is opened on. The `id` brand is tied to the `kind` so a
 * `VtzId` can never be passed as a `principal` ref (the discriminated union is exhaustively narrowable).
 */
export type EntityRef =
  | { readonly kind: 'principal'; readonly id: PrincipalId }
  | { readonly kind: 'vtz'; readonly id: VtzId }
  | { readonly kind: 'object'; readonly id: ObjectId };

/**
 * The state of a single drawer section (TRD-CONSOLE-12 Section 6). Sections resolve independently under
 * tolerant parallelism, so each carries its own state: a failed section degrades to `error` without
 * failing the drawer, a section above the operator's tier is `unauthorized` (absent, never a disabled
 * placeholder), a section whose binding is not live yet is `pending` (never a fabricated row), and a
 * section that does not apply to this entity kind is `not-applicable` (distinct from `empty`, which means
 * the section applies but the engine returned nothing).
 */
export type SectionState<T> =
  | { readonly status: 'ok'; readonly data: T }
  | { readonly status: 'empty' }
  | { readonly status: 'not-applicable' }
  | { readonly status: 'pending'; readonly owningRepo: string; readonly gatingTask: string }
  | { readonly status: 'unauthorized' }
  | { readonly status: 'error'; readonly message: string };

// -- Section 3.1: header + status (principal, VTZ) --------------------------------------------------

/**
 * The lifecycle status of an entity, projected from the engine's agent directory (`AigAgentRecord.status`
 * via LIST_AGENTS): `active`, `suspended`, or `compromised`. `unknown` when the entity has no engine
 * status (e.g. a VTZ or an object). Trust Score was removed as a legacy of the old architecture; the
 * header shows this real status instead of a computed score.
 */
export type EntityStatus = 'active' | 'suspended' | 'compromised' | 'unknown';

/**
 * The drawer header: identity + the entity's real lifecycle status. A projection of the engine's agent
 * directory (LIST_AGENTS); no trust score.
 */
export interface HeaderView {
  readonly displayName: string;
  /** The human `kind` label, e.g. "Agent", "Virtual Trust Zone". */
  readonly kindLabel: string;
  /** The entity's lifecycle status (the engine's agent status), or `unknown`. */
  readonly status: EntityStatus;
}

// -- Section 3.2: entity information ----------------------------------------------------------------

/**
 * The entity record projection, from the engine agent directory (`AigAgentRecord` via LIST_AGENTS),
 * tier-redacted server-side. Real record fields -- no trust-era `trustState`/`riskScore`/`region` (the
 * status is shown in the header). `enrolledAt` is unix seconds; `tags` carries the remaining record
 * attributes as `key=value` strings.
 */
export interface EntityInfoView {
  /** The operator role the record carries (from its attributes), when present. */
  readonly role?: string;
  /** The clearance label the record carries, when present. */
  readonly clearance?: string;
  /** When the entity was first enrolled/recorded (unix seconds). */
  readonly enrolledAt: number;
  /** The remaining record attributes as `key=value` tags. */
  readonly tags: readonly string[];
}

// -- Section 3.3: connected VTZs (principal, object) ------------------------------------------------

/** A VTZ this entity currently traverses/belongs to; clickable through to TRD-CONSOLE-02. */
export interface ConnectedZone {
  readonly id: VtzId;
  readonly name: string;
}

/** The live VTZ membership from the Forge model (TRD-32 v2) joined against the connectivity LOG. */
export interface ZonesView {
  readonly zones: readonly ConnectedZone[];
}

// -- Section 3.4: capabilities (AI agent principal) -------------------------------------------------

/**
 * One capability an agent holds. `name` is the target (a tool / authority / sub-agent id from the AIG
 * capability graph, or a report entry once the signed decomposition is bound); `surface` names the
 * category it came from (e.g. "tools", "authority", "delegation" for the AIG graph, or a Construction
 * Report surface). Typed toward this stable shape rather than an ad-hoc parse (the schema-bypass guard,
 * AI Quality Guide bug category 6).
 */
export interface AgentCapabilityRow {
  readonly name: string;
  readonly surface: string;
}

/**
 * Where an agent's capabilities were resolved from: the crdb **AIG capability graph** (the
 * tools/authority/delegation edges, `FIND agent_capabilities`, Console-CAPABILITIES VR.3) or the signed
 * **Construction Report** (Torch `torch-inspect`, the 10-surface decomposition, Phase B / CR.4). The
 * view shape is identical across both, so the drawer upgrades to the richer source with no rework.
 */
export type CapabilitySource = 'aig-graph' | 'construction-report';

/**
 * The capabilities section. `capabilities` for an agent whose capability rows resolved (labelled with the
 * `source` they came from); `none` for a non-agent entity (the section is `not-applicable` at the
 * {@link SectionState} level). Never a fabricated capability -- a read failure degrades to `error` and an
 * agent with no edges to `empty`.
 */
export type CapabilitiesView =
  | {
      readonly kind: 'capabilities';
      readonly source: CapabilitySource;
      readonly capabilities: readonly AgentCapabilityRow[];
    }
  | { readonly kind: 'none' };

// -- Section 3.5: effective policies (principal, object) --------------------------------------------

/** The resolved effect of a policy on the subject (TRD-04 precedence: explicit Deny > Allow > default Deny). */
export type PolicyEffect = 'allow' | 'deny';

/** Where an effective policy comes from: a subject-specific rule, or inherited from a governing VTZ. */
export type PolicyOrigin =
  { readonly kind: 'direct' } | { readonly kind: 'inherited'; readonly fromZone: VtzId };

/** One policy in force on the entity, labelled with its resolved effect and origin; clickable to TRD-CONSOLE-05. */
export interface EffectivePolicyRow {
  readonly id: PolicyId;
  readonly name: string;
  readonly effect: PolicyEffect;
  readonly origin: PolicyOrigin;
}

/** The engine's policy resolution for this subject, each row carrying its resolved source. */
export interface EffectivePoliciesView {
  readonly policies: readonly EffectivePolicyRow[];
}

// -- Section 3.6: recent events / decisions ---------------------------------------------------------

/**
 * The semantic classification of a decision outcome, used to pick the badge's semantic color (never a
 * hand-picked hex). Derived server-side from the engine decision; the human `outcome` label is carried
 * verbatim alongside it.
 */
export type DecisionStatus = 'success' | 'pass' | 'denied' | 'flagged';

/**
 * One recent governed decision for the entity, projected from a `WireDecision` over the LOG (the same
 * substrate TRD-CONSOLE-09 Logs surfaces at row level). `at` is the decision's unix-millis time, resolved
 * from the LOG / `WireAuditEntry` (a `WireDecision` itself carries no timestamp). Clickable through to the
 * decision's EXPLAIN rationale.
 */
export interface RecentDecisionRow {
  readonly decisionId: DecisionId;
  /** The engine rule that fired (`WireDecision.rule_id`). */
  readonly ruleId: string;
  /** A short subject/summary of the decision, e.g. "External DB Access". */
  readonly summary: string;
  /** The engine's outcome label, e.g. "Denied" / "Success" / "Pass". */
  readonly outcome: string;
  readonly status: DecisionStatus;
  readonly at: number;
}

/** The entity's most recent decisions, newest first. */
export interface RecentDecisionsView {
  readonly decisions: readonly RecentDecisionRow[];
}

// -- The aggregate detail view ----------------------------------------------------------------------

/**
 * The whole drawer payload -- one aggregated read (`entity.detail`, TRD-CONSOLE-12 Section 5) that fans
 * the section reads out server-side with tolerant parallelism. Every section is a {@link SectionState},
 * so a per-section failure, absence, tier-redaction, or pending binding is modelled in the type rather
 * than crashing the drawer. The drawer is kind-aware: a section that does not apply to `ref.kind`
 * resolves to `not-applicable`.
 */
export interface EntityDetailView {
  readonly ref: EntityRef;
  readonly header: SectionState<HeaderView>;
  readonly info: SectionState<EntityInfoView>;
  readonly zones: SectionState<ZonesView>;
  readonly capabilities: SectionState<CapabilitiesView>;
  readonly effectivePolicies: SectionState<EffectivePoliciesView>;
  readonly recentDecisions: SectionState<RecentDecisionsView>;
}

// -- Section 3.7: quick-action command shapes -------------------------------------------------------

/**
 * The common envelope for every quick-action command. `commandId` is the engine idempotency key: a
 * retried confirm carries the same id so the engine does not double-apply the mutation (TRD-CONSOLE-12
 * Section 7 failure semantics).
 */
export interface CommandEnvelope {
  readonly ref: EntityRef;
  readonly commandId: string;
}

/** The containment posture applied by Isolate (the TRD-32 v2 lattice `Quarantine`/`Deny`). */
export type ContainmentPosture = 'quarantine' | 'deny';

/** The Isolate-from-network command: move the entity to a quarantine posture. Destructive, confirm-gated. */
export interface IsolateRequest extends CommandEnvelope {
  readonly posture: ContainmentPosture;
}

/**
 * The exact effect shown at the Isolate confirm step and returned by the command. `enforcementActive`
 * reports whether live kernel-level (BPF-LSM) enforcement is in effect -- it is deliberately OFF (AG.7,
 * the observe/quarantine posture), so the command records intent and audits it but `enforcementActive` is
 * `false`; it is NEVER reported active when it is not.
 */
export interface IsolateEffect {
  readonly posture: ContainmentPosture;
  readonly enforcementActive: boolean;
  readonly summary: string;
}

/** The Modify-VTZ-assignment command: a Forge VTZ membership change. Confirm-gated. */
export interface ReassignZoneRequest extends CommandEnvelope {
  readonly zoneId: VtzId;
}

/** The View-Remediation action: open the entity's remediation workflow (AIOps Workflows, TRD-CONSOLE-07). */
export type RemediationRequest = CommandEnvelope;

/** The Open-full-report action: open the entity's full report (TRD-CONSOLE-08). Navigation, not a mutation. */
export type FullReportRequest = CommandEnvelope;

/** The set of quick actions the drawer exposes; each maps to a registered `entity.*` command binding. */
export type QuickAction = 'isolate' | 'reassignZone' | 'remediation' | 'fullReport';
