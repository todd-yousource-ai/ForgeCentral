import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { bindings } from '@forge/bindings';

import { DESTINATIONS } from '../../ia/destinations.js';
import { Shell } from '../../shell/Shell.js';
import { renderWithProviders, TEST_OPERATOR } from '../render.js';

// INV-CONSOLE-NO-STUB for the shell (the gate's test:contract step). The shell ships NO surface data:
// every destination renders an honest empty state rather than a fabricated table/row, and the shell
// consumes none of the shared binding registry yet. The registry holds the surface CONTRACTS registered so
// far (the entity-drawer `entity.*`, IP-CONSOLE-12 DR.1; the Logs `logs.*`, IP-CONSOLE-09 LG.1; the
// Overview `overview.*`, IP-CONSOLE-01 O1.1; the Virtual Trust Zones `vtz.*`, IP-CONSOLE-02 V2.1), but the
// surfaces that render them land in their own PRs; until a real surface adds its binding + swaps the
// placeholder, this test proves nothing fake ships from the shell.

/** The binding prefixes registered by a landed surface contract. A new surface adds its prefix here. */
const REGISTERED_PREFIXES = ['entity.', 'logs.', 'overview.', 'vtz.'];

describe('no-stub contract (F0.8 shell)', () => {
  it('binds no surface data in the shell (the registry holds only registered surface contracts, unconsumed)', () => {
    // The registered contracts so far are the entity-drawer (entity.*), the Logs surface (logs.*), the
    // Overview (overview.*), and the VTZ governance surface (vtz.*); the shell renders none of them yet
    // (each surface consumes its bindings in its own PR -- the VTZ grid lands in V2.4, not V2.1).
    const ids = Object.keys(bindings);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => REGISTERED_PREFIXES.some((prefix) => id.startsWith(prefix)))).toBe(
      true,
    );
  });

  it('renders an honest empty state for every placeholder destination, never fabricated data', () => {
    // The real surfaces (Overview O1.5, Logs LG.3, Virtual Trust Zones V2.4) render their own live element
    // and are tested in their own suites; every remaining destination is still an honest placeholder that
    // fabricates no data.
    const REAL_SURFACES = new Set(['overview', 'logs', 'vtz']);
    for (const dest of DESTINATIONS.filter((d) => !REAL_SURFACES.has(d.id))) {
      const view = renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: dest.path });
      expect(screen.getByText(`No ${dest.label} data yet`)).toBeInTheDocument();
      // No data grid/table is rendered by a placeholder surface.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
