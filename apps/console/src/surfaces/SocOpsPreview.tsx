// apps/console/src/surfaces/SocOpsPreview.tsx -- the SOC Ops visual-language proof (TRD-CONSOLE-03
// direction, operator-requested 2026-07-25).
//
// This is a MATERIAL proof, not the SOC Ops surface: it dresses the still-placeholder destination in
// the floating-glass language (the ambient nebula + GlassPanel zones laid out per the six-zone triage
// blueprint) so the look can be judged live in the console before the surface's phase builds it.
//
// The honesty contract is unchanged from every other placeholder (INV-CONSOLE-NO-STUB):
//   - ZERO fabricated values. Every zone renders its name and an honest awaiting-phase note; the
//     center zone renders the canonical "No SOC Ops data yet" empty state.
//   - No table/grid roles (the no-stub contract test), no counts, no chips pretending to be data.
//   - The glass + ambient are decoration with reduced-motion/transparency + no-WebGL fallbacks
//     handled inside the design package.

import type { ReactElement } from 'react';

import { AmbientBackdrop, GlassPanel } from '@forge/design';

import { EmptyState } from '../states/States.js';

/** The awaiting-phase note every non-center zone carries. One line, honest, no invented values. */
function ZoneNote({ text }: { readonly text: string }): ReactElement {
  return <p className="fcx-socops__note">{text}</p>;
}

export function SocOpsPreview(): ReactElement {
  return (
    <section className="fcx-surface fc-ambient-host fcx-socops" aria-labelledby="surface-soc-ops">
      <AmbientBackdrop />
      <h2 id="surface-soc-ops" className="fcx-surface__heading">
        SOC Ops
      </h2>

      <div className="fcx-socops__zones">
        <GlassPanel
          elevation="floating"
          ariaLabel="Commander briefing"
          header={<span>Zone 0 -- Commander Briefing</span>}
          className="fcx-socops__zone0"
        >
          <ZoneNote text="The shift briefing and the handover note render here when the SOC Ops phase lands. Every generated sentence will cite its case id, or it does not render." />
        </GlassPanel>

        <GlassPanel
          ariaLabel="Status strip"
          header={<span>Zone 1 -- Status</span>}
          className="fcx-socops__zone1"
        >
          <ZoneNote text="Threat level, incidents, pipeline silence, enforcement posture. No data is fabricated before the bindings exist." />
        </GlassPanel>

        <GlassPanel
          ariaLabel="Priority queue"
          header={<span>Zone 2 -- Priority Queue</span>}
          className="fcx-socops__zone2"
        >
          <EmptyState
            title="No SOC Ops data yet"
            hint="This surface ships its live bindings in its own phase. This preview is the visual language only: the glass material, the ambient field, and the six-zone triage layout."
          />
        </GlassPanel>

        <GlassPanel
          ariaLabel="Attack context"
          header={<span>Zone 3 -- Attack Context</span>}
          className="fcx-socops__zone3"
        >
          <ZoneNote text="Active techniques and the anomaly baseline, from the real detection episodes." />
        </GlassPanel>

        <GlassPanel
          ariaLabel="Target context"
          header={<span>Zone 4 -- Target Context</span>}
          className="fcx-socops__zone4"
        >
          <ZoneNote text="Crown jewels, identity health, endpoint health, agent posture. The deep agent view lives in Agent Ops, the flagship surface." />
        </GlassPanel>

        <GlassPanel
          ariaLabel="Operations and audit"
          header={<span>Zone 5 -- Ops and Audit</span>}
          className="fcx-socops__zone5"
        >
          <ZoneNote text="Autonomous-action audit and pending approvals, designed for enforcement-ON." />
        </GlassPanel>
      </div>
    </section>
  );
}
