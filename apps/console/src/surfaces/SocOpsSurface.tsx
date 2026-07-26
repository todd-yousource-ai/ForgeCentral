// apps/console/src/surfaces/SocOpsSurface.tsx -- the SOC Operations shell (IP-CONSOLE-03 S3.3).
//
// A DECISION surface, not a dashboard (TRD-CONSOLE-03). This step lands the shell: the command
// header, the focus tab strip, and the five-tile KPI strip bound to real engine numbers. The queue,
// lineage graph, verdict panel and dock arrive in S3.4-S3.7; each renders an honest not-yet state
// here rather than a mock, so nothing on this screen is ahead of its binding.
//
// HONESTY RULES (INV-SOC-NO-FABRICATED-NUMBER):
//   * Every tile is a real engine number or an explicit unavailable state. There is no third option.
//   * `Auto-Contained` reads 0 and that is a FACT, not an absence: the engine counts containments
//     EXECUTED, and enforcement is OFF (AG.7). It renders as a value with an explanatory badge, NOT
//     as unavailable -- 0 means the box contained nothing, unavailable would mean nobody knows, and
//     showing the first as the second understates what the engine knows about itself.
//   * `Noise Collapsed` shows its DENOMINATOR. The ratio is muted firings over total firings, not
//     over events analyzed; the sublabel says so, because a percentage whose denominator the reader
//     has to guess is a number they will guess generously.
//   * A failed read is an ERROR state, never empty tiles. The BFF returns 503 precisely when it will
//     not render something honestly, and blanking would hide that.
//   * The other five focus tabs render an honest not-built state; none of them fakes a panel.

import { useState, type ReactElement } from 'react';
import { AmbientBackdrop, GlassPanel, KpiCard, TabStrip } from '@forge/design';
import type { SocKpis } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { SocDecisionQueue } from './SocDecisionQueue.js';
import { SocVerdictPanel } from './SocVerdictPanel.js';
import {
  DISCLOSURE_LEVELS,
  SocLineageGraph,
  disclosureLabel,
  type DisclosureLevel,
} from './SocLineageGraph.js';
import { useSocIncident, useSocKpis } from './useSoc.js';

/** The focus tabs. `incidents` is this IP's scope; the rest are named honestly as not yet built. */
const FOCUS_TABS = [
  { id: 'incidents', label: 'Incidents' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'intel', label: 'Threat Intel' },
  { id: 'assets', label: 'Assets' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'automation', label: 'Automation' },
  { id: 'exceptions', label: 'Exceptions' },
] as const;

/** Group digits so a seven-figure denominator stays readable at a glance. */
function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * The muted share of firings, as a percentage of FIRINGS -- never of events analyzed.
 *
 * Returns null when nothing fired: 0/0 is not 100% noise collapsed, it is a quiet window, and a
 * surface that rendered "100%" for it would be claiming a filtering achievement that did not happen.
 */
function mutedShare(kpis: SocKpis): number | null {
  if (kpis.totalFirings === 0) {
    return null;
  }
  return Math.round((kpis.noiseCollapsed / kpis.totalFirings) * 100);
}

/** The five KPI tiles, each bound to a real engine number. */
function KpiStrip({ kpis }: { readonly kpis: SocKpis }): ReactElement {
  const share = mutedShare(kpis);
  return (
    <div className="fcx-socops__kpis" data-testid="soc-kpi-strip">
      <KpiCard
        label="Events Analyzed"
        value={formatCount(kpis.eventsAnalyzed)}
        badge={{ text: 'Window', variant: 'neutral' }}
      />
      <KpiCard
        label="Noise Collapsed"
        value={
          <>
            {formatCount(kpis.noiseCollapsed)}
            <span className="fcx-socops__kpi-sub">
              {share === null
                ? 'no firings in the window'
                : `${String(share)}% of ${formatCount(kpis.totalFirings)} firings`}
            </span>
          </>
        }
      />
      <KpiCard
        label="Material Incidents"
        value={formatCount(kpis.materialIncidents)}
        badge={{ text: 'Open', variant: 'info' }}
      />
      <KpiCard
        label="Auto-Contained"
        value={formatCount(kpis.autoContained)}
        // NOT an unavailable state. The engine counts executions and enforcement is OFF, so 0 is the
        // true count; the badge says why it is 0 rather than leaving an operator to assume a gap.
        badge={{ text: 'Enforcement off', variant: 'neutral' }}
      />
      <KpiCard
        label="Decision Waiting"
        value={formatCount(kpis.decisionWaiting)}
        badge={
          kpis.decisionWaiting > 0
            ? { text: 'Blocking', variant: 'critical' }
            : { text: 'Clear', variant: 'good' }
        }
      />
    </div>
  );
}

