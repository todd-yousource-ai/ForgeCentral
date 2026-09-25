// apps/console/src/test/field-help.test.tsx -- IP-CONSOLE-11-guide GD.12b: the configuration forms
// outside Settings state their limits under each field and hold values to the engine's own rules
// before the confirm (the VTZ editor, the risk-acceptance date and the IdAM cadences).

import {
  DEFAULT_REAUTH_INTERVAL_HOURS,
  MAX_REAUTH_INTERVAL_HOURS,
  RISK_ACCEPTANCE_MAX_DAYS,
  VTZ_DESCRIPTION_MAX_BYTES,
  VTZ_NAME_MAX_LABELS,
} from '@forge/contracts';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { IdamConnectorsPanel } from '../surfaces/IdamConnectorsPanel.js';
import { buildDispositionDraft, latestExpiryDate } from '../surfaces/SocCaseControls.js';
import { VtzEditor } from '../surfaces/VtzEditor.js';
import { IDAM_POLL_INTERVAL_SECS_MIN } from '../surfaces/useIdam.js';
import { renderWithProviders } from './render.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function editor(): void {
  render(
    <VtzEditor
      mode="create"
      zone={null}
      parents={[]}
      busy={false}
      failure={null}
      onSubmit={() => undefined}
    />,
  );
}

describe('the VTZ editor (GD.12b)', () => {
  it('states the name rule and refuses a name the engine would refuse, with the reason', () => {
    editor();
    const name = screen.getByLabelText('VTZ name');
    const create = screen.getByRole('button', { name: 'Create zone' });
    fireEvent.change(name, { target: { value: 'reps' } });
    expect(name).toHaveAccessibleDescription(/ASCII letters, digits and hyphens/);
    expect(create).toBeEnabled();
    fireEvent.change(name, { target: { value: '-reps' } });
    expect(create).toBeDisabled();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/starting and ending with a letter or digit/);
    fireEvent.change(name, {
      target: {
        value: Array(VTZ_NAME_MAX_LABELS + 1)
          .fill('a')
          .join('.'),
      },
    });
    expect(name).toHaveAccessibleDescription(
      `The name has more than ${String(VTZ_NAME_MAX_LABELS)} levels.`,
    );
    expect(create).toBeDisabled();
  });

  it('counts the description in bytes and bounds the session duration', () => {
    editor();
    fireEvent.change(screen.getByLabelText('VTZ name'), { target: { value: 'reps' } });
    const create = screen.getByRole('button', { name: 'Create zone' });
    const description = screen.getByLabelText('Description');
    fireEvent.change(description, { target: { value: 'é'.repeat(513) } });
    expect(description).toHaveAccessibleDescription(
      new RegExp(`1026 of ${String(VTZ_DESCRIPTION_MAX_BYTES)} bytes`),
    );
    expect(create).toBeDisabled();
    fireEvent.change(description, { target: { value: '' } });
    const session = screen.getByLabelText('Session duration (hours)');
    expect(session).toHaveValue(DEFAULT_REAUTH_INTERVAL_HOURS);
    fireEvent.change(session, { target: { value: String(MAX_REAUTH_INTERVAL_HOURS + 1) } });
    expect(create).toBeDisabled();
    fireEvent.change(session, { target: { value: String(MAX_REAUTH_INTERVAL_HOURS) } });
    expect(create).toBeEnabled();
  });
});

describe('the risk-acceptance lapse date (GD.12b)', () => {
  // 2027-01-15T08:00:00Z.
  const NOW = 1_800_000_000;
  const form = (expiryDate: string) =>
    ({
      disposition: 'true_positive_risk_accepted',
      text: 'ciso',
      action: 'reimage',
      expiryDate,
    }) as const;

  it(`accepts up to ${String(RISK_ACCEPTANCE_MAX_DAYS)} days away and refuses the day after`, () => {
    expect(latestExpiryDate(NOW)).toBe('2028-01-15');
    expect(buildDispositionDraft(form('2028-01-15'), NOW)).not.toBeNull();
    expect(buildDispositionDraft(form('2028-01-16'), NOW)).toBeNull();
  });
});

describe('the IdAM onboarding cadences (GD.12b)', () => {
  it('states each bound and disables Save connector outside it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
        ),
      ),
    );
    renderWithProviders(<IdamConnectorsPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Onboard Auth0' }));
    fireEvent.change(screen.getByLabelText('Provider Domain'), {
      target: { value: 'x.auth0.com' },
    });
    fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'cid' } });
    fireEvent.change(screen.getByLabelText(/Client Secret/), { target: { value: 's' } });
    const poll = screen.getByLabelText('Delta poll interval (seconds)');
    expect(poll).toHaveAccessibleDescription(/60 to 86,400 seconds; default 300/);
    const connect = screen.getByRole('button', { name: 'Save connector' });
    expect(connect).toBeEnabled();
    fireEvent.change(poll, { target: { value: String(IDAM_POLL_INTERVAL_SECS_MIN - 1) } });
    expect(connect).toBeDisabled();
    fireEvent.change(poll, { target: { value: String(IDAM_POLL_INTERVAL_SECS_MIN) } });
    fireEvent.change(screen.getByLabelText('Full directory sync (hours)'), {
      target: { value: '0' },
    });
    expect(connect).toBeDisabled();
  });
});
