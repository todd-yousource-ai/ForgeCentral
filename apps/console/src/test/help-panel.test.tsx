// apps/console/src/test/help-panel.test.tsx -- the contextual side panel (IP-CONSOLE-11-guide GD.11;
// INV-GUIDE-CONTEXTUAL): the Help control opens the section for the active surface and tab, its links open
// the ReadMe, and closing returns focus to the control.

import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { TopBar } from '../shell/TopBar.js';
import { renderWithProviders } from './render.js';

const OPERATOR = { subject: 'auth0|op', email: 'op@example.gov', tier: 'Admin' } as const;

function Where(): ReactElement {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}${location.hash}`}</p>;
}

function Harness(): ReactElement {
  return (
    <>
      <TopBar title="Settings" operator={OPERATOR} />
      <Where />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('the contextual help panel (GD.11)', () => {
  it('opens at the section for the active Settings tab', async () => {
    renderWithProviders(<Harness />, { route: '/settings?tab=configuration' });
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = await screen.findByRole('dialog', { name: 'The governed configuration' });
    expect(within(dialog).getByText(/Chapter 4:/)).toBeInTheDocument();
  });

  it('opens the destination section on another surface', async () => {
    renderWithProviders(<Harness />, { route: '/vtz' });
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    expect(await screen.findByRole('dialog', { name: 'How zones work' })).toBeInTheDocument();
  });

  it('links to the full chapter in the ReadMe and closes', async () => {
    renderWithProviders(<Harness />, { route: '/settings?tab=security' });
    fireEvent.click(screen.getByRole('button', { name: 'Help' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('link', { name: 'Read the full chapter' }));
    await waitFor(() => {
      expect(screen.getByTestId('where')).toHaveTextContent(
        '/settings?tab=readme#ch-settings-platform-posture',
      );
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('returns focus to the Help control when closed', async () => {
    renderWithProviders(<Harness />, { route: '/logs' });
    const help = screen.getByRole('button', { name: 'Help' });
    fireEvent.click(help);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(help).toHaveFocus();
  });

  it('offers no help on a path that is not a destination', () => {
    renderWithProviders(<Harness />, { route: '/nowhere' });
    expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
  });
});
