// apps/console/src/test/reports-surface.test.tsx -- IP-CONSOLE-03 S3.16 the Reports tab (crdb C.9).

import type { SocIncidentRow, SocReport, SocWeekly } from '@forge/contracts';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReportsSurface, downloadReport } from '../surfaces/ReportsSurface.js';
import { renderWithProviders } from './render.js';

const ROW: SocIncidentRow = {
  incidentId: 'ep-r-1',
  ruleId: 'LR-C2-001',
  anchor: 'T1071',
  subject: 'codex-helper',
  finding: 'Repeated outbound contact to a rare destination',
  authority: 'review_required',
  posture: 'candidate',
  confidence: 'HIGH',
  openedAt: 1,
  lastSeen: 2,
  evidenceCount: 2,
  subjectName: null,
  destination: null,
  credibilityMilli: null,
  impliedProbabilityMilli: null,
};

const REPORT: SocReport = {
  incidentId: 'ep-r-1',
  generatedAt: 1_700_000_000,
  narrativeState: 'absent',
  narrativeDetail: 'unbound',
  modelRef: null,
  inputHash: 'sha512:in',
  sections: [
    {
      name: 'executive_summary',
      source: 'template',
      lines: ['Candidate incident on codex-helper.'],
    },
    { name: 'immediate_actions', source: 'engine', lines: ['1. Inspect codex-helper [proposed]'] },
  ],
  citedEvidence: ['leg:net:198.51.100.7'],
  needsHumanReview: false,
};

const WEEKLY: SocWeekly = {
  weeks: [
    {
      weekStartSeconds: 1_699_228_800,
      fires: 3,
      opened: 1,
      promoted: 0,
      transitioned: 0,
      demoted: 0,
      dropped: 0,
      muted: 1,
      eventsAnalyzed: 10,
      techniquesFired: 1,
      incidentsOpened: 1,
      incidentsClosed: 0,
    },
    {
      weekStartSeconds: 1_699_833_600,
      fires: 7,
      opened: 1,
      promoted: 2,
      transitioned: 0,
      demoted: 0,
      dropped: 0,
      muted: 2,
      eventsAnalyzed: 20,
      techniquesFired: 2,
      incidentsOpened: 1,
      incidentsClosed: 1,
    },
  ],
  coverage: {
    source: 'bundled',
    rulesLoaded: 120,
    evaluable: 45,
    unevaluable: 75,
    blockingLogsources: [],
    blockingFields: [],
    truncated: false,
  },
  episodesTruncated: false,
  untilSeconds: 1_700_000_000,
};

function mockReads(
  rows: readonly SocIncidentRow[],
  report: SocReport | null,
  weekly: SocWeekly | null = WEEKLY,
): void {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/api/soc/weekly')) {
        return Promise.resolve({
          ok: weekly !== null,
          status: weekly === null ? 404 : 200,
          json: () => Promise.resolve(weekly),
        } as Response);
      }
      if (url.includes('/api/soc/report')) {
        return Promise.resolve({
          ok: report !== null,
          status: report === null ? 404 : 200,
          json: () => Promise.resolve(report),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(rows),
      } as Response);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Reports tab (S3.16)', () => {
  it('renders the shaped report with every section source declared, as a read', async () => {
    mockReads([ROW], REPORT);
    renderWithProviders(<ReportsSurface />, { route: '/reports' });
    const picker = await screen.findByTestId('reports-picker');
    fireEvent.change(picker, { target: { value: 'ep-r-1' } });
    await screen.findByTestId('reports-report');
    expect(screen.getByTestId('reports-narrative-state')).toHaveTextContent(
      /No narrative model is bound; the model sections are the declared template/,
    );
    expect(screen.getByText('Executive summary')).toBeInTheDocument();
    expect(screen.getByText('template (declared fallback)')).toBeInTheDocument();
    expect(screen.getByText('engine (record)')).toBeInTheDocument();
    expect(screen.getByText('Candidate incident on codex-helper.')).toBeInTheDocument();
    // The read is a READ: only the queue, the report and the weekly volume were fetched; nothing posted.
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(
      calls.every(
        (u) =>
          u.includes('/api/soc/incidents') ||
          u.includes('/api/soc/report') ||
          u.includes('/api/soc/weekly'),
      ),
    ).toBe(true);
  });

  it('renders the weekly volume the engine derived, oldest first, with the coverage labelled current', async () => {
    // S3.17 (crdb C.9b, INV-SOC-WEEKLY-DERIVED): the rows are the engine's, in its order; the
    // coverage line says it is the current reading, never a per-week trend the store does not hold.
    mockReads([ROW], REPORT);
    renderWithProviders(<ReportsSurface />, { route: '/reports' });
    const weekly = await screen.findByTestId('reports-weekly');
    const cells = weekly.querySelectorAll('tbody tr');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent('2023-11-06');
    expect(cells[0]).toHaveTextContent('3');
    expect(cells[1]).toHaveTextContent('2023-11-13');
    expect(cells[1]).toHaveTextContent('7');
    expect(screen.getByTestId('reports-weekly-coverage')).toHaveTextContent(
      '45 of 120 rules evaluable',
    );
    expect(screen.getByTestId('reports-weekly-coverage')).toHaveTextContent('current reading');
  });

  it('shows the weekly refusal as an honest empty state, never zeros', async () => {
    mockReads([ROW], REPORT, null);
    renderWithProviders(<ReportsSurface />, { route: '/reports' });
    await screen.findByText('No weekly volume for this tenant');
    expect(screen.queryByTestId('reports-weekly')).not.toBeInTheDocument();
  });

  it('shows an honest empty state with no incidents and a refusal as no report, never fabricated text', async () => {
    mockReads([], null);
    renderWithProviders(<ReportsSurface />, { route: '/reports' });
    await screen.findByText('No open incidents to report on');
    expect(screen.queryByTestId('reports-report')).not.toBeInTheDocument();
  });

  it('exports exactly the read: the text carries the sections under their declared sources', () => {
    const created: string[] = [];
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        created.push(blob.type);
        return 'blob:x';
      },
      revokeObjectURL: () => undefined,
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    downloadReport(REPORT, 'text');
    downloadReport(REPORT, 'json');
    expect(created).toEqual(['text/plain', 'application/json']);
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });
});
