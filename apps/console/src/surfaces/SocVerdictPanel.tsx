// apps/console/src/surfaces/SocVerdictPanel.tsx -- the FORGE VERDICT panel (IP-CONSOLE-03 S3.6).
//
// What the engine concluded about the selected incident, and what it will and will not stand behind.
//
// HONESTY RULES (INV-SOC-NARRATIVE-LABELLED, INV-SOC-NO-FABRICATED-NUMBER):
//   * The write-up is ALWAYS labelled generated and always linked to its artifact. An operator must
//     never be unsure whether a paragraph was written by a model.
//   * THE THREE NARRATIVE STATES STAY DISTINCT. `found: false` is "nobody has looked".
//     `published: false` is "the pipeline looked and would NOT stand behind it", with its reason.
//     Only `published: true` renders prose. Never a stale narrative, never a templated sentence
//     standing in for one, never blank space.
//   * NO MODEL CONSENSUS. The prototype's "5/5 models agree, 94.1%" describes a model panel this
//     platform does not have -- there is one detection gate. `TRD-CONSOLE-03` Section 5.3 re-grounds
//     the card on the confidence the engine actually computed.
//   * CONTRADICTIONS is TECHNIQUE-scoped and says so. The engine records mute reasons per anchor over
//     the window, not per incident; labelling it precisely is the difference between informing an
//     analyst and letting them read a technique-wide count as this incident's own.
//   * Business impact is the ENGINE's assessment (crdb ED.4 + ED.5): the band a deterministic
//     weighted sum decided, the factors that produced it, and the model's one explaining sentence in
//     its three honest states. Still NO currency figure -- exposure in dollars needs an asset-value
//     plane that does not exist, and a plausible figure on a security surface is worse than a
//     missing one. The sentence, like the narrative, is always labelled generated and never repaired.

import { useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog } from '@forge/design';
import type {
  BusinessImpact,
  SocIncidentDetail,
  SocKpis,
  VerdictNarrative,
  WithheldClaim,
} from '@forge/contracts';
import {
  authorityLabel,
  confidenceLabel,
  suppressingInputsFor,
  type SocSuppressingInputs,
} from '@forge/contracts';

import { ErrorState, LoadingState } from '../states/States.js';
import { authorityVariant } from './SocDecisionQueue.js';
import { SocPlanEditor } from './SocPlanEditor.js';
import { useCognitionRun } from './useCognitionRun.js';
import { PlanCommandError, useApprovePlan, useModifyPlan } from './usePlanCommand.js';
import { useSocImpact, useSocNarrative } from './useSoc.js';

/**
 * The Business impact block (crdb ED.4 + ED.5): band + checkable factors + the sentence in its
 * three honest states. `not_assessed` renders as itself -- the Generate control exists precisely so
 * a read never fills this gap.
 */
function BusinessImpactBlock({
  impact,
}: {
  readonly impact: BusinessImpact | null | undefined;
}): ReactElement {
  if (impact === undefined) {
    return <p className="fcx-socv__state-detail">Loading the impact assessment.</p>;
  }
  if (impact === null) {
    return (
      <p className="fcx-socv__state-detail" data-testid="soc-business-impact">
        The impact cannot be read: the incident is unknown, another tenant&apos;s, or above this
        session&apos;s clearance.
      </p>
    );
  }
  return (
    <div data-testid="soc-business-impact">
      <p className="fcx-socv__state-detail">
        <Badge
          variant={
            impact.band === 'Critical' || impact.band === 'High'
              ? 'caution'
              : impact.band === 'Medium'
                ? 'info'
                : 'neutral'
          }
        >
          {impact.band}
        </Badge>
        <span className="fcx-socv__artifact"> assessed from {impact.factors.length} factor(s)</span>
      </p>
      {impact.sentenceState === 'published' && impact.sentence !== null ? (
        <p className="fcx-socv__state-detail" data-testid="soc-impact-sentence">
          <Badge variant="info">Generated</Badge> {impact.sentence}
        </p>
      ) : impact.sentenceState === 'refused' ? (
        <p className="fcx-socv__state-detail" data-testid="soc-impact-sentence">
          The model&apos;s explanation was refused rather than published
          {impact.sentence === null ? '.' : `: ${impact.sentence}`}
        </p>
      ) : (
        <p className="fcx-socv__state-detail" data-testid="soc-impact-sentence">
          The band is computed; no explaining sentence has been generated yet.
        </p>
      )}
      <ul className="fcx-socv__plan">
        {impact.factors
          .filter((factor) => factor.weightMilli !== 0)
          .map((factor) => (
            <li key={factor.factor} className="fcx-socv__step">
              <span className="fcx-socv__step-title">{factor.factor}</span>
              <Badge variant={factor.weightMilli < 0 ? 'neutral' : 'info'}>
                {factor.weightMilli > 0
                  ? `+${String(factor.weightMilli)}`
                  : String(factor.weightMilli)}
              </Badge>
              <span className="fcx-socv__step-why">{factor.basis}</span>
            </li>
          ))}
      </ul>
      {/* Still no currency figure, on purpose: exposure in dollars needs an asset-value plane the
          platform does not have (INV-SOC-NO-FABRICATED-NUMBER). */}
    </div>
  );
}

