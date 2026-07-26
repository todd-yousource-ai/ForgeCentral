// apps/console/src/surfaces/SocDecisionQueue.tsx -- the SOC decision queue (IP-CONSOLE-03 S3.4).
//
// The ranked list of open incidents an analyst works top-down. Each card carries what the engine
// recorded about the incident and nothing else; selecting one drives the rest of the surface (the
// lineage graph, verdict panel and dock, S3.5-S3.7) from the SAME payload.
//
// HONESTY RULES:
//   * THERE IS NO SCORE. The prototype leads each card with a 94.1 and a dollar exposure; the engine
//     records neither, the contract has no field for either, and the card leads with what an analyst
//     actually acts on -- what the incident needs from a human.
//   * THE ORDER IS THE ENGINE'S (INV-SOC-ONE-PAYLOAD's sibling). Rows render exactly as returned:
//     authority urgency, then posture, confidence, recency, id. The surface never re-sorts, because
//     the `Decision Waiting` tile counts the same authority field -- a client-side sort would let the
//     queue and the tile disagree about what is blocking a person.
//   * A REFUSED read is an ERROR, never an empty queue. The BFF 503s when the engine refused rather
//     than truncated, and "no open incidents" for a SOC that has more than it can show is the one
//     direction this must not fail in.

import type { ReactElement } from 'react';
import { Badge, type BadgeVariant } from '@forge/design';
import type { AuthorityState, SocIncidentRow } from '@forge/contracts';
import { authorityLabel, confidenceLabel, postureLabel } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useSocIncidents } from './useSoc.js';

/**
 * The authority chip's semantic color, by what it costs to leave the incident alone.
 *
 * `contained` is calm because it is handled; `automatic` is neutral because it asks nothing of
 * anyone. The two that block a person are the loud ones, and `approval_required` is the louder --
 * it is waiting on an authorization, not just a look.
 */
export function authorityVariant(authority: AuthorityState): BadgeVariant {
  switch (authority) {
    case 'approval_required':
      return 'critical';
    case 'review_required':
      return 'caution';
    case 'contained':
      return 'good';
    case 'automatic':
      return 'neutral';
  }
}

/** Seconds -> a compact relative age ("4m ago"). Absolute time lives in the detail, not the card. */
function ageLabel(unixSeconds: number, nowSeconds: number): string {
  const delta = Math.max(0, nowSeconds - unixSeconds);
  if (delta < 60) return 'just now';
  if (delta < 3600) return `${String(Math.floor(delta / 60))}m ago`;
  if (delta < 86_400) return `${String(Math.floor(delta / 3600))}h ago`;
  return `${String(Math.floor(delta / 86_400))}d ago`;
}

interface QueueCardProps {
  readonly row: SocIncidentRow;
  readonly selected: boolean;
  readonly nowSeconds: number;
  readonly onSelect: (incidentId: string) => void;
}

function QueueCard({ row, selected, nowSeconds, onSelect }: QueueCardProps): ReactElement {
  return (
    <li>
      <button
        type="button"
        className={selected ? 'fcx-socq__card fcx-socq__card--selected' : 'fcx-socq__card'}
        aria-current={selected ? 'true' : undefined}
        onClick={() => {
          onSelect(row.incidentId);
        }}
      >
        <span className="fcx-socq__head">
          <Badge variant={authorityVariant(row.authority)}>{authorityLabel(row.authority)}</Badge>
          <span className="fcx-socq__age">{ageLabel(row.lastSeen, nowSeconds)}</span>
        </span>
        <span className="fcx-socq__title">{row.finding}</span>
        {/* The entity path: what the incident is attributed to, and the technique it fired on. */}
        <span className="fcx-socq__path">
          <span className="fcx-socq__subject">{row.subject}</span>
          <span className="fcx-socq__sep" aria-hidden="true">
            /
          </span>
          <span className="fcx-socq__anchor">{row.anchor}</span>
        </span>
        <span className="fcx-socq__meta">
          <span>{postureLabel(row.posture)}</span>
          <span>{confidenceLabel(row.confidence)} confidence</span>
          <span>
            {String(row.evidenceCount)} {row.evidenceCount === 1 ? 'leg' : 'legs'}
          </span>
        </span>
        <span className="fcx-socq__id">{row.incidentId}</span>
      </button>
    </li>
  );
}

export interface SocDecisionQueueProps {
  /** The selected incident id, or null when none is selected yet. */
  readonly selected: string | null;
  readonly onSelect: (incidentId: string) => void;
  /** Injected so the relative ages are deterministic under test. */
  readonly nowSeconds?: number;
}

export function SocDecisionQueue({
  selected,
  onSelect,
  nowSeconds,
}: SocDecisionQueueProps): ReactElement {
  const incidents = useSocIncidents();
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);

  if (incidents.isPending) {
    return <LoadingState label="Loading the decision queue" />;
  }
  if (incidents.isError) {
    return (
      <ErrorState
        title="The decision queue cannot be shown"
        code={incidents.error instanceof Error ? incidents.error.message : 'unknown'}
        onRetry={() => void incidents.refetch()}
      />
    );
  }
  const rows = incidents.data ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No open incidents"
        hint="Nothing is waiting on a decision. Incidents appear here as the detection pipeline opens them."
      />
    );
  }
  return (
    <ol className="fcx-socq" aria-label="Decision queue" data-testid="soc-decision-queue">
      {rows.map((row) => (
        <QueueCard
          key={row.incidentId}
          row={row}
          selected={row.incidentId === selected}
          nowSeconds={now}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}
