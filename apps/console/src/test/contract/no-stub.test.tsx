import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { bindings } from '@forge/bindings';

import { DESTINATIONS } from '../../ia/destinations.js';
import { Shell } from '../../shell/Shell.js';
import { renderWithProviders, TEST_OPERATOR } from '../render.js';

// INV-CONSOLE-NO-STUB for the shell (the gate's test:contract step). The shell ships NO surface data:
// every destination renders an honest empty state rather than a fabricated table/row, and the shell
// consumes none of the shared binding registry yet. The registry now holds the entity-drawer CONTRACT
// (entity.*, IP-CONSOLE-12 DR.1), but the drawer that renders it lands at DR.2; until a real surface adds
// its binding + swaps the placeholder, this test proves nothing fake ships from the shell.

describe('no-stub contract (F0.8 shell)', () => {
  it('binds no surface data in the shell (the registry holds only the drawer contract, unconsumed)', () => {
    // DR.1 registered the entity-drawer contract; the shell renders none of it yet (the drawer is DR.2).
    const ids = Object.keys(bindings);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith('entity.'))).toBe(true);
  });

  it('renders an honest empty state for every destination, never fabricated data', () => {
    for (const dest of DESTINATIONS) {
      const view = renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: dest.path });
      expect(screen.getByText(`No ${dest.label} data yet`)).toBeInTheDocument();
      // No data grid/table is rendered by a placeholder surface.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(screen.queryByRole('grid')).not.toBeInTheDocument();
      view.unmount();
    }
  });
});
