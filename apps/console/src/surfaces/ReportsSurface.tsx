// apps/console/src/surfaces/ReportsSurface.tsx -- the Reports tab (IP-CONSOLE-03 S3.16; crdb
// IP-AISOC-STEP1 C.9, INV-FC-NO-STUB).
//
// Incident export: pick an open incident from the engine's queue, read its SHAPED report (crdb C.5,
// SOC_INCIDENT_REPORT) and render the six sections with the source each one declares -- model
// (adjudicated prose), engine (the record) or template (the declared fallback while no narrative
// model is bound or no run is recorded). Export downloads exactly that read as text or JSON; nothing
// is generated, summarized or reordered on the way out. Weekly coverage / volume is NOT here: the
// engine has no windowed summary yet (DETECT_SUMMARY is a point-in-time read), and the roadmap rule
// is to extend the engine rather than aggregate in the BFF -- so it landed WITH its engine read
// (C.9b, SOC_WEEKLY_SUMMARY): the weekly panel below renders what the engine derived from its
// persisted rollup and episode records, week by week, and labels the coverage figure as current.

import { useState, type ReactElement } from 'react';
import { DataTable, GlassPanel } from '@forge/design';
import type { SocIncidentRow, SocReport, SocWeekRow, SocWeekly } from '@forge/contracts';
import { reportSectionLabel, reportSourceLabel, reportToText } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useSocIncidents, useSocReport, useSocWeekly } from './useSoc.js';

