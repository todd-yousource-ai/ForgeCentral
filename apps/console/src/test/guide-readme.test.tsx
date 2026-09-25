// apps/console/src/test/guide-readme.test.tsx -- IP-CONSOLE-11-guide GD.2: the ReadMe tab
// (TRD-CONSOLE-11 Section 11; INV-GUIDE-ADDRESSABLE, INV-GUIDE-ENGINE-VALUES-LIVE, 11.7).

import type { SettingRow, SettingsView } from '@forge/contracts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GUIDE } from '../guide/generated/guide-content.js';
import { SettingsSurface } from '../surfaces/SettingsSurface.js';
import { renderWithProviders } from './render.js';

function row(key: string, value: string, overrides: Partial<SettingRow> = {}): SettingRow {
  return {
    key,
    surface: key.split('.')[0] ?? key,
    origin: 'knob',
    value,
    valueType: 'Count',
    defaultValue: '60',
    bound: 'Not 0',
    liveApply: 'live (read every cycle)',
    changeVia: 'config-commit / config-apply',
    uiBinding: `console:settings/${key}`,
    summary: `The engine's own definition of ${key}.`,
    editable: true,
    ...overrides,
  };
}

function view(rows: readonly SettingRow[]): SettingsView {
  return {
    version: 12,
    rows,
    surfaces: [],
    dualControlRequired: false,
    sectionValues: null,
    identity: null,
  };
}

/** Serve GET /api/settings with the given status and body; everything else is unexpected. */
function mockSettingsRead(status: number, body: SettingsView | null): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (!url.startsWith('/api/settings')) {
        return Promise.reject(new Error(`unexpected fetch ${url}`));
      }
      return Promise.resolve({
        ok: status === 200,
        status,
        json: () => Promise.resolve(body),
      } as Response);
    }),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REFERENCE = GUIDE.chapters.find((c) => c.referenceKeys !== undefined);

describe('the ReadMe tab (GD.2)', () => {
  it('opens at the contents, listing every chapter of the guide', async () => {
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=readme' });
    const contents = await screen.findByTestId('guide-contents');
    for (const chapter of GUIDE.chapters) {
      expect(
        within(contents).getByRole('link', { name: new RegExp(chapter.title) }),
      ).toBeInTheDocument();
    }
  });

  it('is reached from the Settings tab strip, which records the tab in the URL', async () => {
    mockSettingsRead(403, null); // the SOC tab reads first; refused, it renders its tier state
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=bogus' });
    // An unknown tab falls back to SOC; the ReadMe tab opens the guide.
    fireEvent.click(screen.getByRole('tab', { name: 'ReadMe' }));
    expect(await screen.findByTestId('guide-contents')).toBeInTheDocument();
  });

  it('opens a deep link at its section, which is what survives a reload', async () => {
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=readme#setc-dual' });
    await screen.findByTestId('guide');
    await waitFor(() => expect(document.getElementById('setc-dual')).not.toBeNull());
    expect(screen.queryByTestId('guide-contents')).not.toBeInTheDocument();
  });

  it('opens the contents with a notice for a section that does not exist', async () => {
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=readme#no-such-section' });
    expect(await screen.findByTestId('guide-unknown-target')).toHaveTextContent('no-such-section');
    expect(screen.getByTestId('guide-contents')).toBeInTheDocument();
  });

  it('navigates from the contents and from a cross reference inside a chapter', async () => {
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=readme' });
    const contents = await screen.findByTestId('guide-contents');
    const chapter = GUIDE.chapters[1];
    if (chapter === undefined) throw new Error('the guide has fewer than two chapters');
    fireEvent.click(within(contents).getByRole('link', { name: new RegExp(chapter.title) }));
    await waitFor(() => expect(document.getElementById(chapter.id)).not.toBeNull());
    const xref = document.querySelector<HTMLAnchorElement>(`#${chapter.id} a.xref`);
    if (xref === null) throw new Error(`${chapter.id} has no cross reference to follow`);
    const target = (xref.getAttribute('href') ?? '').slice(1);
    fireEvent.click(xref);
    await waitFor(() => expect(document.getElementById(target)).not.toBeNull());
  });

  it('narrows the sections with the filter and says so when nothing matches', async () => {
    renderWithProviders(<SettingsSurface />, { route: '/settings?tab=readme' });
    const filter = await screen.findByRole('searchbox');
    fireEvent.change(filter, { target: { value: 'dual control' } });
    const hits = await screen.findByTestId('guide-hits');
    expect(within(hits).getAllByRole('link').length).toBeGreaterThan(0);
    fireEvent.change(filter, { target: { value: 'zzqq nothing like this' } });
    expect(await screen.findByText('No section matches that filter')).toBeInTheDocument();
  });
});

