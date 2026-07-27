// apps/console/src/surfaces/SocInvestigationDock.tsx -- the investigation dock (IP-CONSOLE-03 S3.7).
//
// Where an analyst checks the surface's claims. Five panes plus the current graph scope, all over the
// SAME incident payload the rest of the surface renders from -- switching a tab never refetches.
//
// EACH TAB'S BINDING WAS CHECKED BEFORE IT WAS BUILT. All five are LIVE since crdb
// IP-SOC-EVIDENCE-DEPTH closed the two per-incident reads this dock registered as PENDING:
//   * Evidence        -- LIVE. The cited legs from the incident detail.
//   * Timeline        -- LIVE but THIN, and says so. The engine records when the incident opened and
//                        when it last fired; it does not expose a per-fire history on this read, so
//                        the pane shows two real instants and names what it cannot show.
//   * Model Reasoning -- LIVE. The narrative's grounding set (what the model was given) and the
//                        skeptic's per-claim adjudications (what was thrown away, and why).
//   * Raw Telemetry   -- LIVE (crdb ED.2, SOC_INCIDENT_TELEMETRY). The incident's evidence resolved
//                        to the raw records behind it. An observation past retention or above this
//                        principal's clearance is reported WITH its reference (`aged_out` /
//                        `restricted`) -- an absence an analyst can act on, never an omission.
//   * Audit Trail     -- LIVE (crdb ED.3, SOC_INCIDENT_AUDIT). The operator acts recorded against
//                        this incident: an index into the hash-chained audit record, written in the
//                        same commit batch as each act. Never assembled from the live stream.

import { useState, type ReactElement } from 'react';
import { TabStrip } from '@forge/design';
import type {
  IncidentActRow,
  IncidentTelemetry,
  SocIncidentDetail,
  VerdictNarrative,
} from '@forge/contracts';

import { useSocAuditTrail, useSocNarrative, useSocTelemetry } from './useSoc.js';

const DOCK_TABS = [
  { id: 'evidence', label: 'Evidence' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'reasoning', label: 'Model Reasoning' },
  { id: 'raw', label: 'Raw Telemetry' },
  { id: 'audit', label: 'Audit Trail' },
] as const;

/** An absent pane, naming precisely what is missing. Never a placeholder pretending to be data. */
function NotAvailable({
  what,
  why,
}: {
  readonly what: string;
  readonly why: string;
}): ReactElement {
  return (
    <div className="fcx-socd__absent">
      <p className="fcx-socd__absent-title">{what}</p>
      <p className="fcx-socd__absent-why">{why}</p>
    </div>
  );
}

function instant(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace('T', ' ').replace('.000Z', 'Z');
}

function EvidencePane({
  detail,
  scopedNode,
}: {
  readonly detail: SocIncidentDetail;
  readonly scopedNode: string | null;
}): ReactElement {
  // When the graph has scoped to a node, narrow to the leg that node stands for -- over data already
  // in hand, so the dock and the graph can never describe different moments.
  const scopedLabel =
    scopedNode === null ? null : (detail.nodes.find((n) => n.id === scopedNode)?.label ?? null);
  const legs =
    scopedLabel === null
      ? detail.evidence
      : detail.evidence.filter((row) => row.leg === scopedLabel);

  if (detail.evidence.length === 0) {
    return (
      <NotAvailable
        what="This incident cites no evidence legs."
        why="The engine opened it without attaching telemetry references, which is itself worth noting."
      />
    );
  }
  return (
    <>
      {scopedLabel !== null && legs.length === 0 ? (
        <p className="fcx-socd__note">
          The scoped node is not one of this incident&rsquo;s cited legs. Showing nothing rather
          than the full list, so the scope is not silently ignored.
        </p>
      ) : null}
      <ul className="fcx-socd__legs" data-testid="soc-dock-evidence">
        {legs.map((row) => (
          <li key={row.leg} className="fcx-socd__leg">
            {row.leg}
          </li>
        ))}
      </ul>
    </>
  );
}

