// apps/console/src/surfaces/UsersSurface.tsx -- the Users and Identity surface (IP-CONSOLE-04 UY.2).
//
// The All Users table over the real engine directory: the TRD-35 LUG principals (observed device
// accounts + operator-provisioned enterprise records) merged with the AIG agent cross-bind -- every
// actor the engine authorizes, one row shape, no trust column anywhere (operator ruling
// 2026-07-21; Origin replaces the mock's deleted Override). The Groups and External IDAM tabs are
// in-surface placeholders until UY.3/UY.4 land them.
//
// HONESTY RULES (INV-CONSOLE-USERS-REAL):
//   * Every row comes from the BFF's engine merge; the surface fabricates nothing.
//   * The directory read is bounded AND complete (the engine refuses rather than truncates), so the
//     search/type/status/origin controls narrow a COMPLETE dataset client-side.
//   * Remote/Compliance have no engine substrate yet: their columns render `--`, never a guess.
//   * An empty tenant renders the honest empty state; a failed read renders the error state.

import { useMemo, useState, type ReactElement } from 'react';
import {
  Badge,
  ConfirmDialog,
  DataTable,
  TabStrip,
  type BadgeVariant,
  type DataTableColumn,
} from '@forge/design';
import type {
  IdamConnectorState,
  PrincipalDraft,
  PrincipalKind,
  PrincipalOrigin,
  PrincipalRow,
  PrincipalStatus,
} from '@forge/contracts';
import { PRINCIPAL_KINDS, PRINCIPAL_ORIGINS, PRINCIPAL_STATUSES } from '@forge/contracts';

import { principalId } from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import {
  IdamConnectError,
  IdamSyncError,
  useIdamConnect,
  useIdamConnectors,
  useIdamSync,
} from './useIdam.js';
import { useDrawer } from '../shell/DrawerHost.js';
import {
  GroupCreateError,
  useCreateGroup,
  useCreateUser,
  useEditUser,
  useGroups,
  useSetUserStatus,
  useUsers,
} from './useUsers.js';

/** The lifecycle badge color: active reads calm, suspended warns, revoked/compromised alarm. */
function statusVariant(status: PrincipalStatus): BadgeVariant {
  switch (status) {
    case 'active':
      return 'good';
    case 'suspended':
    case 'disabled':
      return 'caution';
    case 'revoked':
    case 'compromised':
      return 'critical';
  }
}

/** The display label of a principal kind (the engine tag, title-cased for the column). */
function kindLabel(kind: PrincipalKind): string {
  switch (kind) {
    case 'human':
      return 'Human';
    case 'service':
      return 'Service Account';
    case 'agent':
      return 'AI Agent';
  }
}

