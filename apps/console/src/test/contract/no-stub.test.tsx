import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { bindings } from '@forge/bindings';

import { DESTINATIONS } from '../../ia/destinations.js';
import { Shell } from '../../shell/Shell.js';
import { renderWithProviders, TEST_OPERATOR } from '../render.js';

// INV-CONSOLE-NO-STUB for the shell (the gate's test:contract step). The shell ships NO surface data: the
// binding registry is empty (no data binding is faked), and every destination renders an honest empty
// state rather than a fabricated table/row. A real surface adds its binding + swaps the placeholder in its
// own phase; until then this test proves nothing fake ships.

describe('no-stub contract (F0.8 shell)', () => {
  it('registers no data bindings yet (the shell binds no surface data)', () => {
    expect(Object.keys(bindings)).toHaveLength(0);
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
