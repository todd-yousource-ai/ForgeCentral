import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

import { DESTINATIONS } from '../ia/destinations.js';
import { EnvBadge, YouSourceLogo } from './Brand.js';

// The persistent left rail: the YouSource brand + environment badge at the top, then the eleven primary
// destinations (TRD-CONSOLE-00 Section 5.1), in order, each a full label (no abbreviations). Each item is
// a NavLink so the active destination is marked (aria-current) and routing stays in the URL. The rail is a
// landmark <nav>.

export function NavRail(): ReactElement {
  return (
    <nav className="fcx-rail" aria-label="Primary">
      <div className="fcx-rail__brand">
        <YouSourceLogo className="fcx-rail__logo" />
        <EnvBadge />
      </div>
      <ul className="fcx-rail__list">
        {DESTINATIONS.map((d) => (
          <li key={d.id}>
            <NavLink
              to={d.path}
              end={d.path === '/'}
              className={({ isActive }) =>
                isActive ? 'fcx-rail__item fcx-rail__item--active' : 'fcx-rail__item'
              }
              data-dest={d.id}
            >
              <span className="fcx-rail__label">{d.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