function TimelinePane({ detail }: { readonly detail: SocIncidentDetail }): ReactElement {
  return (
    <>
      <ol className="fcx-socd__timeline" data-testid="soc-dock-timeline">
        <li>
          <span className="fcx-socd__when">{instant(detail.row.openedAt)}</span>
          <span>Incident opened</span>
        </li>
        <li>
          <span className="fcx-socd__when">{instant(detail.row.lastSeen)}</span>
          <span>Last fired</span>
        </li>
      </ol>
      <p className="fcx-socd__note">
        These are the two instants the engine records on the incident. It does not expose a per-fire
        history on this read, so nothing between them is shown rather than interpolated.
      </p>
    </>
  );
}

function ReasoningPane({
  narrative,
}: {
  readonly narrative: VerdictNarrative | undefined;
}): ReactElement {
  if (narrative === undefined) {
    return <NotAvailable what="The write-up has not been read yet." why="Loading." />;
  }
  if (!narrative.found) {
    return (
      <NotAvailable
        what="No model has looked at this incident."
        why="There is no grounding set and no adjudication to show, because no run was recorded."
      />
    );
  }
  return (
    <div data-testid="soc-dock-reasoning">
      <h5 className="fcx-socd__sub">What the model was given</h5>
      {narrative.citedEvidence.length === 0 ? (
        <p className="fcx-socd__note">The run recorded no grounding set.</p>
      ) : (
        <ul className="fcx-socd__legs">
          {narrative.citedEvidence.map((leg) => (
            <li key={leg} className="fcx-socd__leg">
              {leg}
            </li>
          ))}
        </ul>
      )}

      <h5 className="fcx-socd__sub">What the skeptic threw away</h5>
      {narrative.withheld.length === 0 ? (
        <p className="fcx-socd__note">
          {narrative.published
            ? 'Nothing was withheld: every claim the model made was supported.'
            : 'The run was refused before any claim was adjudicated.'}
        </p>
      ) : (
        <ul className="fcx-socd__adjudications">
          {narrative.withheld.map((claim) => (
            <li key={`${claim.section}:${claim.text}`}>
              <span className="fcx-socd__ruling">{claim.ruling}</span>
              <q>{claim.text}</q>
              <span className="fcx-socd__note">{claim.explanation}</span>
              {claim.cited.length > 0 ? (
                <span className="fcx-socd__note">Cited: {claim.cited.join(', ')}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The Raw Telemetry pane (crdb ED.2). Scoping narrows to observations whose fields mention the
 * node, the same filter-not-refetch rule the evidence pane follows.
 */
function RawTelemetryPane({
  telemetry,
  scopedNode,
}: {
  readonly telemetry: IncidentTelemetry | null | undefined;
  readonly scopedNode: string | null;
}): ReactElement {
  if (telemetry === undefined) {
    return <p className="fcx-socd__note">Loading raw telemetry.</p>;
  }
  if (telemetry === null) {
    return (
      <NotAvailable
        what="Raw telemetry cannot be read for this incident."
        why="The engine refused the read: the incident is unknown, another tenant's, or above this session's clearance."
      />
    );
  }
  const rows =
    scopedNode === null
      ? telemetry.observations
      : telemetry.observations.filter((row) =>
          row.fields.some(([, value]) => value.includes(scopedNode)),
        );
  return (
    <div data-testid="soc-dock-raw">
      <p className="fcx-socd__note">
        {telemetry.anchor === 'anchored'
          ? 'Resolved from the retained observation window.'
          : telemetry.anchor === 'window_unavailable'
            ? 'The observation window is unavailable; references are listed without their records.'
            : 'No observation window anchors this incident; references are listed without their records.'}
      </p>
      {rows.length === 0 ? (
        <p className="fcx-socd__note" data-testid="soc-dock-raw-empty">
          {scopedNode === null
            ? 'No leg of this incident resolves to a raw record.'
            : 'No resolved record mentions the scoped node.'}
        </p>
      ) : (
        <ul className="fcx-socd__legs">
          {rows.map((row) => (
            <li key={row.observationId} className="fcx-socd__leg">
              <span className="fcx-socd__ruling">{row.outcome}</span> {row.observationId}
              {row.category === null ? null : <span> &middot; {row.category}</span>}
              <span> &middot; {instant(row.observedAt)}</span>
              {row.outcome === 'resolved' && row.fields.length > 0 ? (
                <span className="fcx-socd__note">
                  {row.fields.map(([name, value]) => `${name}=${value}`).join(' ')}
                </span>
              ) : null}
              {row.outcome === 'aged_out' ? (
                <span className="fcx-socd__note">Past retention; the reference is kept.</span>
              ) : null}
              {row.outcome === 'restricted' ? (
                <span className="fcx-socd__note">Above this session&apos;s clearance.</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The Audit Trail pane (crdb ED.3): who acted on this incident, straight off the audit index. */
function AuditTrailPane({
  trail,
}: {
  readonly trail: readonly IncidentActRow[] | null | undefined;
}): ReactElement {
  if (trail === undefined) {
    return <p className="fcx-socd__note">Loading the audit trail.</p>;
  }
  if (trail === null) {
    return (
      <NotAvailable
        what="The audit trail cannot be read for this incident."
        why="The engine refused the read: the incident is unknown, another tenant's, or above this session's clearance."
      />
    );
  }
  if (trail.length === 0) {
    return (
      <p className="fcx-socd__note" data-testid="soc-dock-audit-empty">
        No operator has acted on this incident. The trail records plan and containment acts; reads
        leave no entry here.
      </p>
    );
  }
  return (
    <ul className="fcx-socd__legs" data-testid="soc-dock-audit">
      {trail.map((act) => (
        <li key={`${act.act}:${String(act.atSeconds)}`} className="fcx-socd__leg">
          <span className="fcx-socd__ruling">{act.act}</span> {instant(act.atSeconds)}
          <span className="fcx-socd__note">by {act.principal}</span>
          {act.detail === null ? null : <span className="fcx-socd__note">{act.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export interface SocInvestigationDockProps {
  readonly incidentId: string;
  readonly detail: SocIncidentDetail;
  readonly scopedNode: string | null;
}

export function SocInvestigationDock({
  incidentId,
  detail,
  scopedNode,
}: SocInvestigationDockProps): ReactElement {
  const [tab, setTab] = useState<string>('evidence');
  // The same query the verdict panel uses; TanStack serves it from cache, so opening the dock costs
  // no read and cannot show a different narrative than the panel above it.
  const narrative = useSocNarrative(incidentId);
  const telemetry = useSocTelemetry(incidentId);
  const auditTrail = useSocAuditTrail(incidentId);

  return (
    <section className="fcx-socd" aria-label="Investigation dock" data-testid="soc-dock">
      <TabStrip
        tabs={[...DOCK_TABS]}
        activeId={tab}
        onChange={setTab}
        ariaLabel="Investigation dock"
      />

      <p className="fcx-socd__scope" data-testid="soc-dock-scope">
        {scopedNode === null
          ? 'Scope: the whole incident.'
          : `Scope: ${scopedNode}. Panes narrow to this node.`}
      </p>

      <div className="fcx-socd__pane">
        {tab === 'evidence' ? <EvidencePane detail={detail} scopedNode={scopedNode} /> : null}
        {tab === 'timeline' ? <TimelinePane detail={detail} /> : null}
        {tab === 'reasoning' ? <ReasoningPane narrative={narrative.data} /> : null}
        {tab === 'raw' ? (
          <RawTelemetryPane telemetry={telemetry.data} scopedNode={scopedNode} />
        ) : null}
        {tab === 'audit' ? <AuditTrailPane trail={auditTrail.data} /> : null}
      </div>
    </section>
  );
}
