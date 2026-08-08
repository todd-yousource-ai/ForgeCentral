// apps/console/src/surfaces/SocDecisionQueue.tsx -- the SOC decision queue (IP-CONSOLE-03 S3.4),
// carrying the two ruled credibility channels (crdb IP-SOC-CREDIBILITY-CHANNELS, S3.9).
//
// The ranked list of open incidents an analyst works top-down. Each card carries what the engine
// recorded about the incident and nothing else; selecting one drives the rest of the surface (the
// lineage graph, verdict panel and dock, S3.5-S3.7) from the SAME payload.
//
// THE CHANNELS ARE THE OPERATOR-FINAL CONTRACT (RI.I7, engine-side INV-SOC-INGRESS-IS-SCORED):
// the container is Credibility Alerts; the two filters are Urgent Review (Posture::Escalate) and
// Threat Inspection (Posture::Candidate). ObserveOnly stays ephemeral and never reaches this
// surface; the credibility algorithm is the ONLY ingress. A channel filter NARROWS what renders --
// it never re-sorts, and the All channel is the default so nothing is hidden until an analyst asks.
//
// HONESTY RULES:
//   * THERE IS NO SCORE. The prototype leads each card with a 94.1 and a dollar exposure; the engine
//     records neither, the contract has no field for either, and the card leads with what an analyst
//     actually acts on -- what the incident needs from a human. (SC.4: no probability string may
//     render in either channel until a calibration is committed WITH a weight-set version.)
//   * THE ORDER IS THE ENGINE'S (INV-SOC-ONE-PAYLOAD's sibling). Rows render exactly as returned:
//     authority urgency, then posture, confidence, recency, id. The surface never re-sorts, because
//     the `Decision Waiting` tile counts the same authority field -- a client-side sort would let the
//     queue and the tile disagree about what is blocking a person. Channel filtering preserves the
//     engine's relative order, and the tile reads the UNFILTERED payload, so they cannot disagree.
//   * A REFUSED read is an ERROR, never an empty queue. The BFF 503s when the engine refused rather
//     than truncated, and "no open incidents" for a SOC that has more than it can show is the one
//     direction this must not fail in. A channel EMPTIED BY ITS FILTER names the channel, so an
//     analyst never mistakes a narrowed view for a quiet environment.
//   * AN IDENTIFIER IS FOR TELLING THINGS APART. The engine attributes subjects and incidents by
//     content-addressed ids; a 128-hex string renders as its short prefix with the full value on
//     the element title, because a card whose every field is an untruncated digest tells an analyst
//     nothing. The full id stays the selection value and the accessible name -- only the visible
//     text shortens, and a human-named subject renders unchanged.

import { useState, type ReactElement } from 'react';
import { Badge, type BadgeVariant } from '@forge/design';
import type { AuthorityState, IncidentPosture, SocIncidentRow } from '@forge/contracts';
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

/**
 * The ruled channels (crdb IP-SOC-CREDIBILITY-CHANNELS). `all` is the surface's own default view,
 * not a third channel: the contract names exactly two, and ObserveOnly never arrives (the ingress
 * invariant) -- were an observe-only row ever returned it would still show under All, which makes
 * that engine bug visible instead of silently filtered.
 */
export const CHANNELS = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent Review' },
  { id: 'inspection', label: 'Threat Inspection' },
] as const;
export type ChannelId = (typeof CHANNELS)[number]['id'];

/** Which channel a posture files under; `null` = outside both (renders only under All). */
export function channelOf(posture: IncidentPosture): Exclude<ChannelId, 'all'> | null {
  switch (posture) {
    case 'escalate':
      return 'urgent';
    case 'candidate':
      return 'inspection';
    case 'observe-only':
      return null;
  }
}

/** Whether a row belongs to the active channel view. `all` narrows nothing. */
function inChannel(row: SocIncidentRow, channel: ChannelId): boolean {
  return channel === 'all' || channelOf(row.posture) === channel;
}

/**
 * A content-addressed identifier's display form: the short prefix that tells rows apart, with the
 * full value on the title. A string that is not a long digest (a process name, an account) renders
 * unchanged -- this shortens noise, never information.
 */
export function shortIdentifier(value: string): string {
  const hex = value.startsWith('sha512:') ? value.slice('sha512:'.length) : value;
  if (hex.length >= 32 && /^[0-9a-f]+$/i.test(hex)) {
    return `${hex.slice(0, 10)}…`;
  }
  return value;
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
        {/* The entity path: what the incident is attributed to, and the technique it fired on. A
            content-addressed subject shows its short prefix (full value on the title); a named
            subject shows as itself. */}
        <span className="fcx-socq__path">
          <span className="fcx-socq__subject" title={row.subject}>
            {shortIdentifier(row.subject)}
          </span>
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
        <span className="fcx-socq__id" title={row.incidentId}>
          {shortIdentifier(row.incidentId)}
        </span>
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

/**
 * The channel strip: All plus the two ruled channels, each carrying its member count from the SAME
 * payload the list renders. The counts are facts about what is in hand, not projections; a channel
 * with zero members still shows, because "Urgent Review (0)" is a statement an analyst acts on.
 */
function ChannelStrip({
  rows,
  channel,
  onChannel,
}: {
  readonly rows: readonly SocIncidentRow[];
  readonly channel: ChannelId;
  readonly onChannel: (channel: ChannelId) => void;
}): ReactElement {
  return (
    <div className="fcx-socq__channels" role="group" aria-label="Credibility channels">
      {CHANNELS.map((option) => {
        const count =
          option.id === 'all'
            ? rows.length
            : rows.filter((row) => channelOf(row.posture) === option.id).length;
        return (
          <button
            key={option.id}
            type="button"
            className={
              option.id === channel
                ? 'fcx-socq__channel fcx-socq__channel--on'
                : 'fcx-socq__channel'
            }
            aria-pressed={option.id === channel}
            onClick={() => {
              onChannel(option.id);
            }}
          >
            {option.label} ({String(count)})
          </button>
        );
      })}
    </div>
  );
}

export function SocDecisionQueue({
  selected,
  onSelect,
  nowSeconds,
}: SocDecisionQueueProps): ReactElement {
  const incidents = useSocIncidents();
  const [channel, setChannel] = useState<ChannelId>('all');
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
  const visible = rows.filter((row) => inChannel(row, channel));
  const channelLabel = CHANNELS.find((option) => option.id === channel)?.label ?? channel;
  return (
    <div className="fcx-socq__wrap">
      <ChannelStrip rows={rows} channel={channel} onChannel={setChannel} />
      {visible.length === 0 ? (
        // Emptied BY THE FILTER, and it says so: a narrowed view must never read as a quiet SOC.
        <EmptyState
          title={`No incidents in ${channelLabel}`}
          hint={`${String(rows.length)} open incident(s) sit outside this channel. Switch to All to see everything the engine holds open.`}
        />
      ) : (
        <ol className="fcx-socq" aria-label="Decision queue" data-testid="soc-decision-queue">
          {visible.map((row) => (
            <QueueCard
              key={row.incidentId}
              row={row}
              selected={row.incidentId === selected}
              nowSeconds={now}
              onSelect={onSelect}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
