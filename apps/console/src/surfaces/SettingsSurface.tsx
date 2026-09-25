// apps/console/src/surfaces/SettingsSurface.tsx -- the Settings tab (TRD-CONSOLE-11), Step 1 slice:
// the SOC section (IP-CONSOLE-11 S3.18 over crdb IP-AISOC-STEP1 C.9c, INV-SOC-SETTINGS-GOVERNED).
//
// TRD-CONSOLE-11 Section 9 (amended 2026-09-24) sets the tab set against the engine's real admin
// surface. A tab is present only when its engine binding is live (INV-CONSOLE-NO-STUB); the others
// land with their IP-CONSOLE-11 rows. Live now: SOC (S3.18, crdb C.9c) and Configuration (ST.1 read,
// crdb SET.1; ST.2a knob edits, crdb SET.2; ST.2b section forms, crdb SET.2b).
//
// Every value shown is the engine's committed document. A commit is confirm-gated and goes to the
// engine's config store through the same validation its admin plane applies; the engine's receipt is
// rendered as it is -- accepted with its version, or refused with the engine's own violations. Under
// dual control the engine refuses the write and this surface says so up front rather than offering a
// button that cannot work.

import { Suspense, lazy, useEffect, useState, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Badge, ConfirmDialog, DataTable, GlassPanel, TabStrip } from '@forge/design';
import type {
  SettingRow,
  SettingsView,
  SocSettings,
  SocSettingsPatch,
  SocSettingsReceipt,
} from '@forge/contracts';
import {
  CLASSIFICATION_TAGS,
  SIEM_VENDORS,
  isKeyEditable,
  settingApplyClass,
  settingSourceLabel,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { ChangeReceipt, SectionForms } from './SettingsSectionForms.js';
import { ChangesTab } from './SettingsChangesTab.js';
import { FederationTab, RbacTab } from './SettingsIdentityTabs.js';
import {
  FipsTab,
  KeyLockTab,
  ObservabilityTab,
  SecurityTab,
  TopologyTab,
} from './SettingsReportTabs.js';
import {
  useCommitSocSettings,
  useGovernedChange,
  useGovernedSettings,
  useSocSettings,
} from './useSettings.js';

function receiptLine(receipt: SocSettingsReceipt): string {
  if (!receipt.refused) {
    return `Committed at version ${String(receipt.version)}`;
  }
  if (receipt.dualControlRequired) {
    return 'Refused: tenant-config is under dual control. Propose and approve on the admin plane.';
  }
  return receipt.explanation === null ? 'Refused by the engine' : `Refused: ${receipt.explanation}`;
}

function Receipt({ receipt }: { readonly receipt: SocSettingsReceipt }): ReactElement {
  return (
    <div className="fcx-settings__receipt" data-testid="settings-receipt">
      <Badge variant={receipt.refused ? 'caution' : 'good'}>
        {receipt.refused ? 'Refused' : 'Committed'}
      </Badge>{' '}
      {receiptLine(receipt)}
      {receipt.violations.length > 0 ? (
        <ul className="fcx-settings__violations" data-testid="settings-violations">
          {receipt.violations.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SocSection({ settings }: { readonly settings: SocSettings }): ReactElement {
  const commit = useCommitSocSettings();
  const [pLow, setPLow] = useState(String(settings.tiers.pLowMilli));
  const [pHigh, setPHigh] = useState(String(settings.tiers.pHighMilli));
  const [siem, setSiem] = useState({ ...settings.siemWriteback });
  const [pending, setPending] = useState<SocSettingsPatch | null>(null);
  // A fresh read (after a commit, or another operator's) resets the drafts to what is committed.
  useEffect(() => {
    setPLow(String(settings.tiers.pLowMilli));
    setPHigh(String(settings.tiers.pHighMilli));
    setSiem({ ...settings.siemWriteback });
  }, [settings]);

  const locked = settings.dualControlRequired;
  const tiersPatch = (): SocSettingsPatch => ({
    tiers: { pLowMilli: Number.parseInt(pLow, 10), pHighMilli: Number.parseInt(pHigh, 10) },
  });
  const siemPatch = (): SocSettingsPatch => ({ siemWriteback: { ...siem } });
  const tiersValid = Number.isInteger(Number(pLow)) && Number.isInteger(Number(pHigh));

  return (
    <div data-testid="settings-soc">
      <p className="fcx-settings__model" data-testid="settings-model-ref">
        Narrative model:{' '}
        {settings.narrativeModelRef === null ? (
          <span>none bound (verdict narratives serve the declared template)</span>
        ) : (
          <code>{settings.narrativeModelRef}</code>
        )}
        {' -- committed at version '}
        {String(settings.version)}
      </p>
      {locked ? (
        <p className="fcx-settings__notice" data-testid="settings-dual-control">
          <Badge variant="caution">Dual control</Badge> The committed governance places
          tenant-config under dual control. The Console reads these settings but cannot commit them:
          propose and approve on the admin plane.
        </p>
      ) : null}

      <form
        className="fcx-settings__form"
        aria-label="Response tiers"
        onSubmit={(event) => {
          event.preventDefault();
          if (tiersValid) {
            setPending(tiersPatch());
          }
        }}
      >
        <h3 className="fcx-reports__heading">Response tiers</h3>
        <p className="fcx-settings__hint">
          The calibrated probability bars (milli, 0 to 1000). Below p_low a firing is noise; at or
          above p_high the response is proposed whole; between, the engine investigates and
          withholds containment. Ships at 0 / 1000 until the curve is measured.
        </p>
        <label>
          p_low (milli)
          <input
            type="number"
            min={0}
            max={1000}
            value={pLow}
            disabled={locked}
            onChange={(e) => setPLow(e.target.value)}
            data-testid="settings-p-low"
          />
        </label>
        <label>
          p_high (milli)
          <input
            type="number"
            min={0}
            max={1000}
            value={pHigh}
            disabled={locked}
            onChange={(e) => setPHigh(e.target.value)}
            data-testid="settings-p-high"
          />
        </label>
        <button type="submit" className="fcx-btn" disabled={locked || !tiersValid}>
          Commit tiers
        </button>
      </form>

      <form
        className="fcx-settings__form"
        aria-label="SIEM write-back"
        onSubmit={(event) => {
          event.preventDefault();
          setPending(siemPatch());
        }}
      >
        <h3 className="fcx-reports__heading">SIEM enrichment write-back</h3>
        <p className="fcx-settings__hint">
          Whether the incident enrichment row is written, to which vendor and stream, the Console
          case URL base the row links back to, and the classification ceiling an incident may not
          exceed. The credential reference stays in the node&apos;s boot configuration.
        </p>
        <label>
          <input
            type="checkbox"
            checked={siem.enabled}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, enabled: e.target.checked })}
            data-testid="settings-siem-enabled"
          />{' '}
          Enabled
        </label>
        <label>
          Vendor
          <select
            value={siem.vendor}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, vendor: e.target.value as typeof siem.vendor })}
            data-testid="settings-siem-vendor"
          >
            {SIEM_VENDORS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Host
          <input
            type="text"
            value={siem.host}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, host: e.target.value })}
            data-testid="settings-siem-host"
          />
        </label>
        <label>
          Stream
          <input
            type="text"
            value={siem.stream}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, stream: e.target.value })}
            data-testid="settings-siem-stream"
          />
        </label>
        <label>
          Case URL base
          <input
            type="text"
            value={siem.caseUrlBase}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, caseUrlBase: e.target.value })}
            data-testid="settings-siem-case-url"
          />
        </label>
        <label>
          Ceiling
          <select
            value={siem.ceiling}
            disabled={locked}
            onChange={(e) => setSiem({ ...siem, ceiling: e.target.value as typeof siem.ceiling })}
            data-testid="settings-siem-ceiling"
          >
            {CLASSIFICATION_TAGS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="fcx-btn" disabled={locked}>
          Commit write-back
        </button>
      </form>

      {commit.isPending ? <LoadingState label="Committing" /> : null}
      {commit.isError ? (
        <ErrorState title="The commit could not be sent" onRetry={() => commit.reset()} />
      ) : null}
      {commit.isSuccess ? <Receipt receipt={commit.data} /> : null}

      <section className="fcx-settings__registry" aria-label="Setting definitions">
        <h3 className="fcx-reports__heading">What these settings are</h3>
        <ul>
          {settings.registry.map((row) => (
            <li key={row.key}>
              <code>{row.key}</code> -- {row.summary} Bound: {row.bound}. Applies: {row.liveApply}.
            </li>
          ))}
        </ul>
      </section>

      <ConfirmDialog
        open={pending !== null}
        title="Commit these SOC settings?"
        description="The engine validates the candidate and commits it to the governed configuration under your principal. The change applies live."
        confirmLabel="Commit"
        tone="critical"
        onConfirm={() => {
          if (pending !== null) {
            commit.mutate(pending);
          }
          setPending(null);
        }}
        onCancel={() => {
          setPending(null);
        }}
      />
    </div>
  );
}

