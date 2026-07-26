// apps/console/src/surfaces/SocInvestigationDock.tsx -- the investigation dock (IP-CONSOLE-03 S3.7).
//
// Where an analyst checks the surface's claims. Five panes plus the current graph scope, all over the
// SAME incident payload the rest of the surface renders from -- switching a tab never refetches.
//
// EACH TAB'S BINDING WAS CHECKED BEFORE IT WAS BUILT, and two of the five have no per-incident read:
//   * Evidence        -- LIVE. The cited legs from the incident detail.
//   * Timeline        -- LIVE but THIN, and says so. The engine records when the incident opened and
//                        when it last fired; it does not expose a per-fire history on this read, so
//                        the pane shows two real instants and names what it cannot show.
//   * Model Reasoning -- LIVE. The narrative's grounding set (what the model was given) and the
//                        skeptic's per-claim adjudications (what was thrown away, and why).
//   * Raw Telemetry   -- NOT AVAILABLE. Nothing maps an incident's evidence legs back to the raw
//                        records behind them; `LOG_EXPLAIN` keys on a decision id, which an episode's
//                        legs are not.
//   * Audit Trail     -- NOT AVAILABLE. Audit entries exist on the live stream (`WireStreamDelta`),
//                        not as a per-incident query, so there is nothing to read for one incident.
//
// The two absences render an explicit not-available naming the gap, exactly as Business impact does
// in the verdict panel. A mock pane here would be the worst kind of stub: an analyst opens this dock
// precisely when they have stopped taking the surface's word for something.

import { useState, type ReactElement } from 'react';
import { TabStrip } from '@forge/design';
import type { SocIncidentDetail, VerdictNarrative } from '@forge/contracts';

import { useSocNarrative } from './useSoc.js';

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
          <NotAvailable
            what="Raw telemetry is not available for one incident."
            why="Nothing maps an incident's evidence legs back to the records behind them. LOG_EXPLAIN keys on a decision id, which an episode's legs are not. The Logs surface reads the same telemetry by decision."
          />
        ) : null}
        {tab === 'audit' ? (
          <NotAvailable
            what="There is no per-incident audit trail to read."
            why="Audit entries reach the Console on the live stream, not as a query scoped to one incident. Operator acts on this incident ARE audited engine-side; nothing here can list them yet."
          />
        ) : null}
      </div>
    </section>
  );
}