/** One stat card. `unavailable` is a first-class render, never an empty box. */
function StatCard({
  label,
  value,
  detail,
}: {
  readonly label: string;
  readonly value: ReactElement | string;
  readonly detail: string;
}): ReactElement {
  return (
    <section className="fcx-socv__stat" aria-label={label}>
      <span className="fcx-socv__stat-label">{label}</span>
      <span className="fcx-socv__stat-value">{value}</span>
      <span className="fcx-socv__stat-detail">{detail}</span>
    </section>
  );
}

/**
 * The CONSENSUS card, re-grounded (Section 5.3).
 *
 * The confidence the gate computed plus the corroboration behind it -- the number of distinct
 * telemetry legs the incident cites. Deliberately NOT a percentage: a percentage implies a
 * denominator, and the only honest one here would be a model panel that does not exist.
 */
function ConsensusCard({ detail }: { readonly detail: SocIncidentDetail }): ReactElement {
  const legs = detail.evidence.length;
  return (
    <StatCard
      label="Consensus"
      value={confidenceLabel(detail.row.confidence)}
      detail={
        legs === 0
          ? 'One detection gate, no corroborating legs cited.'
          : `One detection gate, corroborated by ${String(legs)} cited ${legs === 1 ? 'leg' : 'legs'}.`
      }
    />
  );
}

/** The CONTRADICTIONS card: the gate's suppressing inputs for this TECHNIQUE over the window. */
function ContradictionsCard({
  anchor,
  inputs,
  known,
}: {
  readonly anchor: string;
  readonly inputs: SocSuppressingInputs | null;
  readonly known: boolean;
}): ReactElement {
  if (!known) {
    // The summary read has not landed or failed. Unknown is not zero, and the card says so.
    return (
      <StatCard
        label="Contradictions"
        value="Unavailable"
        detail="The detection summary this is drawn from could not be read."
      />
    );
  }
  const total = (inputs?.falsePositiveFeedback ?? 0) + (inputs?.ratifiedBaseline ?? 0);
  return (
    <StatCard
      label="Contradictions"
      value={String(total)}
      detail={
        total === 0
          ? `Nothing suppressed ${anchor} in this window.`
          : `${String(inputs?.falsePositiveFeedback ?? 0)} by false-positive feedback, ${String(inputs?.ratifiedBaseline ?? 0)} by ratified baseline -- for ${anchor} across the window, not this incident alone.`
      }
    />
  );
}

/** The AUTHORITY card: what this incident needs from a human, the same field the queue orders by. */
function AuthorityCard({ detail }: { readonly detail: SocIncidentDetail }): ReactElement {
  return (
    <StatCard
      label="Authority"
      value={
        <Badge variant={authorityVariant(detail.row.authority)}>
          {authorityLabel(detail.row.authority)}
        </Badge>
      }
      detail="The recorded authority state, not one inferred from severity."
    />
  );
}

/** One withheld claim, with the ruling and the evidence it cited so an analyst can check it. */
function WithheldRow({ claim }: { readonly claim: WithheldClaim }): ReactElement {
  return (
    <li className="fcx-socv__withheld">
      <span className="fcx-socv__withheld-head">
        <Badge variant="caution">{claim.ruling}</Badge>
        <span className="fcx-socv__withheld-section">{claim.section}</span>
      </span>
      <q className="fcx-socv__withheld-text">{claim.text}</q>
      <span className="fcx-socv__withheld-why">{claim.explanation}</span>
    </li>
  );
}

