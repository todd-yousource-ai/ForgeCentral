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
import { Badge, DataTable, TabStrip, type BadgeVariant, type DataTableColumn } from '@forge/design';
import type {
  PrincipalKind,
  PrincipalOrigin,
  PrincipalRow,
  PrincipalStatus,
} from '@forge/contracts';
import {
  IDAM_CONNECTOR_SHELLS,
  PRINCIPAL_KINDS,
  PRINCIPAL_ORIGINS,
  PRINCIPAL_STATUSES,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { GroupCreateError, useCreateGroup, useGroups, useUsers } from './useUsers.js';

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

/** The All Users tab: controls + the directory table. */
function AllUsers(): ReactElement {
  const users = useUsers();
  const [search, setSearch] = useState('');
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
        cell: (r) => (r.origin === 'local' ? 'Local' : 'Observed'),
        width: '7rem',
      },
      // No engine substrate yet (TRD-CONSOLE-04): these render blank, never a guess.
      { id: 'remote', header: 'Remote', cell: () => '--', width: '6rem' },
      { id: 'compliance', header: 'Compliance', cell: () => '--', width: '7rem' },
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
function GroupsTab(): ReactElement {
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
              <p className="fcx-users-group-card__count">
                {g.memberCount} {g.memberCount === 1 ? 'member' : 'members'}
              </p>
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

/**
 * The External IDAM tab (UY.4): the HONEST not-connected shell. The three well-known connectors
 * render their real state -- none is connected, because the TRD-35 Phase-2 IdAM adapters are not
 * built (`idam.*` bindings are PENDING; Auth0 is the planned first live connector). Configure and
 * Sync Now are labelled non-live controls, never silent stubs; no fabricated last-sync exists
 * anywhere (INV-CONSOLE-IDAM-HONEST).
 */
function IdamTab(): ReactElement {
  return (
    <>
      <div className="fcx-surface__controls">
        <h3 className="fcx-surface__subheading">External Identity &amp; Access Management</h3>
        <button
          type="button"
          className="fcx-btn"
          disabled
          title="Pending: TRD-35 Phase 2 IdAM adapters (Auth0 first)"
        >
          Sync Now (pending)
        </button>
      </div>
      <p className="fcx-users-idam-note">
        Federation connectors arrive with the TRD-35 Phase-2 IdAM adapters; Auth0 is the planned
        first live connector. Until then every connector below reports its real state.
      </p>
      <div className="fcx-users-groups-grid" role="list" aria-label="Identity connectors">
        {IDAM_CONNECTOR_SHELLS.map((c) => (
          <article key={c.connectorId} role="listitem" className="fcx-users-group-card">
            <div className="fcx-users-group-card__head">
              <h4 className="fcx-users-group-card__name">{c.displayName}</h4>
              <Badge variant="neutral">Not Connected</Badge>
            </div>
            <p className="fcx-users-group-card__description">
              {c.lastSyncAt === null ? 'No sync has ever run.' : ''}
            </p>
            <button
              type="button"
              className="fcx-btn"
              disabled
              title="Pending: TRD-35 Phase 2 IdAM adapters"
            >
              Configure (pending)
            </button>
          </article>
        ))}
      </div>
    </>
  );
}

/** The Users surface: the tab strip + the All Users table (Groups/IDAM land in UY.3/UY.4). */
export function UsersSurface(): ReactElement {
  const [tab, setTab] = useState('all-users');
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
      {tab === 'all-users' ? <AllUsers /> : tab === 'groups' ? <GroupsTab /> : <IdamTab />}
    </section>
  );
}
