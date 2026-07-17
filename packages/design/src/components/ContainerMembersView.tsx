// packages/design/src/components/ContainerMembersView.tsx -- the container-members drawer body (O1.6b).
//
// When an operator clicks a Sankey container (a source lane or a destination ring), the drawer opens in
// LIST mode showing that container's member entities -- each with its outbound-connection count -- so the
// operator can pick one and open its detail (the select-then-act pattern, Section 5.3). Presentation only:
// the caller supplies the resolved members (RD.4/O1.6b brokers them live) and the per-member click-through.
// Loading, error, and empty are honest states (INV-CONSOLE-NO-STUB): an empty container is a real readout,
// never a fabricated row; a failed read shows a retry, never stale content.

import type { ReactElement } from 'react';

import type { OverviewMember } from '@forge/contracts';

export interface ContainerMembersViewProps {
  /** The resolved members, or undefined while the read is in flight (renders the skeleton). */
  readonly members?: readonly OverviewMember[] | undefined;
  /** True while the members read is loading. */
  readonly loading?: boolean;
  /** True when the members read failed; renders an error with a retry rather than an empty list. */
  readonly error?: boolean;
  /** Open a member's entity detail (the drawer swaps to detail; the parent keeps the list for back). */
  readonly onSelectMember: (member: OverviewMember) => void;
  /** Retry the members read after an error. */
  readonly onRetry?: () => void;
}

/** Pluralize the connection count honestly (1 connection, N connections). */
function connectionsLabel(count: number): string {
  return `${String(count)} ${count === 1 ? 'connection' : 'connections'}`;
}

/** The container-members list: clickable member rows sorted by the engine (connection count, highest first). */
export function ContainerMembersView({
  members,
  loading,
  error,
  onSelectMember,
  onRetry,
}: ContainerMembersViewProps): ReactElement {
  if (loading || members === undefined) {
    return (
      <div className="fc-members" aria-busy={loading ? 'true' : undefined}>
        <ul className="fc-members__list">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="fc-members__skeleton" aria-hidden="true" />
          ))}
        </ul>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fc-members fc-members--error" role="alert">
        <p className="fc-members__note">Could not load this container&rsquo;s members.</p>
        {onRetry ? (
          <button type="button" className="fcx-btn" onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="fc-members fc-members--empty">
        <p className="fc-members__note">No members observed in this container.</p>
      </div>
    );
  }

  return (
    <div className="fc-members">
      <ul className="fc-members__list">
        {members.map((member) => (
          <li key={`${member.kind}:${member.id}`}>
            <button
              type="button"
              className="fc-members__row"
              onClick={() => onSelectMember(member)}
            >
              <span className="fc-members__name">{member.name}</span>
              <span className="fc-members__count">{connectionsLabel(member.connectionCount)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
