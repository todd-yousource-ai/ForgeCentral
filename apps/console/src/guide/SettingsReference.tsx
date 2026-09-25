// apps/console/src/guide/SettingsReference.tsx -- the guide's Settings reference, live (GD.2).
//
// TRD-CONSOLE-11 11.4: engine-owned facts (a setting's value, default, bound, apply class and whether
// the Console can change it) render from the engine's SETTINGS_READ at view time, never from the
// document's snapshot. Appendix A keeps its grouping and headings; each of its tables is filled from
// the one live read. A refused read shows the tier-refusal state and a failed read the error state with
// Retry; the rest of the guide still renders (11.7).

import type { ReactElement } from 'react';
import { DataTable } from '@forge/design';
import { isKeyEditable, settingApplyClass, type SettingRow } from '@forge/contracts';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SettingsView } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';

/** The Applies vocabulary of the guide (Appendix A's "Reading this appendix"). */
function applies(row: SettingRow): string {
  switch (settingApplyClass(row)) {
    case 'live':
      return 'Live';
    case 'boot-bound':
      return 'Restart';
    case 'pending':
      return 'Not active';
    case 'fixed':
      return 'Host';
  }
}

/** Where ForgeCentral changes it: the Configuration table, a section form, or nowhere. */
function inConsole(row: SettingRow): string {
  if (isKeyEditable(row)) return 'Edit';
  if (row.editable) return 'Form';
  return 'Read-only';
}

type ReferenceRow = { readonly key: string; readonly row: SettingRow | undefined };

function ReferenceTable({
  rows,
  caption,
}: {
  readonly rows: readonly ReferenceRow[];
  readonly caption: string;
}): ReactElement {
  return (
    <DataTable<ReferenceRow>
      caption={caption}
      columns={[
        { id: 'key', header: 'Setting', cell: (r) => <code>{r.key}</code> },
        {
          id: 'controls',
          header: 'What it controls',
          cell: (r) => r.row?.summary ?? 'Not reported by this engine.',
        },
        {
          id: 'value',
          header: 'On this node',
          cell: (r) =>
            r.row === undefined ? (
              ''
            ) : r.row.value === null ? (
              'host setting'
            ) : (
              <code>{r.row.value}</code>
            ),
        },
        { id: 'default', header: 'Default', cell: (r) => r.row?.defaultValue ?? '' },
        { id: 'accepts', header: 'Accepts', cell: (r) => r.row?.bound ?? '' },
        {
          id: 'applies',
          header: 'Applies',
          cell: (r) => (r.row === undefined ? '' : applies(r.row)),
        },
        {
          id: 'console',
          header: 'In ForgeCentral',
          cell: (r) => (r.row === undefined ? '' : inConsole(r.row)),
        },
      ]}
      rows={rows}
      rowKey={(r) => r.key}
    />
  );
}

/** The live state of the one SETTINGS_READ behind every reference table. */
export function SettingsReferenceTable({
  read,
  keys,
  caption,
}: {
  readonly read: UseQueryResult<SettingsView | null>;
  readonly keys: readonly string[];
  readonly caption: string;
}): ReactElement {
  if (read.isPending) return <LoadingState label="Reading the settings from the engine" />;
  if (read.isError) {
    return (
      <ErrorState title="The settings could not be read" onRetry={() => void read.refetch()} />
    );
  }
  if (read.data === null) {
    return (
      <EmptyState
        title="Admin or SecurityAudit tier required"
        hint="The engine serves the governed configuration to Admin and SecurityAudit operators only; the reference values are not shown in its place."
      />
    );
  }
  const byKey = new Map(read.data.rows.map((row) => [row.key, row]));
  return (
    <ReferenceTable caption={caption} rows={keys.map((key) => ({ key, row: byKey.get(key) }))} />
  );
}

/** Settings the engine serves that the document does not list: shown, never hidden. */
export function UnlistedSettings({
  read,
  listed,
}: {
  readonly read: UseQueryResult<SettingsView | null>;
  readonly listed: readonly string[];
}): ReactElement | null {
  if (!read.isSuccess || read.data === null) return null;
  const known = new Set(listed);
  const extra = read.data.rows.filter((row) => !known.has(row.key));
  if (extra.length === 0) return null;
  return (
    <section aria-label="Other settings" data-testid="guide-unlisted-settings">
      <h2 id="ref-unlisted">Other settings this engine reports</h2>
      <ReferenceTable
        caption="Settings this guide does not list yet"
        rows={extra.map((row) => ({ key: row.key, row }))}
      />
    </section>
  );
}