/** The friendly display name of an IdAM connector slug (e.g. `auth0` -> `Auth0`). */
function connectorLabel(slug: string): string {
  if (slug === 'auth0') return 'Auth0';
  // An unknown provider still reads honestly, title-cased, never a fabricated name.
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * The Origin cell (crdb DR.2): a federated (IdAM-imported) identity shows its CONNECTOR (e.g. `Auth0`)
 * from `boundConnector`; a device account shows `Observed`; an operator-provisioned record shows
 * `Local`. A federated account is provider-managed (its `ownedFields` come from the connector and it
 * carries no local Edit action), which is the honest read-only story on the surface.
 */
function originLabel(row: PrincipalRow): string {
  if (row.boundConnector) {
    return connectorLabel(row.boundConnector);
  }
  return row.origin === 'local' ? 'Local' : 'Observed';
}

/** The typed failure line a command form renders (409 duplicate vs 400 malformed vs a denial). */
function commandFailure(error: Error | null): string | null {
  if (error === null) return null;
  if (error instanceof GroupCreateError) {
    if (error.status === 409) return 'A principal with that username already exists.';
    if (error.status === 400) return 'The form is incomplete or malformed.';
    return 'The engine refused the command.';
  }
  return 'The command could not reach the engine.';
}

/**
 * The Add / Edit User form (UY.6): the mock's form MINUS every trust field (operator ruling
 * 2026-07-21 -- no Trust Score Threshold Override exists). `users.create` provisions a local
 * enterprise record (TRD-35 6.3); edit re-writes its enterprise fields (the username is the
 * natural key and read-only on edit).
 */
function UserForm({
  editing,
  onDone,
}: {
  readonly editing: PrincipalRow | null;
  readonly onDone: () => void;
}): ReactElement {
  const create = useCreateUser();
  const edit = useEditUser();
  const active = editing === null ? create : edit;
  const [username, setUsername] = useState(editing?.username ?? '');
  const [kind, setKind] = useState<'human' | 'service'>(
    editing !== null && editing.kind === 'service' ? 'service' : 'human',
  );
  const [email, setEmail] = useState(editing?.email ?? '');
  const [org, setOrg] = useState(editing?.org ?? '');

  const submit = (): void => {
    const draft: PrincipalDraft = {
      username: username.trim(),
      kind,
      email: email.trim() === '' ? null : email.trim(),
      org: org.trim() === '' ? null : org.trim(),
    };
    active.mutate(draft, { onSuccess: onDone });
  };
  const failure = commandFailure(active.error);

  return (
    <form
      className="fcx-users-create"
      aria-label={editing === null ? 'Add a user' : `Edit ${editing.username}`}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="fcx-filter">
        User Name
        <input
          className="fcx-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          readOnly={editing !== null}
          required
        />
      </label>
      <label className="fcx-filter">
        Type
        <select
          className="fcx-select"
          value={kind}
          onChange={(e) => setKind(e.target.value === 'service' ? 'service' : 'human')}
        >
          <option value="human">Human</option>
          <option value="service">Service Account</option>
        </select>
      </label>
      <label className="fcx-filter">
        Email Address
        <input
          type="email"
          className="fcx-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="fcx-filter">
        Organization
        <input className="fcx-input" value={org} onChange={(e) => setOrg(e.target.value)} />
      </label>
      <button
        type="submit"
        className="fcx-btn fcx-btn--primary"
        disabled={active.isPending || username.trim() === ''}
      >
        {active.isPending ? 'Committing...' : editing === null ? 'Create User' : 'Save'}
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

/** The All Users tab: controls + the directory table. */
function AllUsers({ initialSearch }: { readonly initialSearch: string }): ReactElement {
  const users = useUsers();
  const drawer = useDrawer();
  const statusMutation = useSetUserStatus();
  const [search, setSearch] = useState(initialSearch);
  const [form, setForm] = useState<'closed' | 'add' | PrincipalRow>('closed');
  const [confirming, setConfirming] = useState<{
    row: PrincipalRow;
    status: 'active' | 'suspended' | 'revoked';
  } | null>(null);
  const [kind, setKind] = useState<'' | PrincipalKind>('');
  const [status, setStatus] = useState<'' | PrincipalStatus>('');
  const [origin, setOrigin] = useState<'' | PrincipalOrigin>('');

  const rows = useMemo(() => {
    const all = users.data ?? [];
    const needle = search.trim().toLowerCase();
    return all.filter(
      (r) =>
        (needle === '' ||
          r.username.toLowerCase().includes(needle) ||
          r.principalId.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.org.toLowerCase().includes(needle) ||
          r.groups.some((g) => g.toLowerCase().includes(needle))) &&
        (kind === '' || r.kind === kind) &&
        (status === '' || r.status === status) &&
        (origin === '' || r.origin === origin),
    );
  }, [users.data, search, kind, status, origin]);

  const columns = useMemo<readonly DataTableColumn<PrincipalRow>[]>(
    () => [
      { id: 'name', header: 'Name', cell: (r) => r.username, width: '12rem' },
      {
        id: 'id',
        header: 'ID',
        cell: (r) => <span className="fcx-users-id">{r.principalId}</span>,
      },
      { id: 'email', header: 'Email', cell: (r) => (r.email === '' ? '--' : r.email) },
      { id: 'org', header: 'Org', cell: (r) => (r.org === '' ? '--' : r.org), width: '10rem' },
      {
        id: 'groups',
        header: 'Groups',
        cell: (r) =>
          r.groups.length === 0 ? (
            '--'
          ) : (
            <span className="fcx-users-groups">
              {r.groups.map((g) => (
                <Badge key={g} variant="neutral">
                  {g}
                </Badge>
              ))}
            </span>
          ),
      },
      { id: 'kind', header: 'Type', cell: (r) => kindLabel(r.kind), width: '9rem' },
      {
        id: 'status',
        header: 'Status',
        cell: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge>,
        width: '8rem',
      },
      {
        id: 'origin',
        header: 'Origin',
        cell: (r) => originLabel(r),
        width: '7rem',
      },
      // No engine substrate yet (TRD-CONSOLE-04): these render blank, never a guess.
      { id: 'remote', header: 'Remote', cell: () => '--', width: '6rem' },
      { id: 'compliance', header: 'Compliance', cell: () => '--', width: '7rem' },
      {
        id: 'actions',
        header: 'Actions',
        // Lifecycle commands apply to LOCAL enterprise records only (the engine refuses a
        // non-local subject); an observed account's cell stays honestly empty.
        cell: (r) =>
          r.origin === 'local' ? (
            <span className="fcx-users-actions">
              <button
                type="button"
                className="fcx-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setForm(r);
                }}
              >
                Edit
              </button>
              {r.status === 'active' ? (
                <button
                  type="button"
                  className="fcx-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming({ row: r, status: 'suspended' });
                  }}
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  className="fcx-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming({ row: r, status: 'active' });
                  }}
                >
                  Activate
                </button>
              )}
              {r.status === 'revoked' ? null : (
                <button
                  type="button"
                  className="fcx-btn fcx-btn--danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirming({ row: r, status: 'revoked' });
                  }}
                >
                  Revoke
                </button>
              )}
            </span>
          ) : (
            '--'
          ),
        width: '13rem',
      },
    ],
    [],
  );

  const activeFilters = [
    search.trim() !== '' ? `search "${search.trim()}"` : null,
    kind !== '' ? `type ${kind}` : null,
    status !== '' ? `status ${status}` : null,
    origin !== '' ? `origin ${origin}` : null,
  ].filter((f): f is string => f !== null);

  return (
    <>
      <div className="fcx-surface__controls">
        <button
          type="button"
          className="fcx-btn fcx-btn--primary"
          onClick={() => setForm((f) => (f === 'add' ? 'closed' : 'add'))}
        >
          + Add
        </button>
        <input
          type="search"
          className="fcx-input"
          placeholder="Search users..."
          aria-label="Search users"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="fcx-filter">
          Type
          <select
            className="fcx-select"
            value={kind}
            onChange={(e) => setKind(e.target.value as '' | PrincipalKind)}
          >
            <option value="">All</option>
            {PRINCIPAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="fcx-filter">
          Status
          <select
            className="fcx-select"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | PrincipalStatus)}
          >
            <option value="">All</option>
            {PRINCIPAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="fcx-filter">
          Origin
          <select
            className="fcx-select"
            value={origin}
            onChange={(e) => setOrigin(e.target.value as '' | PrincipalOrigin)}
          >
            <option value="">All</option>
            {PRINCIPAL_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {o === 'local' ? 'Local' : 'Observed'}
              </option>
            ))}
          </select>
        </label>
      </div>

      {form !== 'closed' ? (
        <UserForm editing={form === 'add' ? null : form} onDone={() => setForm('closed')} />
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={
          confirming !== null
            ? `${confirming.status === 'active' ? 'Activate' : confirming.status === 'suspended' ? 'Suspend' : 'Revoke'} ${confirming.row.username}?`
            : ''
        }
        {...(confirming?.status === 'revoked'
          ? {
              description:
                'Revocation closes access; the record stays in history and is never deleted.',
              tone: 'critical' as const,
            }
          : {})}
        confirmLabel="Commit"
        onConfirm={() => {
          if (confirming !== null) {
            statusMutation.mutate({ username: confirming.row.username, status: confirming.status });
          }
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />

      {users.isLoading ? (
        <LoadingState label="Loading the principal directory" />
      ) : users.isError ? (
        <ErrorState
          title="Could not load the principal directory."
          onRetry={() => void users.refetch()}
        />
      ) : (
        <DataTable
          caption="Every principal the engine authorizes"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.principalId}
          onRowActivate={(r) =>
            drawer.openEntity({ kind: 'principal', id: principalId(r.principalId) })
          }
          rowLabel={(r) => `Open the entity drawer for ${r.username}`}
          onRowHover={(r) =>
            drawer.prefetchEntity({ kind: 'principal', id: principalId(r.principalId) })
          }
          empty={
            <EmptyState
              title="No principals match"
              hint={
                activeFilters.length > 0
                  ? `No principal matches ${activeFilters.join(', ')}.`
                  : 'No principals have been observed or provisioned yet.'
              }
            />
          }
        />
      )}
    </>
  );
}

/** The Groups tab (UY.3): the real group directory as cards + the audited Create Group action. */
function GroupsTab({
  onShowMembers,
}: {
  readonly onShowMembers: (group: string) => void;
}): ReactElement {
  const groups = useGroups();
  const create = useCreateGroup();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const submit = (): void => {
    create.mutate(
      { name: name.trim(), description: description.trim() },
      {
        onSuccess: () => {
          setCreating(false);
          setName('');
          setDescription('');
        },
      },
    );
  };
  const createFailure =
    create.error instanceof GroupCreateError
      ? create.error.status === 409
        ? 'A group with that name already exists.'
        : create.error.status === 400
          ? 'The group name is required.'
          : 'The engine refused the command.'
      : create.isError
        ? 'The command could not reach the engine.'
        : null;

  return (
    <>
      <div className="fcx-surface__controls">
        <h3 className="fcx-surface__subheading">User Groups</h3>
        <button
          type="button"
          className="fcx-btn fcx-btn--primary"
          onClick={() => setCreating((c) => !c)}
        >
          + Create Group
        </button>
      </div>

      {creating ? (
        <form
          className="fcx-users-create"
          aria-label="Create a group"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="fcx-filter">
            Name
            <input
              className="fcx-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="fcx-filter">
            Description
            <input
              className="fcx-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="fcx-btn fcx-btn--primary"
            disabled={create.isPending || name.trim() === ''}
          >
            {create.isPending ? 'Creating...' : 'Create'}
          </button>
          <button type="button" className="fcx-btn" onClick={() => setCreating(false)}>
            Cancel
          </button>
          {createFailure !== null ? (
            <p role="alert" className="fcx-form-error">
              {createFailure}
            </p>
          ) : null}
        </form>
      ) : null}

      {groups.isLoading ? (
        <LoadingState label="Loading the group directory" />
      ) : groups.isError ? (
        <ErrorState
          title="Could not load the group directory."
          onRetry={() => void groups.refetch()}
        />
      ) : (groups.data ?? []).length === 0 ? (
        <EmptyState title="No groups" hint="No groups have been observed or created yet." />
      ) : (
        <div className="fcx-users-groups-grid" role="list" aria-label="User groups">
          {(groups.data ?? []).map((g) => (
            <article key={g.groupId} role="listitem" className="fcx-users-group-card">
              <div className="fcx-users-group-card__head">
                <h4 className="fcx-users-group-card__name">{g.name}</h4>
                {g.builtIn ? <Badge variant="neutral">built-in</Badge> : null}
              </div>
              {/* UY.5: a group's members are the principals wearing its chip -- one click lands on the
                  All Users table narrowed to this group (the membership is engine-computed). */}
              <button
                type="button"
                className="fcx-users-group-card__count fcx-btn--link"
                onClick={() => onShowMembers(g.name)}
                aria-label={`Show the ${String(g.memberCount)} members of ${g.name}`}
              >
                {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
              </button>
              <p className="fcx-users-group-card__description">
                {g.description === '' ? '--' : g.description}
              </p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/** The connector state's badge label + color. `healthy` reads calm; anything ambiguous warns. */
function connectorStateBadge(state: IdamConnectorState): { label: string; variant: BadgeVariant } {
  switch (state) {
    case 'healthy':
      return { label: 'Connected', variant: 'good' };
    case 'syncing':
      return { label: 'Syncing', variant: 'neutral' };
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
  const failure = connectFailure(connect.error);

  const submit = (): void => {
    connect.mutate(
      {
        provider,
        domain: domainValue.trim(),
        clientId: clientId.trim(),
        audience: audience.trim(),
        secret,
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
      <p className="fcx-users-idam-note">
        The secret is written to this node&apos;s protected store and never leaves it; the console
        never stores it or sends it over the engine wire.
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

function IdamTab(): ReactElement {
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
            const syncingThis =
              c.running || (sync.isPending && sync.variables?.provider === c.connectorId);
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
        description="This runs a real audited directory sync against the provider."
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

/** The Users surface: the tab strip + the All Users table (Groups/IDAM land in UY.3/UY.4). */
export function UsersSurface(): ReactElement {
  const [tab, setTab] = useState('all-users');
  const [memberSearch, setMemberSearch] = useState('');
  return (
    <section className="fcx-surface" aria-labelledby="surface-users">
      <div className="fcx-surface__header">
        <h2 id="surface-users" className="fcx-surface__heading">
          Users
        </h2>
      </div>
      <TabStrip
        tabs={[
          { id: 'all-users', label: 'All Users' },
          { id: 'groups', label: 'Groups' },
          { id: 'idam', label: 'External IDAM' },
        ]}
        activeId={tab}
        onChange={setTab}
        ariaLabel="Users sections"
      />
      {tab === 'all-users' ? (
        <AllUsers key={memberSearch} initialSearch={memberSearch} />
      ) : tab === 'groups' ? (
        <GroupsTab
          onShowMembers={(group) => {
            setMemberSearch(group);
            setTab('all-users');
          }}
        />
      ) : (
        <IdamTab />
      )}
    </section>
  );
}
