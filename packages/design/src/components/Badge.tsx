// packages/design/src/components/Badge.tsx -- the status/chip primitive (F0.2b).
//
// The pill used everywhere for status, compliance, policy action, severity, and decision. Its color
// comes from a semantic variant (meaning), never a hand-picked value; the visual is the `.fc-badge--*`
// rule in styles.ts. The label text carries the meaning too, so the badge never conveys by color alone
// (WCAG 1.4.1).

import type { ReactElement, ReactNode } from 'react';

/** The semantic meaning of a badge (drives its token color). */
export type BadgeVariant = 'neutral' | 'good' | 'caution' | 'critical' | 'quarantine' | 'info';

export interface BadgeProps {
  /** The badge's meaning; selects the token color. Defaults to `neutral`. */
  readonly variant?: BadgeVariant;
  /** The label (always present, so the badge does not rely on color alone). */
  readonly children: ReactNode;
}

export function Badge({ variant = 'neutral', children }: BadgeProps): ReactElement {
  return <span className={`fc-badge fc-badge--${variant}`}>{children}</span>;
}
