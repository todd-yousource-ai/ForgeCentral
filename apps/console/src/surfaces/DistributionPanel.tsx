// apps/console/src/surfaces/DistributionPanel.tsx -- the policy distribution ledger (FD.7c).
//
// For a selected zone, shows which endpoints have its distributed policy bundle -- applied, rejected
// (with the typed reason), or silent (unconfirmed) -- and lets the operator re-distribute the freshly
// composed policy to those same endpoints. Every value binds to a real engine read/command
// (INV-CONSOLE-NO-STUB); an unconfirmed box never reads as a delivered one.

import { useMemo, useState, type ReactElement } from 'react';
import { ConfirmDialog } from '@forge/design';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useBundleConvergence, useDistribute } from './useDistribution.js';
import type { EndpointConvergenceState } from '@forge/contracts';

/** The badge tone for each state. Applied is good, rejected is critical, silent draws the eye (an
 *  unconfirmed box must never read as a clean one -- the same rule the VTZ risk disc follows). */
const STATE_BADGE: Record<EndpointConvergenceState, string> = {
  applied: 'fc-badge--good',
  rejected: 'fc-badge--critical',
  silent: 'fc-badge--caution',
};

const STATE_LABEL: Record<EndpointConvergenceState, string> = {
  applied: 'Applied',
  rejected: 'Rejected',
  silent: 'No confirmation',
};

/**
 * The distribution panel for `zoneId`. Reads the live convergence and offers a re-distribute to the
 * current scope. `null` renders nothing (no zone selected).
 */
export function DistributionPanel({
  zoneId,
}: {
  readonly zoneId: string | null;
}): ReactElement | null {
  const convergence = useBundleConvergence(zoneId);
  const distribute = useDistribute(zoneId);
  const [confirming, setConfirming] = useState(false);

  const scope = useMemo(
    () => convergence.data?.members?.map((m) => m.endpointCn) ?? [],
    [convergence.data],
  );

  if (zoneId === null) {
    return null;
  }

  return (
    <section className="fcx-distribution" aria-label="Policy distribution">
      <header className="fcx-distribution__head">
        <h3 className="fcx-distribution__title">Policy distribution</h3>
        {convergence.data?.hasBundle === true && (
          <span className="fcx-distribution__version">Bundle v{convergence.data.version}</span>
        )}
      </header>

      {convergence.isLoading && <LoadingState label="Loading the distribution status" />}

      {(convergence.isError || convergence.data === undefined) && !convergence.isLoading && (
        <ErrorState
          title="Could not load the distribution status."
          onRetry={() => void convergence.refetch()}
        />
      )}

      {convergence.data?.hasBundle === false && (
        <EmptyState
          title="No policy distributed yet"
          hint="Distributing to endpoints for the first time needs endpoint selection, which is not built yet. Once a bundle exists, it can be re-distributed here."
        />
      )}

      {convergence.data?.hasBundle === true && (
        <>
          <ul className="fcx-distribution__list">
            {convergence.data.members.map((member) => (
              <li key={member.endpointCn} className="fcx-distribution__member">
                <span className="fcx-distribution__cn">{member.endpointCn}</span>
                <span className={`fc-badge ${STATE_BADGE[member.state]}`}>
                  {STATE_LABEL[member.state]}
                  {member.reason !== null && `: ${member.reason}`}
                </span>
              </li>
            ))}
          </ul>

          {distribute.isError && (
            <p className="fcx-distribution__failure" role="alert">
              The re-distribution failed. Nothing changed on the endpoints; try again.
            </p>
          )}

          <button
            type="button"
            className="fcx-btn"
            disabled={distribute.isPending || scope.length === 0}
            onClick={() => setConfirming(true)}
          >
            {distribute.isPending
              ? 'Re-distributing…'
              : `Commit & re-distribute to ${String(scope.length)} endpoint${scope.length === 1 ? '' : 's'}`}
          </button>

          <ConfirmDialog
            open={confirming}
            title={`Distribute to ${String(scope.length)} endpoint${scope.length === 1 ? '' : 's'}?`}
            description={`The zone's effective published policies are composed, signed in the crypto sidecar, and committed for these endpoints to fetch: ${scope.join(', ')}. Enforcement stays off until separately engaged.`}
            confirmLabel="Distribute"
            onConfirm={() => {
              setConfirming(false);
              distribute.mutate(scope);
            }}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </section>
  );
}
