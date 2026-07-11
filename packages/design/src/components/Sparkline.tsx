// packages/design/src/components/Sparkline.tsx -- a micro trend sparkline (IP-CONSOLE-12 DR.2).
//
// A glanceable single-series change-over-time line (the drawer's Trust Score trend; Logs "Trust Delta"
// and the Overview reuse it). One thin 2px line with a rounded data-end dot, colored by a semantic token
// (never a hand-picked hex -- the hex-scan gate). It is one series, so it needs no legend; identity comes
// from its accessible name, which also carries the values so the trend is never conveyed by color alone
// (WCAG 1.1.1 / 1.4.1). Presentation only; the caller supplies already-resolved points.

import type { ReactElement } from 'react';

/** One point on the trend: a `0..100` score at a unix-millis instant (matches the contract `TrustPoint`). */
export interface SparklinePoint {
  readonly at: number;
  readonly score: number;
}

export interface SparklineProps {
  /** The series, oldest to newest. Fewer than two points renders an honest "no trend" state, not a line. */
  readonly points: readonly SparklinePoint[];
  /** Names what the trend is for (e.g. "Inventory-Bot trust score"); used in the accessible name. */
  readonly label: string;
  /** Pixel width. Defaults to 96. */
  readonly width?: number;
  /** Pixel height. Defaults to 28. */
  readonly height?: number;
}

// TUNE: the drawn band is inset by the stroke so the 2px line and its end dot never clip at the edges.
const INSET = 3;
// Scores are a fixed 0..100 domain, so the y-axis is stable across entities (comparable at a glance).
const SCORE_MIN = 0;
const SCORE_MAX = 100;

export function Sparkline({
  points,
  label,
  width = 96,
  height = 28,
}: SparklineProps): ReactElement {
  const first = points[0];
  const last = points[points.length - 1];

  // No trend to draw: one point (or none) is not a line. Report it honestly rather than faking a flat run.
  if (points.length < 2 || !first || !last) {
    const only = first ? ` (current ${Math.round(first.score)})` : '';
    return (
      <span
        className="fc-sparkline fc-sparkline--empty"
        role="img"
        aria-label={`${label}: no trend yet${only}`}
      >
        {'--'}
      </span>
    );
  }

  const span = SCORE_MAX - SCORE_MIN;
  const stepX = (width - 2 * INSET) / (points.length - 1);
  const toX = (i: number): number => INSET + i * stepX;
  // Invert y: a higher score sits higher on the sparkline.
  const toY = (score: number): number => {
    const clamped = Math.max(SCORE_MIN, Math.min(SCORE_MAX, score));
    return INSET + (height - 2 * INSET) * (1 - (clamped - SCORE_MIN) / span);
  };

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(p.score)}`).join(' ');
  const accessibleName =
    `${label} trend: ${Math.round(first.score)} to ${Math.round(last.score)} ` +
    `over ${points.length} points`;

  return (
    <span className="fc-sparkline" role="img" aria-label={accessibleName}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <path className="fc-sparkline__line" d={path} fill="none" />
        <circle
          className="fc-sparkline__end"
          cx={toX(points.length - 1)}
          cy={toY(last.score)}
          r={2.5}
        />
      </svg>
    </span>
  );
}
