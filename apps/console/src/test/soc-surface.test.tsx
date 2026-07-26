// apps/console/src/test/soc-surface.test.tsx -- IP-CONSOLE-03 S3.3 tests for the SOC Ops shell.
//
// Proves the S3.3 slice of INV-SOC-NO-FABRICATED-NUMBER: every tile is a real engine number or an
// explicit failure, never a plausible blank. The two assertions that matter most are about values
// that LOOK like absences and are not:
//
//   * Auto-Contained renders 0 as a VALUE with its reason, not as an unavailable tile. 0 means the
//     box contained nothing; unavailable would mean nobody knows.
//   * Noise Collapsed shows the denominator it is a share OF (firings), because a percentage whose
//     denominator the reader guesses is a percentage they will guess generously.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { SocKpis } from '@forge/contracts';

import { SocOpsSurface } from '../surfaces/SocOpsSurface.js';
import { renderWithProviders } from './render.js';

const KPIS: SocKpis = {
  eventsAnalyzed: 428_000,
  noiseCollapsed: 97,
  totalFirings: 100,
  materialIncidents: 3,
  autoContained: 0,
  decisionWaiting: 2,
  detectionEnabled: true,
  suppressingInputs: [],
};

function mockKpis(body: unknown, ok = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve({
        ok: url.includes('/kpis') ? ok : true,
        status: url.includes('/kpis') && !ok ? 503 : 200,
        json: () => Promise.resolve(url.includes('/kpis') ? body : []),
      } as Response),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the SOC Ops shell (S3.3)', () => {
  it('renders the five KPI tiles from the engine numbers', async () => {
    mockKpis(KPIS);

    renderWithProviders(<SocOpsSurface />);

    await waitFor(() => {
      expect(screen.getByLabelText('Events Analyzed')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Events Analyzed')).toHaveTextContent('428,000');
    expect(screen.getByLabelText('Material Incidents')).toHaveTextContent('3');
    expect(screen.getByLabelText('Decision Waiting')).toHaveTextContent('2');
  });

  it('renders Auto-Contained 0 as a fact with its reason, not as an unavailable tile', async () => {
    // The engine counts containments EXECUTED and enforcement is OFF, so 0 is the true count. A tile
    // that read "unavailable" would understate what the engine knows about itself.
    mockKpis(KPIS);

    renderWithProviders(<SocOpsSurface />);

    const tile = await screen.findByLabelText('Auto-Contained');
    expect(tile).toHaveTextContent('0');
    expect(tile).toHaveTextContent(/enforcement off/i);
    expect(tile).not.toHaveTextContent(/unavailable|unknown/i);
  });

  it('states the denominator the noise-collapsed share is computed against', async () => {
    // 97 of 100 FIRINGS, not of the 428,000 events analyzed. Dividing by events would yield a far
    // prettier number that means nothing.
    mockKpis(KPIS);

    renderWithProviders(<SocOpsSurface />);

    const tile = await screen.findByLabelText('Noise Collapsed');
    expect(tile).toHaveTextContent('97');
    expect(tile).toHaveTextContent('97% of 100 firings');
  });

  it('does not claim 100% noise collapsed for a window in which nothing fired', async () => {
    // 0/0 is a quiet window, not a filtering achievement.
    mockKpis({ ...KPIS, noiseCollapsed: 0, totalFirings: 0 });

    renderWithProviders(<SocOpsSurface />);

    const tile = await screen.findByLabelText('Noise Collapsed');
    expect(tile).toHaveTextContent('no firings in the window');
    expect(tile).not.toHaveTextContent('%');
  });

  it('shows an error state rather than empty tiles when the read fails', async () => {
    // The BFF returns 503 exactly when it will not render something honestly. Blanking the strip
    // would hide that and read as a quiet SOC.
    mockKpis({ error: 'unavailable' }, false);

    renderWithProviders(<SocOpsSurface />);

    // The query retries once (~1s backoff) before it settles to error, so wait past that.
    await waitFor(
      () => {
        expect(screen.getByText(/cannot be shown/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );
    expect(screen.queryByTestId('soc-kpi-strip')).not.toBeInTheDocument();
  });

  it('never claims a detection posture before the read lands', async () => {
    // A default "Detection active" pill would be a fabricated posture. Unknown is the honest render.
    mockKpis({ ...KPIS, detectionEnabled: false });

    renderWithProviders(<SocOpsSurface />);

    expect(screen.getByText('Posture unknown')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Detection disabled')).toBeInTheDocument();
    });
  });

  it('always states that enforcement is off', async () => {
    // Every number on this screen is read in that light; an operator must not have to remember it.
    mockKpis(KPIS);

    renderWithProviders(<SocOpsSurface />);

    await waitFor(() => {
      expect(screen.getAllByText(/enforcement off/i).length).toBeGreaterThan(0);
    });
  });

  it('drives the detail region from the queue selection', async () => {
    // Selection is the surface's spine: one incident scopes the lineage graph and (S3.6/S3.7) the
    // verdict and dock, all from a single payload.
    const queueRow = {
      incidentId: 'ep-soc-7',
      ruleId: 'LR-C2-001',
      anchor: 'T1071',
      subject: 'codex-helper',
      finding: 'Repeated outbound contact',
      authority: 'review_required',
      posture: 'candidate',
      confidence: 'HIGH',
      openedAt: 1,
      lastSeen: 2,
      evidenceCount: 1,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.includes('/kpis')
                ? KPIS
                : url.includes('/incident?')
                  ? {
                      row: queueRow,
                      nodes: [
                        {
                          id: 'subject',
                          lane: 'attack_path',
                          kind: 'subject',
                          label: 'codex-helper',
                          sublabel: 'T1071',
                        },
                      ],
                      edges: [],
                      evidence: [],
                      plan: [],
                      planRevision: 0,
                      planApproved: false,
                      narrativeRef: null,
                    }
                  : [queueRow],
            ),
        } as Response),
      ),
    );

    renderWithProviders(<SocOpsSurface />);

    expect(await screen.findByText('Select an incident')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /ep-soc-7/ }));

    await waitFor(() => {
      expect(screen.getByTestId('soc-lineage-graph')).toBeInTheDocument();
    });
  });

  it('renders an honest not-built state for a focus that has no bindings', () => {
    mockKpis(KPIS);
    renderWithProviders(<SocOpsSurface />);

    fireEvent.click(screen.getByRole('tab', { name: 'Threat Intel' }));

    expect(screen.getByText('Not yet built')).toBeInTheDocument();
    expect(screen.queryByTestId('soc-kpi-strip')).not.toBeInTheDocument();
    // No fabricated table stands in for the missing focus.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
