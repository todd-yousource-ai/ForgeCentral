// packages/design/src/components/VtzZoneCard.tsx -- one Virtual Trust Zone card (IP-CONSOLE-02 V2.4).
//
// The unit of the Active VTZs grid: one zone, glanceable. Its focal signals are the ARCHETYPE badge (the
// zone's coarse posture preset) and the detection-driven RISK band -- there is no trust gauge, because the
// substrate carries no score (INV-CONSOLE-VTZ-REAL; the same removal the entity drawer and the Overview
// made). The card is a presentational shell: it takes already-resolved labels/variants and renders them,
// so the archetype -> variant mapping and the risk join live in the surface that owns the data.
//
// HONEST ABSENCE (INV-CONSOLE-NO-STUB). Three facts a zone card would like to show do not exist in the
// engine yet: how many members it holds, how many policies target it, and -- for a zone no decision has
// touched -- its risk band. Each is OPTIONAL here, and an absent one renders as an explicit
// "Not available" with the reason, never as a fabricated `0` and never silently dropped (a missing row
// would read as "zero members", which is a different and false claim).

import type { ReactElement } from 'react';

import { Badge, type BadgeVariant } from './Badge.js';

/** An already-resolved badge: the caller maps its domain enum to a label + semantic variant. */
export interface VtzBadge {
  readonly label: string;
  readonly variant: BadgeVariant;
}

/** A count the engine may not be able to provide yet: the value, or the reason it is absent. */
export type VtzCount = { readonly value: number } | { readonly unavailable: string };

export interface VtzZoneCardProps {
  /** The zone's dotted name (`YouSource.Corp.Finance`); the card stacks the leaf from its path. */
  readonly name: string;
  /** The parent zone's dotted name, or `null` for a root zone. */
  readonly parent: string | null;
  /** The archetype badge (`zone_type`): the zone's coarse posture preset. */
  readonly archetype: VtzBadge;
  /** The detection-driven risk band, or `null` when no decision drives one (absent by design). */
  readonly risk: VtzBadge | null;
  /** Shown only for a zone that is not yet published, so a draft is never mistaken for one in force. */
  readonly draft: boolean;
  /** How many zones are this zone's direct children. A real engine count. */
  readonly subZoneCount: number;
  /** Members assigned to the zone; unavailable until the engine has a membership substrate. */
  readonly memberCount: VtzCount;
  /** Policies scoped to the zone; unavailable until the Policies surface's store exists. */
  readonly policyCount: VtzCount;
  /** True when this card is the grid's current selection (drives the selected styling + aria-pressed). */
  readonly selected?: boolean;
  /** Open the zone (the grid selects it and shows its configuration). */
  readonly onOpen: () => void;
}

/** The leaf segment of a dotted zone name (the card's headline), and the path above it. */
function splitName(name: string): { readonly leaf: string; readonly path: string } {
  const cut = name.lastIndexOf('.');
  if (cut < 0) return { leaf: name, path: '' };
  return { leaf: name.slice(cut + 1), path: name.slice(0, cut) };
}

/** One count row: the real number, or the explicit reason it is not available (never a fabricated 0). */
function CountRow({ label, count }: { label: string; count: VtzCount }): ReactElement {
  const available = 'value' in count;
  return (
    <div className="fc-vtz-card__stat">
      <dt className="fc-vtz-card__stat-label">{label}</dt>
      <dd
        className={
          available
            ? 'fc-vtz-card__stat-value'
            : 'fc-vtz-card__stat-value fc-vtz-card__stat-value--absent'
        }
        {...(available ? {} : { title: count.unavailable })}
      >
        {available ? count.value : 'Not available'}
      </dd>
    </div>
  );
}

/** One zone in the Active VTZs grid: name + archetype + risk + its real counts, selectable. */
export function VtzZoneCard({
  name,
  parent,
  archetype,
  risk,
  draft,
  subZoneCount,
  memberCount,
  policyCount,
  selected = false,
  onOpen,
}: VtzZoneCardProps): ReactElement {
  const { leaf, path } = splitName(name);
  return (
    <button
      type="button"
      className={selected ? 'fc-vtz-card fc-vtz-card--selected' : 'fc-vtz-card'}
      aria-pressed={selected}
      aria-label={`Trust zone ${name}`}
      onClick={onOpen}
    >
      <header className="fc-vtz-card__head">
        <span className="fc-vtz-card__name">
          <span className="fc-vtz-card__leaf">{leaf}</span>
          {path !== '' ? <span className="fc-vtz-card__path">{path}</span> : null}
        </span>
        <span className="fc-vtz-card__badges">
          <Badge variant={archetype.variant}>{archetype.label}</Badge>
          {/* Absent by design when no decision drives a band -- never a fabricated green. */}
          {risk !== null ? <Badge variant={risk.variant}>{risk.label}</Badge> : null}
          {draft ? <Badge variant="neutral">Draft</Badge> : null}
        </span>
      </header>
      <dl className="fc-vtz-card__stats">
        <div className="fc-vtz-card__stat">
          <dt className="fc-vtz-card__stat-label">Sub-zones</dt>
          <dd className="fc-vtz-card__stat-value">{subZoneCount}</dd>
        </div>
        <CountRow label="Members" count={memberCount} />
        <CountRow label="Policies" count={policyCount} />
      </dl>
      <footer className="fc-vtz-card__foot">
        {parent === null ? 'Root zone' : `Inherits from ${parent}`}
      </footer>
    </button>
  );
}