/** The command header: the mark, the tenant/shift line, and the detection posture readout. */
function CommandHeader({ kpis }: { readonly kpis: SocKpis | undefined }): ReactElement {
  return (
    <header className="fcx-socops__command">
      <div className="fcx-socops__mark">
        <span className="fcx-socops__mark-name">Forge Central</span>
        <span className="fcx-socops__mark-sub">SOC Operations</span>
      </div>
      <div className="fcx-socops__posture" aria-label="Detection posture">
        {kpis === undefined ? (
          // Honest: the posture is unknown until the read lands. Never a default "Active" pill.
          <span className="fcx-socops__pill fcx-socops__pill--unknown">Posture unknown</span>
        ) : (
          <span
            className={
              kpis.detectionEnabled
                ? 'fcx-socops__pill fcx-socops__pill--live'
                : 'fcx-socops__pill fcx-socops__pill--off'
            }
          >
            {kpis.detectionEnabled ? 'Detection active' : 'Detection disabled'}
          </span>
        )}
        {/* Enforcement is a deployment fact the engine reports on every plan effect (AG.7). Stated
            here so an operator reads the whole screen knowing nothing on it contains anything. */}
        <span className="fcx-socops__pill fcx-socops__pill--off">Enforcement off</span>
      </div>
    </header>
  );
}

interface DetailRegionProps {
  readonly incidentId: string | null;
  /** The KPI payload, passed down so the verdict's CONTRADICTIONS card needs no read of its own. */
  readonly kpis: SocKpis | undefined;
  readonly level: DisclosureLevel;
  readonly onLevel: (level: DisclosureLevel) => void;
  readonly scopedNode: string | null;
  readonly onScopeNode: (nodeId: string | null) => void;
}

/**
 * The selected incident, from ONE read (INV-SOC-ONE-PAYLOAD).
 *
 * The lineage graph renders from this payload and the verdict + dock will too (S3.6/S3.7). Changing
 * the disclosure level or scoping to a node filters what is already here; neither refetches.
 */
