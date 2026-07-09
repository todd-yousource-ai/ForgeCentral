// packages/design/src/components/KpiCard.tsx -- a dashboard metric card (F0.2b).
//
// A single labeled metric with an optional status badge (the Dashboards mockup: Active VTZs, Active
// Sessions, TrustLock Rotations with Live/Today badges). A shell: it takes an already-resolved value and
// renders it; the data binding lands with the Dashboards surface.

import type { ReactElement, ReactNode } from 'react';

import { Badge, type BadgeVariant } from './Badge.js';

export interface KpiCardProps {
  /** The metric name (also the card's accessible name). */
  readonly label: string;
  /** The already-resolved value to display (string or a formatted node). */
  readonly value: ReactNode;
  /** An optional status badge (e.g. Live / Today). */
  readonly badge?: { readonly text: string; readonly variant?: BadgeVariant };
}

export function KpiCard({ label, value, badge }: KpiCardProps): ReactElement {
  return (
    <section className="fc-kpi" aria-label={label}>
      <header className="fc-kpi__head">
        <span className="fc-kpi__label">{label}</span>
        {badge ? <Badge variant={badge.variant ?? 'neutral'}>{badge.text}</Badge> : null}
      </header>
      <div className="fc-kpi__value">{value}</div>
    </section>
  );
}