/** The apply class in the operator's words; a non-live setting says why it has no edit control. */
function applyLabel(row: SettingRow): string {
  switch (settingApplyClass(row)) {
    case 'live':
      return 'live';
    case 'boot-bound':
      return 'boot-bound: changes need a restart';
    case 'pending':
      return 'pending: no live consumer yet';
    case 'fixed':
      return 'fixed at boot';
  }
}

function ConfigurationTable({ view }: { readonly view: SettingsView }): ReactElement {
  const surfaces = view.surfaces.filter((s) => view.rows.some((r) => r.surface === s));
  const [surface, setSurface] = useState(surfaces[0] ?? '');
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);
  const [staged, setStaged] = useState<Readonly<Record<string, string>>>({});
  const [confirming, setConfirming] = useState(false);
  // Under dual control every change is a PROPOSAL a different Admin approves (ST.9, crdb SET.3).
  const propose = view.dualControlRequired;
  const commit = useGovernedChange(propose);
  const rows = view.rows.filter((r) => r.surface === surface);
  const byKey = new Map(view.rows.map((r) => [r.key, r]));
  const stagedKeys = Object.keys(staged);
  const changeCell = (r: SettingRow): ReactElement => {
    if (!isKeyEditable(r)) {
      return <span>read-only</span>;
    }
    if (editing?.key === r.key) {
      return (
        <span className="fcx-settings__edit">
          <input
            type="text"
            aria-label={`New value for ${r.key}`}
            value={editing.value}
            onChange={(e) => setEditing({ key: r.key, value: e.target.value })}
          />
          <button
            type="button"
            className="fcx-btn"
            onClick={() => {
              setStaged({ ...staged, [r.key]: editing.value });
              setEditing(null);
            }}
          >
            Stage
          </button>
          <button type="button" className="fcx-btn" onClick={() => setEditing(null)}>
            Cancel
          </button>
        </span>
      );
    }
    return (
      <button
        type="button"
        className="fcx-btn"
        aria-label={`Edit ${r.key}`}
        onClick={() => setEditing({ key: r.key, value: staged[r.key] ?? r.value ?? '' })}
      >
        {staged[r.key] === undefined ? 'Edit' : `Staged: ${staged[r.key] ?? ''}`}
      </button>
    );
  };

  return (
    <div data-testid="settings-configuration">
      <p className="fcx-settings__model" data-testid="settings-configuration-version">
        {view.version === 0
          ? 'Nothing is committed: every value is the fail-closed default.'
          : `Committed configuration at version ${String(view.version)}.`}
        {propose
          ? ' Tenant-config is under dual control: every change here is a proposal a different Admin approves on the Changes tab.'
          : ''}
      </p>
      <label className="fcx-reports__picker">
        Surface
        <select
          value={surface}
          onChange={(e) => setSurface(e.target.value)}
          data-testid="settings-surface-picker"
        >
          {surfaces.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <DataTable<SettingRow>
        caption={`The ${surface} settings as the engine renders them`}
        columns={[
          { id: 'key', header: 'Setting', cell: (r) => <code>{r.key}</code> },
          {
            id: 'value',
            header: 'Value',
            cell: (r) =>
              r.value === null ? (
                <span>not in the committed document</span>
              ) : (
                <code>{r.value}</code>
              ),
          },
          { id: 'source', header: 'Source', cell: (r) => settingSourceLabel(r, view.version) },
          { id: 'applies', header: 'Applies', cell: applyLabel },
          { id: 'change', header: 'Change', cell: changeCell },
          {
            id: 'definition',
            header: 'Definition',
            cell: (r) => `${r.summary} Bound: ${r.bound}.`,
          },
        ]}
        rows={rows}
        rowKey={(r) => r.key}
      />
      {stagedKeys.length > 0 ? (
        <div className="fcx-settings__staged" data-testid="settings-configuration-staged">
          <p>
            {String(stagedKeys.length)} staged change{stagedKeys.length === 1 ? '' : 's'}; the
            engine applies them together or not at all.
          </p>
          <button type="button" className="fcx-btn" onClick={() => setConfirming(true)}>
            {propose ? 'Propose' : 'Commit'} {String(stagedKeys.length)} change
            {stagedKeys.length === 1 ? '' : 's'}
          </button>{' '}
          <button type="button" className="fcx-btn" onClick={() => setStaged({})}>
            Discard staged
          </button>
        </div>
      ) : null}
      {commit.isPending ? <LoadingState label={propose ? 'Proposing' : 'Committing'} /> : null}
      {commit.isError ? (
        <ErrorState title="The change could not be sent" onRetry={() => commit.reset()} />
      ) : null}
      {commit.isSuccess ? <ChangeReceipt result={commit.data} /> : null}
      <ConfirmDialog
        open={confirming}
        title={propose ? 'Propose these settings?' : 'Commit these settings?'}
        description={stagedKeys
          .map((k) => `${k}: ${byKey.get(k)?.value ?? '(unset)'} -> ${staged[k] ?? ''}`)
          .join('; ')
          .concat(
            propose
              ? '. Tenant-config is under dual control: the engine validates the batch and records it as a proposal a different Admin must approve.'
              : '. The engine validates the batch and commits it under your principal.',
          )}
        confirmLabel={propose ? 'Propose' : 'Commit'}
        tone="critical"
        onConfirm={() => {
          commit.mutate(
            { edits: stagedKeys.map((key) => ({ key, value: staged[key] ?? '' })) },
            {
              onSuccess: (result) => {
                if (!result.receipt.refused) {
                  setStaged({});
                }
              },
            },
          );
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
      <SectionForms view={view} />
    </div>
  );
}

function ConfigurationTab(): ReactElement {
  const governed = useGovernedSettings(true);
  return (
    <GlassPanel ariaLabel="Configuration" header={<span>Configuration</span>}>
      {governed.isPending ? <LoadingState label="Reading the committed configuration" /> : null}
      {governed.isError ? (
        <ErrorState
          title="The configuration could not be read"
          onRetry={() => void governed.refetch()}
        />
      ) : null}
      {governed.isSuccess && governed.data === null ? (
        <EmptyState
          title="Admin or SecurityAudit tier required"
          hint="The engine serves the governed configuration to Admin and SecurityAudit operators only."
        />
      ) : null}
      {governed.isSuccess && governed.data !== null ? (
        <ConfigurationTable view={governed.data} />
      ) : null}
    </GlassPanel>
  );
}

function SocTab(): ReactElement {
  const settings = useSocSettings();
  return (
    <GlassPanel ariaLabel="SOC settings" header={<span>SOC</span>}>
      {settings.isPending ? <LoadingState label="Reading the committed settings" /> : null}
      {settings.isError ? (
        <ErrorState
          title="The settings could not be read"
          onRetry={() => void settings.refetch()}
        />
      ) : null}
      {settings.isSuccess && settings.data === null ? (
        <EmptyState
          title="Admin or SecurityAudit tier required"
          hint="The engine serves these settings to Admin and SecurityAudit operators only; nothing is shown in their place."
        />
      ) : null}
      {settings.isSuccess && settings.data !== null ? (
        <SocSection settings={settings.data} />
      ) : null}
    </GlassPanel>
  );
}

// The ReadMe (IP-CONSOLE-11-guide GD.2) is its own chunk: the guide's content loads only when opened.
const ReadmeTab = lazy(() => import('../guide/ReadmeTab.js'));

/** The tabs whose engine bindings are live (TRD-CONSOLE-11 Section 9.2); the rest are absent. */
const SETTINGS_TABS = [
  { id: 'soc', label: 'SOC' },
  { id: 'configuration', label: 'Configuration' },
  { id: 'rbac', label: 'RBAC' },
  { id: 'federation', label: 'Federation' },
  { id: 'changes', label: 'Changes' },
  { id: 'security', label: 'Security' },
  { id: 'keylock', label: 'KeyLock' },
  { id: 'observability', label: 'Observability' },
  { id: 'topology', label: 'HA & Topology' },
  { id: 'fips', label: 'FIPS Mode' },
  { id: 'readme', label: 'ReadMe' },
] as const;

const TAB_IDS: ReadonlySet<string> = new Set(SETTINGS_TABS.map((t) => t.id));

export function SettingsSurface(): ReactElement {
  // The active tab lives in the URL (`?tab=`), so a tab (and the ReadMe's section hash) survives a
  // reload and can be linked to (INV-GUIDE-ADDRESSABLE). An unknown value falls back to SOC.
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') ?? 'soc';
  const tab = TAB_IDS.has(requested) ? requested : 'soc';
  const setTab = (id: string): void => setParams({ tab: id });
  return (
    <section className="fcx-surface" aria-labelledby="surface-settings">
      <h2 id="surface-settings" className="fcx-surface__heading">
        Settings
      </h2>
      <TabStrip tabs={[...SETTINGS_TABS]} activeId={tab} onChange={setTab} ariaLabel="Settings" />
      {tab === 'configuration' ? (
        <ConfigurationTab />
      ) : tab === 'rbac' ? (
        <RbacTab />
      ) : tab === 'federation' ? (
        <FederationTab />
      ) : tab === 'changes' ? (
        <ChangesTab />
      ) : tab === 'security' ? (
        <SecurityTab />
      ) : tab === 'keylock' ? (
        <KeyLockTab />
      ) : tab === 'observability' ? (
        <ObservabilityTab />
      ) : tab === 'topology' ? (
        <TopologyTab />
      ) : tab === 'fips' ? (
        <FipsTab />
      ) : tab === 'readme' ? (
        <Suspense fallback={<LoadingState label="Opening the guide" />}>
          <ReadmeTab />
        </Suspense>
      ) : (
        <SocTab />
      )}
    </section>
  );
}
