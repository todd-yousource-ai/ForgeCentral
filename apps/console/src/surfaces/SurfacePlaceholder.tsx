import type { ReactElement } from 'react';

import type { Destination } from '../ia/destinations.js';
import { EmptyState, StaleBanner } from '../states/States.js';
import { useDrawer } from '../shell/DrawerHost.js';
import { useLive } from '../live/LiveProvider.js';

// The per-destination surface placeholder. F0.8 ships NO surface data: every destination renders an honest
// empty state (never a fabricated row), and the live-badged home surface shows the staleness marker while
// the live channel is deferred (F0.6). The home surface also carries the select-then-act affordance that
// opens the shell drawer host, so the <=3-click "inspect an entity" frame is reachable now; the drawer
// body (real entity detail) lands with TRD-CONSOLE-12. Each real surface replaces this placeholder in its
// own phase, binding real reads through @forge/bindings (INV-CONSOLE-NO-STUB).

export function SurfacePlaceholder({
  destination,
}: {
  readonly destination: Destination;
}): ReactElement {
  const drawer = useDrawer();
  const live = useLive();
  const isHome = destination.id === 'overview';

  return (
    <section className="fcx-surface" aria-labelledby={`surface-${destination.id}`}>
      <h2 id={`surface-${destination.id}`} className="fcx-surface__heading">
        {destination.label}
      </h2>
      {isHome && live.status !== 'live' ? <StaleBanner reason={live.reason} /> : null}
      <EmptyState
        title={`No ${destination.label} data yet`}
        hint="This surface ships its live bindings in its own phase. The shell frame, navigation, and states are in place; no data is fabricated."
        action={
          isHome ? (
            <button
              type="button"
              className="fcx-btn"
              onClick={() => drawer.open({ title: 'Entity' })}
            >
              Open entity drawer
            </button>
          ) : undefined
        }
      />
    </section>
  );
}