describe('the live Settings reference (INV-GUIDE-ENGINE-VALUES-LIVE)', () => {
  const route = `/settings?tab=readme#${REFERENCE?.sections[1]?.id ?? 'missing'}`;

  it('is Appendix A, listing the registry keys in the document', () => {
    expect(REFERENCE?.referenceKeys?.length).toBeGreaterThan(50);
    expect(REFERENCE?.referenceKeys).toContain('maintenance.cadence_secs');
  });

  it("renders the engine's own values, and a changed engine value changes the page", async () => {
    mockSettingsRead(200, view([row('maintenance.cadence_secs', '120')]));
    renderWithProviders(<SettingsSurface />, { route });
    const cell = await screen.findByText('120');
    const tr = cell.closest('tr');
    if (tr === null) throw new Error('the value is not in a table row');
    expect(tr).toHaveTextContent("The engine's own definition of maintenance.cadence_secs.");
    expect(tr).toHaveTextContent('Live');
    expect(tr).toHaveTextContent('Edit');
    cleanup();

    mockSettingsRead(
      200,
      view([
        row('maintenance.cadence_secs', '300', {
          liveApply: 'boot-bound (a change needs a restart)',
          editable: false,
        }),
      ]),
    );
    renderWithProviders(<SettingsSurface />, { route });
    const changed = (await screen.findByText('300')).closest('tr');
    expect(changed).toHaveTextContent('Restart');
    expect(changed).toHaveTextContent('Read-only');
    expect(screen.queryByText('120')).not.toBeInTheDocument();
  });

  it('never fills a setting the engine did not report', async () => {
    mockSettingsRead(200, view([row('maintenance.cadence_secs', '120')]));
    renderWithProviders(<SettingsSurface />, {
      route: `/settings?tab=readme#${REFERENCE?.sections[1]?.id ?? ''}`,
    });
    await screen.findByText('120');
    expect(screen.getAllByText('Not reported by this engine.').length).toBeGreaterThan(0);
  });

  it('shows a setting the engine reports that the document does not list', async () => {
    mockSettingsRead(
      200,
      view([row('maintenance.cadence_secs', '120'), row('warp.drive', 'engaged')]),
    );
    renderWithProviders(<SettingsSurface />, { route });
    const other = await screen.findByTestId('guide-unlisted-settings');
    expect(other).toHaveTextContent('warp.drive');
    expect(other).toHaveTextContent('engaged');
  });

  it('shows the tier refusal in place of the values, and the rest of the appendix still renders', async () => {
    mockSettingsRead(403, null);
    renderWithProviders(<SettingsSurface />, { route });
    expect(
      (await screen.findAllByText('Admin or SecurityAudit tier required')).length,
    ).toBeGreaterThan(0);
    expect(document.getElementById(REFERENCE?.sections[0]?.id ?? '')).not.toBeNull();
    expect(screen.queryByText('Not reported by this engine.')).not.toBeInTheDocument();
  });

  it('shows the error state with Retry when the read fails', async () => {
    mockSettingsRead(500, null);
    renderWithProviders(<SettingsSurface />, { route });
    // The query client retries once (about a second) before it reports the failure.
    expect(
      (await screen.findAllByText('The settings could not be read', {}, { timeout: 4000 })).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /retry/i }).length).toBeGreaterThan(0);
    expect(document.getElementById(REFERENCE?.sections[0]?.id ?? '')).not.toBeNull();
  });
});
