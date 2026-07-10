import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DESTINATIONS } from '../ia/destinations.js';
import { Shell } from '../shell/Shell.js';
import { LiveStore } from '../live/live-store.js';
import { renderWithProviders, TEST_OPERATOR } from './render.js';

// INV-CONSOLE-SHELL-3-CLICK-FRAME: the shell realizes the IA (all destinations reachable from the rail),
// the select-then-act drawer frame surrounds every surface, and no fabricated data renders.

describe('the SPA shell', () => {
  it('renders all eleven primary destinations in the rail', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    const rail = screen.getByRole('navigation', { name: 'Primary' });
    for (const dest of DESTINATIONS) {
      expect(within(rail).getByRole('link', { name: dest.label })).toBeInTheDocument();
    }
    expect(within(rail).getAllByRole('link')).toHaveLength(DESTINATIONS.length);
  });

  it('marks Overview active at the home route', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/' });
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveClass('fcx-rail__item--active');
    expect(screen.getByRole('heading', { name: 'Overview', level: 2 })).toBeInTheDocument();
  });

  it('navigates to another destination in one click (updates the title + active state)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    await user.click(screen.getByRole('link', { name: 'Policies' }));
    expect(screen.getByRole('heading', { name: 'Policies', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Policies', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Policies' })).toHaveClass('fcx-rail__item--active');
  });

  it('shows the operator identity + tier in the account menu, and no fake "Live" pill', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />);
    expect(screen.getByText(TEST_OPERATOR.email as string)).toBeInTheDocument();
    expect(screen.getByText(TEST_OPERATOR.tier)).toBeInTheDocument();
    // F0.6 deferred -> the live indicator is honest, never a fabricated "Live".
    expect(screen.getByText('Not live')).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('opens and closes the shell drawer host (the select-then-act frame)', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open entity drawer' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a staleness marker on the live home surface while the live channel is deferred', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/' });
    expect(screen.getByText('Live channel not enabled yet')).toBeInTheDocument();
  });

  it('drops the staleness marker when the live store reports a fresh stream', () => {
    const store = new LiveStore({ status: 'live', reason: '' });
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/', liveStore: store });
    expect(screen.queryByText('Live channel not enabled yet')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders an explicit not-found state for an unknown route', () => {
    renderWithProviders(<Shell operator={TEST_OPERATOR} />, { route: '/nope' });
    expect(screen.getByText('That destination does not exist')).toBeInTheDocument();
  });
});
