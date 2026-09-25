# TRD-CONSOLE-04 -- Users and Identity

**Status:** DRAFT (authored 2026-07-07; amended 2026-07-21). **AMENDED 2026-09-25 (`IP-CONSOLE-11-guide`
GD.7): refreshed to the built surface against the configuration census; every requirement not built is
kept and marked with its census id (Section 7).** The same External IDAM panel is also mounted on Settings
> Federation (`TRD-CONSOLE-11`). Inherits `TRD-CONSOLE-00`. The Users
surface manages the platform's **principals** -- every actor the engine authorizes -- and the external
identity providers they federate from. Mock target: `shot-03` (All Users), `shot-04` (Groups),
`shot-05` (External IDAM). Engine substrate: crdb **TRD-35** (Local User Graph and Enterprise
Identity).

**Amendment 2026-07-21 (operator rulings).** (1) **Trust score is removed platform-wide**: the mock's
Override column and the trust-override binding are DELETED from this spec; where the mock and this TRD
disagree, this TRD wins (the deviation is recorded here per the source-hierarchy rule). (2)
**Operator-created local users are first-class**: Add creates a locally-provisioned principal (the
TRD-35 Section 6.3 "approved local enterprise record" origin), required for RBAC alignment and for
environments with no IdAM connector -- it is not a break-glass path. IdAM-federated identities remain
lifecycle-from-source.

"Users" is the operator-facing name; the underlying model is the Crucible **Principal** (TRD-04
Section 3.1: Human, Agent, Model, Tool, Service). The mock's Type column (Employee, Contractor, Partner,
Service Account, AI Agent) maps onto those principal kinds. **As built:** Type shows the engine kind as
Human / Service Account / AI Agent; there are no Employee / Contractor / Partner sub-classes (Section 7).
AI Agent rows come from the agent directory and cannot be provisioned here.

---

## 1. Purpose

Let the operator see, add, edit, and govern every principal (human, service account, AI agent) -- their
identity, org, groups, kind, status, remote posture, and compliance context -- and manage
group membership and the external IdM connectors that federate identities in. Identity is the root of
authorization; this surface curates it, and the engine enforces it. **As built:** remote posture and
compliance have no engine source and show `--`; group membership is set by the engine (`groups.setMembers`
is LIVE) but has no control on the page (Section 7).

## 2. Tabs and model

### 2.1 All Users (principals table)
Columns, each a real field (matching the mock):

| Column | Meaning | Real source |
|--------|---------|-------------|
| **Name / ID / Email** | the principal's identity | the Principal record (TRD-04) |
| **Org** | owning organization/tenant unit | the principal's org attribute |
| **Groups** | group memberships (chips) | the principal's groups |
| **Type** | Human / Service Account / AI Agent | the engine subject type (`human`, `service`) or an enrolled agent (`agent`) |
| **Status** | active / suspended / revoked (local records); active / disabled (observed accounts); compromised (agents) | the principal lifecycle state; no Pending state |
| **Origin** | Local, the connector name for a federated account (e.g. Auth0), or Observed | the identity's authoritative source (TRD-35 Section 9); the Origin filter offers only All / Local / Observed, so federated rows fall under Observed |
| **Remote** | Yes/No -- remote/off-network posture | the principal's remote flag (not built: renders `--`, Section 7) |
| **Compliance** | FedRAMP / GDPR / HIPAA chips | the principal's compliance/classification tags (not built: renders `--`, Section 7) |
| **Actions** | Edit, Suspend or Activate, Revoke | on Local rows only; `--` otherwise |

Search (a substring over username, id, email, org and groups) with Type / Status / Origin filters narrows
the complete, engine-bounded directory client-side; Add opens an inline form. Export is not built (Section
7).

### 2.2 Groups
Group cards (Engineering, Healthcare Staff, Finance, IT Admin, Contractors, Partners, AI Services,
Compliance, ...) with member count + description + a settings affordance; a Create Group action. Groups
are the subject sets policies scope to (`TRD-CONSOLE-05`). **As built:** group cards (name, a `built-in`
badge for observed or system groups, direct member count, description) and an inline Create Group form
(name, description); the member count searches All Users for the group name (a text search, not a
membership filter). A per-group settings affordance, editing a description and setting members are not
built (Section 7); a group created here stays empty unless membership arrives from a device or a
connector.

### 2.3 External IDAM (federation)
The external identity connectors (Okta, Azure AD, Google Workspace, ...) with connection status + last
sync, a per-connector configure affordance, and a Sync Now action. This is the federated-identity edge
(the same IdP family Torch enrollment uses); the Console configures the connectors, the engine performs
the federation. **As built:** one node-level Auth0 connector (the only provider the node accepts), shared
by every tenant on the node (CD-15). Its card shows the state (Connected / Syncing / Never synced / Disabled
/ Partial sync / Unknown / Error), the provider tenant, last sync, objects synced, the poll interval and the
engine's last error, and offers Configure and Sync Now; with no connector, Onboard Auth0. The form (Provider
Domain, Client ID, Audience, Client Secret, delta poll 60-86400 s, full sync 1-168 h) runs three calls in
order: secret write, connect, configure. Okta / Azure AD / Google Workspace and turning a connector on or
off are not built (Section 7).

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `users.list`** -> a CrucibleQL query over the Principal registry, server-paged,
  filterable, tier-redacted. **As built:** a bounded, complete read (the engine refuses rather than
  truncates), merged by the gateway with the agent directory (`LIST_AGENTS`), filtered client-side.
- **Read binding `users.detail(id)`** -> a principal's full record; clicking a row opens the entity
  drawer (`TRD-CONSOLE-12`) for a principal.
