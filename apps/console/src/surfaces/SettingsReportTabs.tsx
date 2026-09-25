// apps/console/src/surfaces/SettingsReportTabs.tsx -- the Settings tabs that read the admin plane's
// status reports (IP-CONSOLE-11 ST.5 / ST.6 / ST.8a / ST.10 over crdb IP-CONSOLE-SETTINGS-WIRE SET.4).
//
// Every value is one the engine's admin plane computed with the same executor `cdb-actl` reads
// (INV-SETTINGS-SOURCE-LABELLED: each panel names its report). Every tab is read-only. A control the
// engine has no verb for is ABSENT, and the absence is stated with the owning engine work
// (INV-SETTINGS-NO-IMPOSSIBLE-CONTROL). A node without an admin endpoint shows that, never defaults.

import type { ReactElement, ReactNode } from 'react';
import { Badge, DataTable, GlassPanel } from '@forge/design';
import {
  sessionGroupLabel,
  settingApplyClass,
  type SettingRow,
  type SettingsReportName,
  type SettingsReportsView,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useGovernedSettings, useSecuritySession, useSettingsReports } from './useSettings.js';
import { TierRequired } from './TierRequired.js';
import { GuideLink } from '../guide/GuideLink.js';

interface Fact {
  readonly label: string;
  readonly value: ReactNode;
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

/** One report as a two-column fact table, captioned with the report it came from. */
function Facts({ caption, facts }: { readonly caption: string; readonly facts: readonly Fact[] }) {
  return (
    <DataTable<Fact>
      caption={caption}
      columns={[
        { id: 'label', header: 'Fact', cell: (f) => f.label },
        { id: 'value', header: 'Value', cell: (f) => f.value },
      ]}
      rows={facts}
      rowKey={(f) => f.label}
    />
  );
}

/**
 * A control or value the engine does not serve yet, stated with the engine work that owns it and a link
 * to the guide section that explains it (INV-GUIDE-DISABLED-EXPLAINED).
 */
function Pending({
  what,
  owner,
  section,
}: {
  readonly what: string;
  readonly owner: string;
  readonly section: string;
}): ReactElement {
  return (
    <p className="fcx-settings__hint">
      <Badge variant="neutral">Not available</Badge> {what} The engine has no verb or read for it
      yet: {owner}. <GuideLink section={section}>More in the guide</GuideLink>
    </p>
  );
}

/** Reads the named reports; the loading, error, tier-below and no-admin-plane states. */
function WithReports({
  names,
  children,
}: {
  readonly names: readonly SettingsReportName[];
  readonly children: (reports: SettingsReportsView) => ReactElement;
}): ReactElement {
  const reports = useSettingsReports(names);
  if (reports.isPending) {
    return <LoadingState label="Reading the admin plane reports" />;
  }
  if (reports.isError) {
    return (
      <ErrorState
        title="The admin plane reports could not be read"
        onRetry={() => void reports.refetch()}
      />
    );
  }
  if (reports.data === null) {
    return <TierRequired what="its admin plane reports" />;
  }
  if (!reports.data.adminPlane) {
    return (
      <EmptyState
        title="This node runs no admin endpoint"
        hint="The reports come from the engine's admin plane, which is not enabled on this node; nothing is shown in their place."
      />
    );
  }
  return children(reports.data);
}

/**
 * This operator's own admin session (ST.5b): the key exchange the crypto sidecar recorded for the TLS
 * tunnel this request arrived on. The browser asserts nothing; the BFF asks the sidecar by the
 * request's loopback source port.
 */
function SessionKx(): ReactElement {
  const session = useSecuritySession();
  if (session.isPending) {
    return <LoadingState label="Reading this session's key exchange" />;
  }
  if (session.isError) {
    return (
      <ErrorState
        title="This session's key exchange could not be read"
        onRetry={() => void session.refetch()}
      />
    );
  }
  const kx = session.data;
  if (kx.status === 'unconfigured') {
    return (
      <Pending
        section="posture-security"
        what="The key exchange negotiated for this browser session is not shown on this install."
        owner="the Console sidecar's session lookup is not provisioned (re-run the Console installer)"
      />
    );
  }
  if (kx.status === 'not-tunnelled') {
    return (
      <p className="fcx-settings__hint">
        This request did not arrive through the admin TLS terminator, so there is no admin-plane
        session to describe.
      </p>
    );
  }
  return (
    <Facts
      caption="This browser session (the Console sidecar's admin TLS terminator)"
      facts={[
        {
          label: 'Key exchange negotiated',
          value: (
            <Badge variant={kx.group === 'X25519MLKEM768' ? 'good' : 'caution'}>
              {sessionGroupLabel(kx.group)}
            </Badge>
          ),
        },
      ]}
    />
  );
}

/** The Security tab (ST.5): connectivity + security reports, egress destinations, this session. */
export function SecurityTab(): ReactElement {
  return (
    <GlassPanel ariaLabel="Security" header={<span>Security</span>}>
      <WithReports names={['connectivity', 'security', 'egress']}>
        {(r) => (
          <>
            {r.connectivity === null ? null : (
              <Facts
                caption="Admin endpoint (the engine connectivity report)"
                facts={[
                  { label: 'Listen address', value: <code>{r.connectivity.listenAddr}</code> },
                  { label: 'Mutual TLS required', value: yesNo(r.connectivity.mutualTls) },
                  { label: 'Admin identities bound', value: r.connectivity.identitiesBound },
                  {
                    label: 'Post-quantum hybrid key exchange',
                    value: r.connectivity.postQuantumKx ? 'Offered' : 'Not offered',
                  },
                ]}
              />
            )}
            {r.security === null ? null : (
              <Facts
                caption="Server security (the engine security report)"
                facts={[
                  { label: 'Operating classification', value: r.security.classification },
                  {
                    label: 'Audit chain',
                    value: r.security.auditChainVerified ? (
                      <Badge variant="good">Verified</Badge>
                    ) : (
                      <Badge variant="critical">Failed verification</Badge>
                    ),
                  },
                  { label: 'Audit entries', value: r.security.auditEntries },
                  { label: 'Audit head version', value: r.security.auditHeadVersion },
                  { label: 'Artifacts spot-checked', value: r.security.artifactsSpotChecked },
                  { label: 'Spot-check failures', value: r.security.artifactSpotFailures },
                  { label: 'Template-era artifacts', value: r.security.templateArtifacts },
                ]}
              />
            )}
            {r.egress === null ? null : (
              <DataTable<{ readonly id: string; readonly ceiling: string }>
                caption="Registered egress destinations (the engine egress report)"
                columns={[
                  { id: 'id', header: 'Destination', cell: (e) => <code>{e.id}</code> },
                  { id: 'ceiling', header: 'Classification ceiling', cell: (e) => e.ceiling },
                ]}
                rows={r.egress}
                rowKey={(e) => e.id}
                empty={<span>No egress destination is registered.</span>}
              />
            )}
            <p className="fcx-settings__hint">
              Egress destinations and the key-issuing section are edited on the Configuration tab.
            </p>
            <SessionKx />
          </>
        )}
      </WithReports>
    </GlassPanel>
  );
}

function formatDuration(secs: number): string {
  if (secs % 86_400 === 0) return `${String(secs / 86_400)} d`;
  if (secs % 3_600 === 0) return `${String(secs / 3_600)} h`;
  return `${String(secs)} s`;
}

/** The KeyLock tab (ST.6): the key-issuing exposure; rotation stated pending. */
export function KeyLockTab(): ReactElement {
  return (
    <GlassPanel ariaLabel="KeyLock" header={<span>KeyLock</span>}>
      <WithReports names={['key_issuing']}>
        {(r) => (
          <>
            {r.keyIssuing === null ? null : (
              <Facts
                caption="Agent key issuing (the engine key-issuing report)"
                facts={[
                  { label: 'Key issuing enabled', value: yesNo(r.keyIssuing.enabled) },
                  {
                    label: 'Dual control for enroll, issue, rotate and revoke',
                    value: yesNo(r.keyIssuing.dualControlRequired),
                  },
                  {
                    label: 'Issued-key validity',
                    value: formatDuration(r.keyIssuing.keyValiditySecs),
                  },
                ]}
              />
            )}
            <Pending
              section="posture-keylock"
              what="Signing-key rotation and the signing key ids the audit chain names are not shown, and there is no Rotate control."
              owner="TRD-04 signing-key rotation as an admin verb (crdb IP-CONSOLE-SETTINGS-WIRE SET.6c)"
            />
          </>
        )}
      </WithReports>
    </GlassPanel>
  );
}

/** The engine's observability knobs, read from the governed settings; edited on Configuration. */
function ObservabilityKnobs(): ReactElement | null {
  const governed = useGovernedSettings(true);
  if (!governed.isSuccess || governed.data === null) {
    return null;
  }
  const rows = governed.data.rows.filter((r) => r.surface === 'observability');
  return (
    <DataTable<SettingRow>
      caption="Observability settings (committed configuration; edit on the Configuration tab)"
      columns={[
        { id: 'key', header: 'Setting', cell: (r) => <code>{r.key}</code> },
        { id: 'value', header: 'Value', cell: (r) => r.value ?? 'not in the committed document' },
        { id: 'apply', header: 'Applies', cell: (r) => settingApplyClass(r) },
      ]}
      rows={rows}
      rowKey={(r) => r.key}
      empty={<span>The engine registers no observability setting.</span>}
    />
  );
}

/** The Observability tab (ST.8): the telemetry report and the observability knobs. */
export function ObservabilityTab(): ReactElement {
  return (
    <GlassPanel ariaLabel="Observability" header={<span>Observability</span>}>
      <WithReports names={['telemetry']}>
        {(r) =>
          r.telemetry === null ? (
            <></>
          ) : (
            <Facts
              caption="Telemetry ingest (the engine telemetry report)"
              facts={[
                { label: 'OTLP receiver running', value: yesNo(r.telemetry.enabled) },
                { label: 'gRPC address', value: <code>{r.telemetry.grpcAddr}</code> },
                { label: 'HTTP address', value: <code>{r.telemetry.httpAddr}</code> },
                { label: 'Ingest queue capacity', value: r.telemetry.queueCapacity },
                { label: 'Tenants bound', value: r.telemetry.tenantsBound },
              ]}
            />
          )
        }
      </WithReports>
      <ObservabilityKnobs />
      <Pending
        section="posture-observability"
        what="The telemetry exporter configuration is set at boot and is not shown or editable here."
        owner="a runtime exporter configuration (crdb IP-CONSOLE-SETTINGS-WIRE SET.6d)"
      />
    </GlassPanel>
  );
}

/** The HA & Topology tab (ST.10): this node's server report; cluster controls stated pending. */
export function TopologyTab(): ReactElement {
  return (
    <GlassPanel ariaLabel="HA and topology" header={<span>HA &amp; Topology</span>}>
      <WithReports names={['server']}>
        {(r) =>
          r.server === null ? (
            <></>
          ) : (
            <Facts
              caption="This node (the engine server report)"
              facts={[
                { label: 'Shards hosted', value: r.server.shards },
                { label: 'Serving', value: yesNo(r.server.serving) },
                { label: 'Durable storage', value: yesNo(r.server.durable) },
                {
                  label: 'Maintenance',
                  value: r.server.maintenanceEnabled
                    ? `every ${formatDuration(r.server.maintenanceCadenceSecs)}`
                    : 'off',
                },
                { label: 'Admin frame ceiling (bytes)', value: r.server.maxPayload },
                { label: 'Engine version', value: <code>{r.server.version}</code> },
              ]}
            />
          )
        }
      </WithReports>
      <Pending
        section="posture-ha"
        what="The cluster leader, per-node lag, Rotate Leadership and Test Quorum Loss are not available; the configured regions and shard placement are boot configuration the engine does not serve."
        owner="TRD-07 cluster status and leadership as admin verbs (crdb IP-CONSOLE-SETTINGS-WIRE SET.6a)"
      />
    </GlassPanel>
  );
}

/** The FIPS Mode tab (ST.10): the build posture; no toggle exists by construction. */
export function FipsTab(): ReactElement {
  return (
    <GlassPanel ariaLabel="FIPS mode" header={<span>FIPS Mode</span>}>
      <WithReports names={['connectivity']}>
        {(r) =>
          r.connectivity === null ? (
            <></>
          ) : (
            <>
              <Facts
                caption="Crypto build posture (the engine connectivity report)"
                facts={[
                  { label: 'Crypto provider', value: <code>{r.connectivity.cryptoProvider}</code> },
                  {
                    label: 'FIPS-validated module linked',
                    value: r.connectivity.fipsModule ? (
                      <Badge variant="good">Yes</Badge>
                    ) : (
                      <Badge variant="caution">No</Badge>
                    ),
                  },
                ]}
              />
              <p className="fcx-settings__hint">
                FIPS mode is chosen when the engine is built (its <code>fips</code> feature links
                the FIPS-validated AWS-LC module). It cannot be switched on a running node, so this
                tab has no toggle.
              </p>
            </>
          )
        }
      </WithReports>
    </GlassPanel>
  );
}