function IncidentDetailRegion({
  incidentId,
  kpis,
  level,
  onLevel,
  scopedNode,
  onScopeNode,
}: DetailRegionProps): ReactElement {
  const detail = useSocIncident(incidentId);

  if (incidentId === null) {
    return (
      <EmptyState
        title="Select an incident"
        hint="The queue is ordered by what each incident needs from a human. Work it top-down."
      />
    );
  }
  if (detail.isPending) {
    return <LoadingState label="Loading the incident" />;
  }
  if (detail.isError) {
    return (
      <ErrorState
        title="This incident cannot be shown"
        code={detail.error instanceof Error ? detail.error.message : 'unknown'}
        onRetry={() => void detail.refetch()}
      />
    );
  }
  if (detail.data === null || detail.data === undefined) {
    // Unknown, another tenant's, or above this operator's clearance -- one indistinguishable answer
    // by design, so the surface says exactly that and no more.
    return (
      <EmptyState
        title="Incident not available"
        hint="It does not exist, or it is outside what this operator may see. The engine does not distinguish the two, and neither does this screen."
      />
    );
  }

  return (
    <div className="fcx-socops__lineage">
      <div className="fcx-socops__disclosure" role="group" aria-label="Lineage detail level">
        {DISCLOSURE_LEVELS.map((option) => (
          <button
            key={option}
            type="button"
            className={
              option === level
                ? 'fcx-socops__disclosure-btn fcx-socops__disclosure-btn--on'
                : 'fcx-socops__disclosure-btn'
            }
            aria-pressed={option === level}
            onClick={() => {
              onLevel(option);
            }}
          >
            {disclosureLabel(option)}
          </button>
        ))}
      </div>

      <SocLineageGraph
        nodes={detail.data.nodes}
        edges={detail.data.edges}
        level={level}
        scopedNode={scopedNode}
        onScopeNode={onScopeNode}
      />

      <SocVerdictPanel incidentId={incidentId} detail={detail.data} kpis={kpis} />

      <p className="fcx-socops__scope" data-testid="soc-scope">
        {scopedNode === null
          ? `Whole incident: ${String(detail.data.evidence.length)} cited legs, ${String(detail.data.plan.length)} response steps.`
          : `Scoped to ${scopedNode}. The verdict and dock narrow to this node when they land.`}
      </p>
    </div>
  );
}

export function SocOpsSurface(): ReactElement {
  const [focus, setFocus] = useState<string>('incidents');
  // Lifted here because the queue's selection scopes every other panel on the surface.
  const [selected, setSelected] = useState<string | null>(null);
  const [level, setLevel] = useState<DisclosureLevel>('material');
  const [scopedNode, setScopedNode] = useState<string | null>(null);
  const kpis = useSocKpis();

  return (
    <section className="fcx-surface fc-ambient-host fcx-socops" aria-labelledby="surface-soc-ops">
      <AmbientBackdrop />
      <h2 id="surface-soc-ops" className="fcx-surface__heading">
        SOC Ops
      </h2>

      <CommandHeader kpis={kpis.data} />

      <p className="fcx-socops__tagline">
        Decisions, not dashboards. Every number on this screen is one the engine recorded.
      </p>

      <TabStrip
        tabs={[...FOCUS_TABS]}
        activeId={focus}
        onChange={setFocus}
        ariaLabel="SOC Ops focus"
      />

      {focus !== 'incidents' ? (
        <GlassPanel ariaLabel="Focus not yet built" className="fcx-socops__pending">
          <EmptyState
            title="Not yet built"
            hint="This focus ships when its engine bindings exist. The Incidents focus is the one this phase builds; the rest render nothing rather than a mock."
          />
        </GlassPanel>
      ) : (
        <>
          {kpis.isPending ? <LoadingState label="Loading the detection summary" /> : null}
          {kpis.isError ? (
            <ErrorState
              title="The detection summary cannot be shown"
              code={kpis.error instanceof Error ? kpis.error.message : 'unknown'}
              onRetry={() => void kpis.refetch()}
            />
          ) : null}
          {kpis.data ? <KpiStrip kpis={kpis.data} /> : null}

          <div className="fcx-socops__work">
            <GlassPanel
              ariaLabel="Decision queue"
              header={<span>Decision Queue</span>}
              className="fcx-socops__queue"
            >
              <SocDecisionQueue
                selected={selected}
                onSelect={(id) => {
                  setSelected(id);
                  // A node scope belongs to the incident it was taken in. Carrying it across would
                  // point the verdict and dock at a node the new incident does not contain.
                  setScopedNode(null);
                }}
              />
            </GlassPanel>

            <GlassPanel
              ariaLabel="Incident detail"
              header={<span>{selected === null ? 'Incident' : selected}</span>}
              className="fcx-socops__detail"
            >
              <IncidentDetailRegion
                incidentId={selected}
                kpis={kpis.data}
                level={level}
                onLevel={setLevel}
                scopedNode={scopedNode}
                onScopeNode={setScopedNode}
              />
            </GlassPanel>
          </div>
        </>
      )}
    </section>
  );
}
