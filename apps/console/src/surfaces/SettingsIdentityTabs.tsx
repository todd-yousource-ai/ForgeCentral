// apps/console/src/surfaces/SettingsIdentityTabs.tsx -- the Settings RBAC and Federation tabs
// (IP-CONSOLE-11 ST.3 / ST.4 over crdb IP-CONSOLE-SETTINGS-WIRE SET.1 + SET.1b).
//
// Both tabs are READ-ONLY by the engine's own registry: `identity.admins` and
// `identity.sso_group_roles` are boot-bound (the admin plane reads them at start), so they carry no
// edit control and the change path is stated in the registry's words (INV-SETTINGS-SOURCE-LABELLED).
// The values are the engine's TYPED identity values, never a parse of the text rendering, which a
// free-form identity can make ambiguous. The Console's own operator roles are the BFF's installer
// configuration and are shown as that, to global admins only. The Federation tab mounts the same
// connector panel as the Users surface (one component, one fetch path).

import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Badge, DataTable, GlassPanel } from '@forge/design';
import {
  adminRoleLabel,
  settingSourceLabel,
  type ConsoleRbacView,
  type ConsoleRoleGrant,
  type IdentityValues,
  type SettingsView,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { IdamConnectorsPanel } from './IdamConnectorsPanel.js';
import { useConsoleRbac, useGovernedSettings } from './useSettings.js';
import { TierRequired } from './TierRequired.js';

type AdminRow = IdentityValues['admins'][number];
type SsoRow = IdentityValues['ssoGroupRoles'][number];

function RoleList({ roles }: { readonly roles: readonly string[] }): ReactElement {
  return (
    <span className="fcx-settings__roles">
      {roles.map((r) => (
        <Badge key={r} variant="neutral">
          {adminRoleLabel(r)}
        </Badge>
      ))}
    </span>
  );
}

/** The source + boot-bound line for one identity section, in the engine registry's own words. */
function BootBoundNote({
  view,
  settingKey,
}: {
  readonly view: SettingsView;
  readonly settingKey: string;
}): ReactElement | null {
  const row = view.rows.find((r) => r.key === settingKey);
  if (row === undefined) {
    return null;
  }
  return (
    <p className="fcx-settings__hint">
      Source: {settingSourceLabel(row, view.version)}. Read-only here: {row.liveApply}. Change it
      with <code>{row.changeVia}</code>, then restart the node.
    </p>
  );
}

/** Reads the governed settings once for both identity tabs; the tier-below and error states. */
function WithIdentity({
  label,
  children,
}: {
  readonly label: string;
  readonly children: (view: SettingsView, identity: IdentityValues) => ReactElement;
}): ReactElement {
  const governed = useGovernedSettings(true);
  if (governed.isPending) {
    return <LoadingState label="Reading the committed identity configuration" />;
  }
  if (governed.isError) {
    return (
      <ErrorState
        title={`The ${label} settings could not be read`}
        onRetry={() => void governed.refetch()}
      />
    );
  }
  if (governed.data === null) {
    return <TierRequired what="the identity configuration" />;
  }
  if (governed.data.identity === null) {
    return (
      <EmptyState
        title="The engine did not send its identity values"
        hint="This engine predates the typed identity read (crdb SET.1b); nothing is shown in their place."
      />
    );
  }
  return children(governed.data, governed.data.identity);
}

function grantTable(caption: string, keyHeader: string, grants: readonly ConsoleRoleGrant[]) {
  return (
    <DataTable<ConsoleRoleGrant>
      caption={caption}
      columns={[
        { id: 'key', header: keyHeader, cell: (g) => <code>{g.key}</code> },
        { id: 'role', header: 'Console role', cell: (g) => g.role },
        { id: 'tenant', header: 'Tenant', cell: (g) => g.tenant ?? 'every tenant' },
      ]}
      rows={grants}
      rowKey={(g) => g.key}
      empty={<span>None configured.</span>}
    />
  );
}

/** The Console's own role map (BFF installer configuration), global admins only. */
function ConsoleRolesPanel(): ReactElement {
  const rbac = useConsoleRbac();
  let body: ReactElement;
  if (rbac.isPending) {
    body = <LoadingState label="Reading the Console role map" />;
  } else if (rbac.isError) {
    body = (
      <ErrorState
        title="The Console role map could not be read"
        onRetry={() => void rbac.refetch()}
      />
    );
  } else if (rbac.data === null) {
    body = (
      <EmptyState
        title="Global admin required"
        hint="The Console role map names every tenant it grants, so only a global admin sees it."
      />
    );
  } else {
    const view: ConsoleRbacView = rbac.data;
    body = (
      <>
        <p className="fcx-settings__hint">
          Installer configuration, read at BFF start. It changes with a Console re-install, never
          from here. Default tenant for a global admin: {view.defaultTenant ?? 'none configured'}.
        </p>
        {grantTable('Console roles granted by IdP group', 'IdP group', view.groupRoles)}
        {grantTable(
          'Console roles granted by subject (used only when the token carries no group)',
          'OIDC subject',
          view.localRbac,
        )}
      </>
    );
  }
  return (
    <GlassPanel ariaLabel="Console operator roles" header={<span>Console operator roles</span>}>
      {body}
    </GlassPanel>
  );
}

/** The RBAC tab (ST.3): engine admin assignments + the Console's own role map, both read-only. */
export function RbacTab(): ReactElement {
  return (
    <>
      <GlassPanel
        ariaLabel="Engine admin assignments"
        header={<span>Engine admin assignments</span>}
      >
        <WithIdentity label="RBAC">
          {(view, identity) => (
            <>
              <BootBoundNote view={view} settingKey="identity.admins" />
              <DataTable<AdminRow>
                caption="The engine admin assignments"
                columns={[
                  { id: 'identity', header: 'Identity', cell: (a) => <code>{a.identity}</code> },
                  { id: 'roles', header: 'Roles', cell: (a) => <RoleList roles={a.roles} /> },
                  { id: 'clearance', header: 'Clearance', cell: (a) => a.clearance },
                ]}
                rows={identity.admins}
                rowKey={(a) => a.identity}
                empty={<span>No admin assignments are committed.</span>}
              />
            </>
          )}
        </WithIdentity>
      </GlassPanel>
      <ConsoleRolesPanel />
      <p className="fcx-settings__hint">
        Tenant operators and their groups are managed on the <Link to="/users">Users</Link> surface.
      </p>
    </>
  );
}

/** The Federation tab (ST.4): the IdAM connectors (shared panel) and the SSO group map, read-only. */
export function FederationTab(): ReactElement {
  return (
    <>
      <GlassPanel ariaLabel="Identity providers" header={<span>Identity providers</span>}>
        <IdamConnectorsPanel />
      </GlassPanel>
      <GlassPanel ariaLabel="SSO group map" header={<span>SSO group to admin role map</span>}>
        <WithIdentity label="Federation">
          {(view, identity) => (
            <>
              <BootBoundNote view={view} settingKey="identity.sso_group_roles" />
              <DataTable<SsoRow>
                caption="The SSO group to admin role map"
                columns={[
                  { id: 'group', header: 'SSO group', cell: (g) => <code>{g.group}</code> },
                  { id: 'roles', header: 'Admin roles', cell: (g) => <RoleList roles={g.roles} /> },
                ]}
                rows={identity.ssoGroupRoles}
                rowKey={(g) => g.group}
                empty={<span>No SSO groups are mapped.</span>}
              />
            </>
          )}
        </WithIdentity>
      </GlassPanel>
    </>
  );
}