/** Trigger a browser download of the report AS READ (text or JSON); the file is the engine's answer. */
export function downloadReport(report: SocReport, format: 'text' | 'json'): void {
  const body = format === 'json' ? JSON.stringify(report, null, 2) : reportToText(report);
  const blob = new Blob([body], { type: format === 'json' ? 'application/json' : 'text/plain' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `incident-report-${report.incidentId.slice(0, 24)}.${format === 'json' ? 'json' : 'txt'}`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function narrativeLine(report: SocReport): string {
  switch (report.narrativeState) {
    case 'published':
      return `Narrative published${report.modelRef === null ? '' : ` by ${report.modelRef}`}`;
    case 'refused':
      return `Narrative refused${report.narrativeDetail === null ? '' : `: ${report.narrativeDetail}`}`;
    case 'absent':
      return report.narrativeDetail === 'unbound'
        ? 'No narrative model is bound; the model sections are the declared template'
        : 'No narrative run is recorded for this evidence; the model sections are the declared template';
  }
}

function ReportView({ report }: { readonly report: SocReport }): ReactElement {
  return (
    <div data-testid="reports-report">
      <p className="fcx-reports__state" data-testid="reports-narrative-state">
        {narrativeLine(report)}
        {report.needsHumanReview ? ' -- needs human review' : ''}
      </p>
      <div className="fcx-reports__actions">
        <button type="button" className="fcx-btn" onClick={() => downloadReport(report, 'text')}>
          Export as text
        </button>
        <button type="button" className="fcx-btn" onClick={() => downloadReport(report, 'json')}>
          Export as JSON
        </button>
      </div>
      {report.sections.map((section) => (
        <section
          key={section.name}
          className="fcx-reports__section"
          aria-labelledby={`report-${section.name}`}
          data-source={section.source}
        >
          <h3 id={`report-${section.name}`} className="fcx-reports__heading">
            {reportSectionLabel(section.name)}{' '}
            <span className="fcx-reports__source">{reportSourceLabel(section.source)}</span>
          </h3>
          <ul className="fcx-reports__lines">
            {section.lines.map((line, index) => (
              <li key={`${section.name}-${String(index)}`}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      {report.citedEvidence.length > 0 ? (
        <section className="fcx-reports__section" aria-label="Cited evidence">
          <h3 className="fcx-reports__heading">Cited evidence</h3>
          <ul className="fcx-reports__lines">
            {report.citedEvidence.map((leg) => (
              <li key={leg}>
                <code>{leg}</code>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** TUNE: the tab shows a quarter; the engine clamps at 12 either way. */
const WEEKS_SHOWN = 12;

function weekLabel(row: SocWeekRow): string {
  return new Date(row.weekStartSeconds * 1000).toISOString().slice(0, 10);
}

function WeeklyTable({ weekly }: { readonly weekly: SocWeekly }): ReactElement {
  return (
    <div data-testid="reports-weekly">
      <p className="fcx-reports__state" data-testid="reports-weekly-coverage">
        {weekly.coverage === null
          ? 'Corpus coverage: no reading on this node.'
          : `Corpus coverage now: ${String(weekly.coverage.evaluable)} of ${String(weekly.coverage.rulesLoaded)} rules evaluable on this node's sources (current reading, not per week).`}
        {weekly.episodesTruncated
          ? ' Incident counts may undercount: the engine scan hit its ceiling.'
          : ''}
      </p>
      <DataTable<SocWeekRow>
        caption="Detection volume by ISO week (Monday, UTC); oldest first, the last row is the current partial week"
        columns={[
          { id: 'week', header: 'Week of', cell: weekLabel },
          { id: 'fires', header: 'Firings', cell: (r) => String(r.fires), align: 'end' },
          { id: 'opened', header: 'Opened', cell: (r) => String(r.opened), align: 'end' },
          { id: 'promoted', header: 'Promoted', cell: (r) => String(r.promoted), align: 'end' },
          { id: 'muted', header: 'Muted', cell: (r) => String(r.muted), align: 'end' },
          {
            id: 'techniques',
            header: 'Techniques fired',
            cell: (r) => String(r.techniquesFired),
            align: 'end',
          },
          {
            id: 'inc-opened',
            header: 'Incidents opened',
            cell: (r) => String(r.incidentsOpened),
            align: 'end',
          },
          {
            id: 'inc-closed',
            header: 'Incidents closed',
            cell: (r) => String(r.incidentsClosed),
            align: 'end',
          },
        ]}
        rows={weekly.weeks}
        rowKey={(r) => String(r.weekStartSeconds)}
      />
    </div>
  );
}

function WeeklyPanel(): ReactElement {
  const weekly = useSocWeekly(WEEKS_SHOWN);
  return (
    <GlassPanel ariaLabel="Weekly volume" header={<span>Weekly volume and coverage</span>}>
      {weekly.isPending ? <LoadingState label="Deriving the weeks" /> : null}
      {weekly.isError ? (
        <ErrorState
          title="The weekly volume could not be read"
          onRetry={() => void weekly.refetch()}
        />
      ) : null}
      {weekly.isSuccess && weekly.data === null ? (
        <EmptyState
          title="No weekly volume for this tenant"
          hint="The engine refused the read: nothing is shown in its place."
        />
      ) : null}
      {weekly.isSuccess && weekly.data !== null ? <WeeklyTable weekly={weekly.data} /> : null}
    </GlassPanel>
  );
}

export function ReportsSurface(): ReactElement {
  const incidents = useSocIncidents();
  const [selected, setSelected] = useState<string | null>(null);
  const report = useSocReport(selected);

  return (
    <section className="fcx-surface" aria-labelledby="surface-reports">
      <h2 id="surface-reports" className="fcx-surface__heading">
        Reports
      </h2>
      <WeeklyPanel />
      <GlassPanel ariaLabel="Incident report" header={<span>Incident report</span>}>
        {incidents.isPending ? <LoadingState label="Loading incidents" /> : null}
        {incidents.isError ? (
          <ErrorState
            title="The incident queue could not be read"
            onRetry={() => void incidents.refetch()}
          />
        ) : null}
        {incidents.isSuccess && incidents.data.length === 0 ? (
          <EmptyState
            title="No open incidents to report on"
            hint="A report is shaped from an incident's record. When the queue has an incident, pick it here."
          />
        ) : null}
        {incidents.isSuccess && incidents.data.length > 0 ? (
          <label className="fcx-reports__picker">
            Incident
            <select
              value={selected ?? ''}
              onChange={(event) =>
                setSelected(event.target.value === '' ? null : event.target.value)
              }
              data-testid="reports-picker"
            >
              <option value="">Choose an incident</option>
              {incidents.data.map((row: SocIncidentRow) => (
                <option key={row.incidentId} value={row.incidentId}>
                  {row.subject} -- {row.finding} ({row.ruleId})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {selected !== null && report.isPending ? <LoadingState label="Shaping the report" /> : null}
        {selected !== null && report.isError ? (
          <ErrorState title="The report could not be read" onRetry={() => void report.refetch()} />
        ) : null}
        {selected !== null && report.isSuccess && report.data === null ? (
          <EmptyState
            title="No report for this incident"
            hint="The engine did not serve a report: the incident is unknown to this tenant or above your clearance."
          />
        ) : null}
        {selected !== null && report.isSuccess && report.data !== null ? (
          <ReportView report={report.data} />
        ) : null}
      </GlassPanel>
    </section>
  );
}