/** The narrative body: one of three distinct states, never collapsed into "unavailable". */
function NarrativeBody({ narrative }: { readonly narrative: VerdictNarrative }): ReactElement {
  if (!narrative.found) {
    return (
      <div className="fcx-socv__narrative fcx-socv__narrative--absent">
        <p className="fcx-socv__state">No write-up has been generated for this incident.</p>
        <p className="fcx-socv__state-detail">
          Nobody has looked. This is not a failure -- the pipeline runs on its own cadence, and the
          structured findings above stand on their own.
        </p>
      </div>
    );
  }
  if (!narrative.published) {
    return (
      <div className="fcx-socv__narrative fcx-socv__narrative--refused">
        <p className="fcx-socv__state">The pipeline would not stand behind its write-up.</p>
        <p className="fcx-socv__state-detail">
          {narrative.refusal ?? 'The run was refused and recorded no reason.'}
        </p>
        <p className="fcx-socv__state-detail">
          The structured findings above are unaffected: they come from the engine, not the model.
        </p>
      </div>
    );
  }
  return (
    <div className="fcx-socv__narrative">
      <h4 className="fcx-socv__headline">{narrative.headline}</h4>
      {narrative.narrative.map((paragraph) => (
        <p key={paragraph} className="fcx-socv__para">
          {paragraph}
        </p>
      ))}
      {narrative.impact.length > 0 ? (
        <>
          <h5 className="fcx-socv__sub">Assessed impact</h5>
          <ul className="fcx-socv__list">
            {narrative.impact.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {narrative.response.length > 0 ? (
        <>
          <h5 className="fcx-socv__sub">Recommended response</h5>
          <ul className="fcx-socv__list">
            {narrative.response.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      {narrative.withheld.length > 0 ? (
        <>
          <h5 className="fcx-socv__sub">Withheld by the skeptic</h5>
          <ul className="fcx-socv__list fcx-socv__list--withheld">
            {narrative.withheld.map((claim) => (
              <WithheldRow key={`${claim.section}:${claim.text}`} claim={claim} />
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export interface SocVerdictPanelProps {
  readonly incidentId: string;
  readonly detail: SocIncidentDetail;
  /** The KPI payload, for the technique-scoped suppressing inputs. Undefined while it is unread. */
  readonly kpis: SocKpis | undefined;
}

export function SocVerdictPanel({ incidentId, detail, kpis }: SocVerdictPanelProps): ReactElement {
  const narrative = useSocNarrative(incidentId);
  const impact = useSocImpact(incidentId);
  const run = useCognitionRun();
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState(false);
  const approve = useApprovePlan();
  const modify = useModifyPlan();
  const executed = detail.plan.filter((step) => step.state === 'executed');

  return (
    <section className="fcx-socv" aria-label="Forge verdict" data-testid="soc-verdict">
      <div className="fcx-socv__stats">
        <ConsensusCard detail={detail} />
        <ContradictionsCard
          anchor={detail.row.anchor}
          inputs={kpis === undefined ? null : suppressingInputsFor(kpis, detail.row.anchor)}
          known={kpis !== undefined}
        />
        <AuthorityCard detail={detail} />
      </div>

      <div className="fcx-socv__generated">
        <h3 className="fcx-socv__title">Forge verdict</h3>
        {/* Always labelled, always linked -- an operator must never wonder whether a model wrote a
            paragraph, or be unable to find the artifact it came from. */}
        <Badge variant="info">Generated</Badge>
        {narrative.data?.found === true ? (
          <span className="fcx-socv__artifact">
            {narrative.data.modelRef} &middot; {narrative.data.inputHash}
          </span>
        ) : null}
      </div>

      {narrative.isPending ? <LoadingState label="Loading the verdict" /> : null}
      {narrative.isError ? (
        <ErrorState
          title="The verdict cannot be shown"
          code={narrative.error instanceof Error ? narrative.error.message : 'unknown'}
          onRetry={() => void narrative.refetch()}
        />
      ) : null}
      {narrative.data ? <NarrativeBody narrative={narrative.data} /> : null}
      {narrative.data?.needsHumanReview === true ? (
        <p className="fcx-socv__review">
          <Badge variant="caution">Flagged for human review</Badge>
        </p>
      ) : null}

      <div className="fcx-socv__controls">
        {/* The ONE control that spends model time (crdb SOC_COGNITION_RUN): explicit, audited under
            this operator, deduplicated engine-side. Opening the incident never generates; this
            button is the only way generation starts, and its reply is what the engine DID, not the
            run's result. */}
        <button
          type="button"
          className="fcx-socv__control"
          data-testid="soc-generate"
          disabled={run.isPending || run.data?.state === 'started' || run.data?.state === 'running'}
          onClick={() => {
            run.mutate(incidentId);
          }}
        >
          Generate verdict
        </button>
        <span className="fcx-socv__controls-note" data-testid="soc-generate-note">
          {run.isPending
            ? 'Asking the engine.'
            : run.isError
              ? run.error.message
              : run.data === undefined
                ? 'Runs the narrative and impact pipelines on the on-box model. Minutes, not seconds.'
                : run.data.state === 'started' || run.data.state === 'running'
                  ? 'The run is in flight. These panels re-read as the records land.'
                  : run.data.state === 'recorded'
                    ? 'Every record for this evidence already exists; nothing was re-generated.'
                    : `The engine refused the run${run.data.detail === null ? '.' : `: ${run.data.detail}`}`}
        </span>
      </div>

      <h5 className="fcx-socv__sub">Already enforced</h5>
      <p className="fcx-socv__state-detail">
        {executed.length === 0
          ? 'Nothing. Enforcement is off on this deployment, so no step of any response has been carried out.'
          : `${String(executed.length)} step(s) carried out.`}
      </p>

      <h5 className="fcx-socv__sub">Business impact</h5>
      <BusinessImpactBlock impact={impact.data} />

      <h5 className="fcx-socv__sub">Coordinated response</h5>
      {detail.plan.length === 0 ? (
        <p className="fcx-socv__state-detail" data-testid="soc-response-empty">
          No response plan has been proposed. The engine records and audits plans, and both operator
          commands exist, but nothing proposes one yet -- so there is nothing here to approve.
        </p>
      ) : (
        <ol className="fcx-socv__plan">
          {detail.plan.map((step) => (
            <li key={step.ordinal} className="fcx-socv__step">
              <span className="fcx-socv__step-title">{step.title}</span>
              <Badge variant={step.state === 'refused' ? 'caution' : 'neutral'}>{step.state}</Badge>
              {step.explanation === '' ? null : (
                <span className="fcx-socv__step-why">{step.explanation}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="fcx-socv__controls">
        {/* Enabled only when there is a plan to act on. With none proposed, approving would send a
            command the engine must refuse -- a control that exists to produce an error is worse than
            one that says why it is unavailable. */}
        <button
          type="button"
          className="fcx-socv__control"
          disabled={detail.plan.length === 0 || detail.planApproved || approve.isPending}
          onClick={() => {
            setConfirming(true);
          }}
        >
          Approve full response
        </button>
        <button
          type="button"
          className="fcx-socv__control"
          // Editing is refused once approved -- an edit under a recorded authorization would make
          // the audit trail say an operator approved steps they never saw.
          disabled={detail.plan.length === 0 || detail.planApproved || editing}
          onClick={() => {
            setEditing(true);
          }}
        >
          Modify plan
        </button>
        <span className="fcx-socv__controls-note">
          {detail.plan.length === 0
            ? 'Nothing to act on: no plan has been proposed.'
            : detail.planApproved
              ? 'This plan is already approved. A second approval is refused, not re-recorded.'
              : 'Approval is audited under your principal, and authorizes only the steps listed above.'}
        </span>
      </div>

      {editing ? (
        <SocPlanEditor
          steps={detail.plan}
          saving={modify.isPending}
          onSave={(steps) => {
            modify.mutate(
              { incidentId, steps },
              // Only close on success: a refusal must leave the operator's edits on screen rather
              // than discarding work and showing them the old plan.
              {
                onSuccess: () => {
                  setEditing(false);
                },
              },
            );
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : null}

      {modify.isError ? (
        <p className="fcx-socv__refusal" role="alert" data-testid="soc-modify-refusal">
          The plan was not changed.{' '}
          {modify.error instanceof PlanCommandError
            ? modify.error.reason
            : 'The command did not reach the engine.'}
        </p>
      ) : null}

      {approve.isError ? (
        <p className="fcx-socv__refusal" role="alert" data-testid="soc-approve-refusal">
          The approval was refused.{' '}
          {approve.error instanceof PlanCommandError
            ? approve.error.reason
            : 'The command did not reach the engine.'}
        </p>
      ) : null}

      {approve.data ? (
        <p className="fcx-socv__outcome" data-testid="soc-approve-outcome">
          {/* NEVER "contained". The engine reports whether anything was carried out, and on this
              deployment nothing was: the authorization is real, the containment did not happen. */}
          {approve.data.enforcementActive
            ? 'Approved, and the response was carried out.'
            : 'Approved and recorded. Nothing was carried out: enforcement is off on this deployment, so each containment step is recorded refused with its reason.'}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        title="Approve the full response?"
        description={`This authorizes ${String(detail.plan.length)} step(s) under your principal and is audited. Enforcement is off on this deployment, so no containment will actually be carried out.`}
        confirmLabel="Approve"
        tone="critical"
        onConfirm={() => {
          setConfirming(false);
          approve.mutate({ incidentId, atRevision: detail.planRevision });
        }}
        onCancel={() => {
          setConfirming(false);
        }}
      />
    </section>
  );
}
