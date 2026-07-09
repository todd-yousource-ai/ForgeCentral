// packages/design/src/components/ScoreRing.tsx -- the trust-score ring (F0.2b).
//
// A 0-100 score rendered as a numeric value inside a ring colored by its band (green/amber/red), the
// product's signature indicator (TRD-CONSOLE-00 6.3, the Overview VTZ nodes). The band drives a semantic
// class; the arc geometry is computed inline (no color). It exposes the score as an accessible label so
// it is not conveyed by ring color alone (WCAG 1.4.1 / 1.1.1).

import type { CSSProperties, ReactElement } from 'react';

/** The score band, by threshold. */
export type ScoreBand = 'good' | 'caution' | 'critical';

// TUNE: bands from the Overview mockup (82 -> green, 75 -> amber): good >= 80, caution >= 70, else critical.
const GOOD_MIN = 80;
const CAUTION_MIN = 70;

/** The band a 0-100 score falls into. */
export function scoreBand(score: number): ScoreBand {
  if (score >= GOOD_MIN) return 'good';
  if (score >= CAUTION_MIN) return 'caution';
  return 'critical';
}

export interface ScoreRingProps {
  /** The score; clamped to 0-100 and rounded. */
  readonly score: number;
  /** An optional label naming what the score is for (e.g. a VTZ name), used in the accessible name. */
  readonly label?: string;
  /** Pixel diameter. Defaults to 64. */
  readonly size?: number;
}

// TUNE: the ring stroke width in px, proportioned for the default 64px size.
const STROKE = 6;

export function ScoreRing({ score, label, size = 64 }: ScoreRingProps): ReactElement {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const band = scoreBand(value);
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (circumference * value) / 100;
  const arc: CSSProperties = { strokeDasharray: `${filled} ${circumference}` };
  const center = size / 2;
  const accessibleName = `${label ? `${label}: ` : ''}trust score ${value} of 100`;

  return (
    <div className={`fc-score-ring fc-score-ring--${band}`} role="img" aria-label={accessibleName}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="fc-score-ring__track"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={STROKE}
        />
        <circle
          className="fc-score-ring__value"
          cx={center}
          cy={center}
          r={radius}
          strokeWidth={STROKE}
          style={arc}
        />
      </svg>
      <span className="fc-score-ring__num" aria-hidden="true">
        {value}
      </span>
    </div>
  );
}
