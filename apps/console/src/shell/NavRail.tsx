import type { ReactElement } from 'react';
import { NavLink } from 'react-router-dom';

import { DESTINATIONS } from '../ia/destinations.js';

// The persistent left rail: the eleven primary destinations (TRD-CONSOLE-00 Section 5.1), in order. Each
// is a NavLink so the active destination is marked (aria-current) and routing stays in the URL. On narrow
// viewports the rail collapses to the glyph column (CSS); the label stays in the accessible name so the
// collapsed rail is still navigable by screen reader. The rail is a landmark <nav>.

export function NavRail(): ReactElement {
  return (
    <nav className="fcx-rail" aria-label="Primary">
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
              <span className="fcx-rail__glyph" aria-hidden="true">
                {d.short}
              </span>
              <span className="fcx-rail__label">{d.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
