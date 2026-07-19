import type { ReactElement } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';

import { DESTINATIONS } from '../ia/destinations.js';
import { EmptyState } from '../states/States.js';
import { LogsSurface } from '../surfaces/LogsSurface.js';
import { OverviewSurface } from '../surfaces/OverviewSurface.js';
import { SurfacePlaceholder } from '../surfaces/SurfacePlaceholder.js';
import { VtzSurface } from '../surfaces/VtzSurface.js';

// One route per destination, generated from the IA (single source). A real surface renders its own
// element; the rest render the honest empty placeholder until their phase lands. An unknown path is an
// explicit not-found state, never a blank screen or a redirect that hides the miss.

/**
 * The real surfaces that have replaced their placeholder, keyed by destination id (Overview O1.5; Logs
 * LG.3; Virtual Trust Zones V2.4).
 */
const SURFACES: Readonly<Record<string, ReactElement>> = {
  overview: <OverviewSurface />,
  logs: <LogsSurface />,
  vtz: <VtzSurface />,
};

function NotFound(): ReactElement {
  const location = useLocation();
  return (
    <section className="fcx-surface" aria-label="Not found">
      <EmptyState
        title="That destination does not exist"
        hint={`No surface is mapped to ${location.pathname}.`}
        action={
          <Link className="fcx-btn" to="/">
            Go to Overview
          </Link>
        }
      />
    </section>
  );
}

export function SurfaceRoutes(): ReactElement {
  return (
    <Routes>
      {DESTINATIONS.map((d) => (
        <Route
          key={d.id}
          path={d.path}
          element={SURFACES[d.id] ?? <SurfacePlaceholder destination={d} />}
        />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
