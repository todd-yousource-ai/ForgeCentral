// apps/console/src/surfaces/IdamConnectorsPanel.tsx -- the External IDAM connector panel
// (IP-CONSOLE-04 ID.2 / ID.3), one component with two mounts: the Users surface's External IDAM tab
// and the Settings surface's Federation tab (IP-CONSOLE-11 ST.4a). One component and one fetch path,
// so the two mounts can never disagree about a connector.

import { useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog, type BadgeVariant } from '@forge/design';
import type { IdamConnectorState } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import {
  IDAM_FULL_SYNC_HOURS_MAX,
  IDAM_FULL_SYNC_HOURS_MIN,
  IDAM_POLL_INTERVAL_SECS_MAX,
  IDAM_POLL_INTERVAL_SECS_MIN,
  IdamConnectError,
  IdamSyncError,
  useIdamConnect,
  useIdamConnectors,
  useIdamSync,
} from './useIdam.js';

/** The connector state's badge label + color. `healthy` reads calm; anything ambiguous warns. */
function connectorStateBadge(state: IdamConnectorState): { label: string; variant: BadgeVariant } {
  switch (state) {
    case 'healthy':
      return { label: 'Connected', variant: 'good' };
    case 'never-synced':
      return { label: 'Never synced', variant: 'neutral' };
    case 'disabled':
      return { label: 'Disabled', variant: 'neutral' };
    case 'partial':
      return { label: 'Partial sync', variant: 'caution' };
    case 'unknown':
      return { label: 'Unknown', variant: 'caution' };
    case 'error':
      return { label: 'Error', variant: 'critical' };
  }
}

/** Render a last-sync time as the deterministic UTC stamp, or the honest `Never` when null. */
function formatSyncTime(lastSyncAt: number | null): string {
  if (lastSyncAt === null) {
    return 'Never';
  }
  return new Date(lastSyncAt).toISOString().replace('T', ' ').slice(0, 19);
}

/** The typed failure line the Sync Now control renders from an engine refusal. */
function syncFailure(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof IdamSyncError) {
    if (error.status === 409) return 'The connector is disabled or not configured.';
    if (error.status === 403) return 'You do not have permission to run a sync.';
    return 'The engine refused the sync.';
  }
  return 'The sync could not reach the engine.';
}

/**
 * The External IDAM tab: the LIVE connector list (ID.2) with a real `Sync Now` per connector (ID.3).
 * Every card is a projection of a real crdb connector record (IDAM_CONNECTORS, crdb IA.8). Sync Now is
 * a real audited engine command (IDAM_SYNC), confirm-gated; the engine ACKs immediately and marks the
 * sync DUE, so in-flight is driven by the card's `running` flag (polled from engine truth, never a
 * client timer) and completion shows the real object count / state / error. A refused sync renders the
 * failure; it never silently succeeds. Configure (ID.4) stays a labelled non-live control.
 */
/** The typed failure line the onboarding form renders from a connect refusal. */
function connectFailure(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof IdamConnectError) {
    if (error.status === 409) return 'The engine rejected the connectivity or the secret.';
    if (error.status === 403) return 'You do not have permission to configure connectors.';
    if (error.status === 503) return 'The secret store is not available on this node.';
    return 'The connector could not be configured.';
  }
  return 'The request could not reach the server.';
}

/**
 * The connector onboarding form (ID.4): the operator enters the connectivity AND the client secret.
 * On submit the secret is written to the node's mode-protected store via the on-node sidecar (never a
 * Console-stored value, never the engine wire), then the connectivity is applied live. The secret field
 * is WRITE-ONLY -- a configured connector shows "secret set", never the value.
 */
