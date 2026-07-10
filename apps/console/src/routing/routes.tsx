import type { ReactElement } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';

import { DESTINATIONS } from '../ia/destinations.js';
import { EmptyState } from '../states/States.js';
import { SurfacePlaceholder } from '../surfaces/SurfacePlaceholder.js';

// One route per destination, generated from the IA (single source). Every route renders the surface
// placeholder (an honest empty state) in F0.8; each real surface swaps its element in later. An unknown
// path is an explicit not-found state, never a blank screen or a redirect that hides the miss.

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
        <Route key={d.id} path={d.path} element={<SurfacePlaceholder destination={d} />} />
      ))}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
