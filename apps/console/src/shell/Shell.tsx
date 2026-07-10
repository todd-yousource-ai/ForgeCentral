import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';

import { destinationForPath, HOME } from '../ia/destinations.js';
import type { OperatorDto } from '../auth/api.js';
import { ErrorBoundary } from '../states/ErrorBoundary.js';
import { SurfaceRoutes } from '../routing/routes.js';
import { DrawerHost } from './DrawerHost.js';
import { NavRail } from './NavRail.js';
import { TopBar } from './TopBar.js';

// The authenticated shell frame: the persistent rail, the top bar (title from the active destination), and
// the routed surface outlet wrapped in the drawer host + an error boundary. This is the whole of
// INV-CONSOLE-SHELL-3-CLICK-FRAME: the IA is reachable from one place, the select-then-act drawer frame
// surrounds every surface, and a render failure degrades to the explicit error state (Section 9), not a
// blank page. No surface data lives here.

export function Shell({ operator }: { readonly operator: OperatorDto }): ReactElement {
  const location = useLocation();
  const active = destinationForPath(location.pathname) ?? HOME;

  return (
    <div className="fcx-shell">
      <NavRail />
      <div className="fcx-shell__main">
        <TopBar title={active.label} operator={operator} />
        <main className="fcx-shell__content" aria-label={active.label}>
          <DrawerHost>
            <ErrorBoundary>
              <SurfaceRoutes />
            </ErrorBoundary>
          </DrawerHost>
        </main>
      </div>
    </div>
  );
}
