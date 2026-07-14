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
// Overview `overview.*`, IP-CONSOLE-01 O1.1), but the surfaces that render them land in their own PRs;
// until a real surface adds its binding + swaps the placeholder, this test proves nothing fake ships from
// the shell.

describe('no-stub contract (F0.8 shell)', () => {
  it('binds no surface data in the shell (the registry holds only registered surface contracts, unconsumed)', () => {
    // The registered contracts so far are the entity-drawer (entity.*), the Logs surface (logs.*), and the
    // Overview (overview.*); the shell renders none of them yet (each surface consumes its bindings in its
    // own PR -- the Overview surface itself lands in O1.5, not O1.1).
    const ids = Object.keys(bindings);
    expect(ids.length).toBeGreaterThan(0);
    expect(
      ids.every(
        (id) => id.startsWith('entity.') || id.startsWith('logs.') || id.startsWith('overview.'),
      ),
    ).toBe(true);
  });

  it('renders an honest empty state for every placeholder destination, never fabricated data', () => {
    // The real surfaces (Logs, LG.3) render their own live element and are tested in their own suite;
    // every remaining destination is still an honest placeholder that fabricates no data.
    const REAL_SURFACES = new Set(['logs']);
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
