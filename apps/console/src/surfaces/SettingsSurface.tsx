// apps/console/src/surfaces/SettingsSurface.tsx -- the Settings tab (TRD-CONSOLE-11), Step 1 slice:
// the SOC section (IP-CONSOLE-11 S3.18 over crdb IP-AISOC-STEP1 C.9c, INV-SOC-SETTINGS-GOVERNED).
//
// TRD-CONSOLE-11 names nine tabs (HA, DR, RBAC, federation, security, keys, policy, observability,
// FIPS). Step 1 ships ONLY the SOC settings the engine binds to `console:settings/soc/*` -- the
// response tiers (crdb C.3) and the SIEM write-back (C.8) -- plus the narrative model ref read-only.
// The other tabs are absent, not placeholders (INV-CONSOLE-NO-STUB); they land with their phases.
//
// Every value shown is the engine's committed document. A commit is confirm-gated and goes to the
// engine's config store through the same validation its admin plane applies; the engine's receipt is
// rendered as it is -- accepted with its version, or refused with the engine's own violations. Under
// dual control the engine refuses the write and this surface says so up front rather than offering a
// button that cannot work.

import { useEffect, useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog, GlassPanel } from '@forge/design';
import type { SocSettings, SocSettingsPatch, SocSettingsReceipt } from '@forge/contracts';
import { CLASSIFICATION_TAGS, SIEM_VENDORS } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useCommitSocSettings, useSocSettings } from './useSettings.js';

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

export function SettingsSurface(): ReactElement {
  const settings = useSocSettings();
  return (
    <section className="fcx-surface" aria-labelledby="surface-settings">
      <h2 id="surface-settings" className="fcx-surface__heading">
        Settings
      </h2>
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
    </section>
  );
}