- **Read binding `groups.list`** / `groups.detail(id)` -> the groups + members.
- **Read binding `idam.connectors`** -> the federation connectors + status/last-sync.
- **Command bindings** (real, audited, confirm-gated where they change access):
  - `users.create` / `users.edit` -> add/edit a **locally-provisioned** principal (audited; the
    TRD-35 Section 6.3 local enterprise record); `users.setStatus` (activate/suspend/revoke).
    Identity fields of an IdAM-federated principal are read-only here (lifecycle-from-source); a
    conflicting local edit is refused with a typed error naming the owning connector.
  - `groups.create` / `groups.edit` / `groups.setMembers`.
  - `idam.connect` (domain, client id, audience and a fixed secret path; applied by re-spawning the
    connector), `idam.configure` (enabled plus the two cadences), `idam.sync` (queues a full sync and
    returns at once), and `idam.secret` (the gateway writes the client secret to the node's protected
    store through the on-node secret service, never over the engine wire; session-only, CD-01). **As
    built:** the three engine `idam.*` commands change in-memory connector state only, write no audit
    record and revert when the node restarts (manifest `audited: false`, CD-15).
  - **As built:** an edit to an IdAM-owned field is refused by the engine, but the refusal reaches the
    Console as a bare conflict without the connector's name (Section 7). No `users.*`, `groups.*` or
    `idam.*` binding is `PENDING`.
- `PENDING` / `INV-CROSS`: where a principal-management or connector operation is not yet a first-class
  engine/enrollment surface, the binding is `PENDING` and the implementing IP names the Crucible/Torch
  work (e.g. the enrollment/federation command).

Creating a local principal is a governed operator action: audited, tier-gated (Admin/SecurityAudit),
committed through the engine's atomic batch. **As built:** the `users.*` and `groups.*` commands are
audited; there is no role or tier check at the page, the gateway or the engine (CD-03). Local principals exist for RBAC alignment -- they are the
subjects group membership and policy scoping bind to (`TRD-CONSOLE-05`) -- and are full citizens of
authorization whether or not an IdAM connector exists (TRD-35 R-LUG-22).

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click a principal row -> the drawer (status, information, connected zones and effective policies as
  not available, recent decisions, and the Isolate action; `TRD-CONSOLE-12`).
- **Suspend/revoke a principal:** a Local row's Suspend or Revoke (1) -> confirm (2); the actions are on
  the row, not in the drawer. Activate is also offered on a revoked row (CD-24).
- **Add a principal:** Add (1) -> fill the inline form -> Create User (2).
- **Sync an IdP:** External IDAM (1) -> Sync Now on the connector (2) -> confirm (3).
- **Onboard an IdP:** External IDAM (1) -> Onboard Auth0 or Configure (2) -> Save connector (3).
- **Create a group:** Groups (1) -> Create Group (2) -> save (3).

## 5. Performance, states

A complete bounded read filtered client-side, not polled; group cards and connectors are small bounded
reads. Loading skeletons; empty states ("no principals match", "no connectors configured"); a command shows
Committing..., then the list reloads from the engine (a failed status change shows no message, CD-31);
unauthorized principals / fields absent per tier (not built, CD-03); a connector sync surfaces progress (the
card polls every 3 s while running) and the last-sync result from the engine, never a fake success.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every principal, group, and connector value derives from a real engine record; no fabricated user
  (contract test + fixtureless render).
- Type maps to the real Principal kind; Status/Origin/Compliance reflect the engine record (Compliance
  renders `--`); no trust-score field renders anywhere on the surface.
- Add/edit/status/group operations commit through the engine with audit and are tier-gated +
  confirm-gated (NOT MET: no tier check, CD-03; only status changes and Sync Now confirm, CD-30); an edit
  to an IdAM-owned identity field is refused with the typed error (NOT MET: refused, but as a bare
  conflict); a connector sync performs a real federation and reports its real result (no audit record,
  CD-15).
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- an unauthorized management action is refused
with the typed error; a failed IdP sync surfaces the connector's real error, not a silent success; a
`PENDING` action is a labelled non-live control.

## 7. Known gaps (recorded 2026-09-25)

Each stays a requirement until built or re-decided; the configuration guide states each one to operators.

- Type sub-classes, a Pending status, Remote and Compliance values (USR-01, USR-F2); an audited export
  (USR-01); server paging and tier redaction (USR-01).
- A group settings affordance, editing a group's description, and setting members on the page (GRP-01,
  GRP-03, GRP-04); the bindings are LIVE, there is no control.
- Connectors other than Auth0 (IDM-01); turning a connector on or off (IDM-04); Configure pre-fills only the
  domain, asks again for the client id and secret, and resets the cadences to 300 s / 24 h (IDM-02, CD-15).
- IdAM settings are not persisted, not audited and not tiered, and one node-wide connector is shared by
  every tenant (CD-15); the secret write needs only a session (CD-01).
- Role and tier gating of add, edit, status and group commands (CD-03); no confirmation on add, edit,
  create group or Save connector (CD-30).
- The IdAM-owned-field refusal is not typed and does not name the connector (USR-04).
- A revoked user can be re-activated (CD-24); the runtime access effect of suspend and revoke is
  unverified (census K item 9); a failed status change is not shown (CD-31); mutations are retried after
  a transport failure (CD-12).

## 8. Six-bug-category notes

Cross-module gap: principal/group/connector view models typed in `@forge/contracts` against the generated
wire DTO (`packages/contracts/src/users.ts`, `generated/wire-dto.ts`) + the connector shape. Schema bypass: the add/edit form emits the typed principal shape.
Missing failure path: unauthorized-create, IdAM-owned-field edit refusal, revoke, failed-sync, and the
form's session / outage / conflict lines tested; no `PENDING` bindings remain. Dead code: every
action maps to a real (or `PENDING`) command binding.