function IdamConnectForm({
  provider,
  domain,
  onDone,
}: {
  readonly provider: string;
  readonly domain: string;
  readonly onDone: () => void;
}): ReactElement {
  const connect = useIdamConnect();
  const [domainValue, setDomainValue] = useState(domain);
  const [clientId, setClientId] = useState('');
  const [audience, setAudience] = useState('');
  const [secret, setSecret] = useState('');
  const [pollSecs, setPollSecs] = useState(300);
  const [fullHours, setFullHours] = useState(24);
  const failure = connectFailure(connect.error);

  const submit = (): void => {
    connect.mutate(
      {
        provider,
        domain: domainValue.trim(),
        clientId: clientId.trim(),
        audience: audience.trim(),
        secret,
        pollIntervalSecs: pollSecs,
        fullSyncCadenceHours: fullHours,
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form
      className="fcx-users-create"
      aria-label={`Configure ${provider}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="fcx-filter">
        Provider Domain
        <input
          className="fcx-input"
          value={domainValue}
          onChange={(e) => setDomainValue(e.target.value)}
          placeholder="dev-xxxx.us.auth0.com"
          required
        />
      </label>
      <label className="fcx-filter">
        Client ID
        <input
          className="fcx-input"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        />
      </label>
      <label className="fcx-filter">
        Audience
        <input
          className="fcx-input"
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          placeholder="(defaults to the Management API)"
        />
      </label>
      <label className="fcx-filter">
        Client Secret
        <input
          type="password"
          className="fcx-input"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          autoComplete="off"
          required
        />
      </label>
      <label className="fcx-filter">
        Delta poll interval (seconds)
        <input
          type="number"
          className="fcx-input"
          value={pollSecs}
          min={IDAM_POLL_INTERVAL_SECS_MIN}
          max={IDAM_POLL_INTERVAL_SECS_MAX}
          onChange={(e) => setPollSecs(Number(e.target.value))}
        />
      </label>
      <label className="fcx-filter">
        Full directory sync (hours)
        <input
          type="number"
          className="fcx-input"
          value={fullHours}
          min={IDAM_FULL_SYNC_HOURS_MIN}
          max={IDAM_FULL_SYNC_HOURS_MAX}
          onChange={(e) => setFullHours(Number(e.target.value))}
        />
      </label>
      <p className="fcx-users-idam-note">
        The secret is written to this node&apos;s protected store and never leaves it; the console
        never stores it or sends it over the engine wire. Cadences are engine-bounded (poll{' '}
        {IDAM_POLL_INTERVAL_SECS_MIN}-{IDAM_POLL_INTERVAL_SECS_MAX}s, full sync{' '}
        {IDAM_FULL_SYNC_HOURS_MIN}-{IDAM_FULL_SYNC_HOURS_MAX}h).
      </p>
      <button
        type="submit"
        className="fcx-btn fcx-btn--primary"
        disabled={
          connect.isPending || domainValue.trim() === '' || clientId.trim() === '' || secret === ''
        }
      >
        {connect.isPending ? 'Configuring...' : 'Save connector'}
      </button>
      <button type="button" className="fcx-btn" onClick={onDone}>
        Cancel
      </button>
      {failure !== null ? (
        <p role="alert" className="fcx-form-error">
          {failure}
        </p>
      ) : null}
    </form>
  );
}

export function IdamConnectorsPanel(): ReactElement {
  const connectors = useIdamConnectors();
  const sync = useIdamSync();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<{ provider: string; domain: string } | null>(null);
  const failure = syncFailure(sync.error);
  const failedProvider = sync.error !== null ? (sync.variables?.provider ?? null) : null;
  return (
    <>
      <div className="fcx-surface__controls">
        <h3 className="fcx-surface__subheading">External Identity &amp; Access Management</h3>
      </div>
      {configuring !== null ? (
        <IdamConnectForm
          provider={configuring.provider}
          domain={configuring.domain}
          onDone={() => setConfiguring(null)}
        />
      ) : connectors.isLoading ? (
        <LoadingState label="Loading identity connectors" />
      ) : connectors.isError ? (
        <ErrorState
          title="Could not load identity connectors."
          onRetry={() => void connectors.refetch()}
        />
      ) : (connectors.data ?? []).length === 0 ? (
        <EmptyState
          title="No IdAM connector configured"
          hint="No external identity connector is configured on this node yet."
          action={
            <button
              type="button"
              className="fcx-btn fcx-btn--primary"
              onClick={() => setConfiguring({ provider: 'auth0', domain: '' })}
            >
              Onboard Auth0
            </button>
          }
        />
      ) : (
        <div className="fcx-users-groups-grid" role="list" aria-label="Identity connectors">
          {(connectors.data ?? []).map((c) => {
            const badge = connectorStateBadge(c.state);
            // Only this Console's own request is known to be in flight: the engine's `running` means
            // the sync loop is alive, not that a sync is running (CD-56).
            const syncingThis = sync.isPending && sync.variables?.provider === c.connectorId;
            return (
              <article key={c.connectorId} role="listitem" className="fcx-users-group-card">
                <div className="fcx-users-group-card__head">
                  <h4 className="fcx-users-group-card__name">{c.displayName}</h4>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
                <p className="fcx-users-group-card__description">
                  {c.providerTenant || 'No tenant configured'}
                </p>
                <dl className="fcx-users-idam-card__facts">
                  <div>
                    <dt>Last sync</dt>
                    <dd>{formatSyncTime(c.lastSyncAt)}</dd>
                  </div>
                  <div>
                    <dt>Objects synced</dt>
                    <dd>{c.objectsSynced}</dd>
                  </div>
                  <div>
                    <dt>Poll interval</dt>
                    <dd>{c.pollIntervalSecs}s</dd>
                  </div>
                </dl>
                {c.lastError !== null ? (
                  <p className="fcx-users-idam-card__error" role="alert">
                    {c.lastError}
                  </p>
                ) : null}
                {failure !== null && failedProvider === c.connectorId ? (
                  <p className="fcx-users-idam-card__error" role="alert">
                    {failure}
                  </p>
                ) : null}
                <div className="fcx-users-group-card__actions">
                  <button
                    type="button"
                    className="fcx-btn"
                    disabled={syncingThis}
                    onClick={() => setConfirming(c.connectorId)}
                  >
                    {syncingThis ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    type="button"
                    className="fcx-btn"
                    onClick={() =>
                      setConfiguring({ provider: c.connectorId, domain: c.providerTenant })
                    }
                  >
                    Configure
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming !== null ? `Run a federation sync for ${confirming}?` : ''}
        description="This queues a full directory sync against the provider; it starts on the connector's next poll. The engine writes no audit record for it."
        confirmLabel="Sync"
        onConfirm={() => {
          if (confirming !== null) {
            sync.mutate({ provider: confirming });
          }
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
