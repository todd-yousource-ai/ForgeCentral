# TRD-CONSOLE-04 -- Users and Identity

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. The Users surface manages the
platform's **principals** -- every actor the engine authorizes -- and the external identity providers
they federate from. Mock target: `shot-03` (All Users), `shot-04` (Groups), `shot-05` (External IDAM).

"Users" is the operator-facing name; the underlying model is the Crucible **Principal** (TRD-04
Section 3.1: Human, Agent, Model, Tool, Service). The mock's Type column (Employee, Contractor, Partner,
Service Account, AI Agent) maps onto those principal kinds.

---

## 1. Purpose

Let the operator see, add, edit, and govern every principal (human, service account, AI agent) -- their
identity, org, groups, kind, status, trust override, remote posture, and compliance context -- and manage
group membership and the external IdM connectors that federate identities in. Identity is the root of
authorization; this surface curates it, and the engine enforces it.

## 2. Tabs and model

### 2.1 All Users (principals table)
Columns, each a real field (matching the mock):

| Column | Meaning | Real source |
|--------|---------|-------------|
| **Name / ID / Email** | the principal's identity | the Principal record (TRD-04) |
| **Org** | owning organization/tenant unit | the principal's org attribute |
| **Groups** | group memberships (chips) | the principal's groups |
| **Type** | Employee / Contractor / Partner / Service Account / AI Agent | the Principal kind (Human/Service/Agent, with sub-classification) |
| **Status** | Pending / Active / Suspended / Revoked | the principal lifecycle state |
| **Override** | a manual trust-score override (numeric) or none | the engine's trust override for the principal |
| **Remote** | Yes/No -- remote/off-network posture | the principal's remote flag |
| **Compliance** | FedRAMP / GDPR / HIPAA chips | the principal's compliance/classification tags |

Search + structured filters + Add + export (an audited engine export).

### 2.2 Groups
Group cards (Engineering, Healthcare Staff, Finance, IT Admin, Contractors, Partners, AI Services,
Compliance, ...) with member count + description + a settings affordance; a Create Group action. Groups
are the subject sets policies scope to (`TRD-CONSOLE-05`).

### 2.3 External IDAM (federation)
The external identity connectors (Okta, Azure AD, Google Workspace, ...) with connection status + last
sync, a per-connector configure affordance, and a Sync Now action. This is the federated-identity edge
(the same IdP family Torch enrollment uses); the Console configures the connectors, the engine performs
the federation.

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `users.list`** -> a CrucibleQL query over the Principal registry, server-paged,
  filterable, tier-redacted.
- **Read binding `users.detail(id)`** -> a principal's full record; clicking a row opens the entity
  drawer (`TRD-CONSOLE-12`) for a principal.
- **Read binding `groups.list`** / `groups.detail(id)` -> the groups + members.
- **Read binding `idam.connectors`** -> the federation connectors + status/last-sync.
- **Command bindings** (real, audited, confirm-gated where they change access):
  - `users.create` / `users.edit` -> add/edit a principal; `users.setStatus` (activate/suspend/revoke);
    `users.setOverride` -> set/clear the trust override.
  - `groups.create` / `groups.edit` / `groups.setMembers`.
  - `idam.configure(connector)` / `idam.sync(connector)` -> configure/sync a federation connector.
- `PENDING` / `INV-CROSS`: where a principal-management or connector operation is not yet a first-class
  engine/enrollment surface, the binding is `PENDING` and the implementing IP names the Crucible/Torch
  work (e.g. the enrollment/federation command).

A trust **override** is a governed operator action: it is audited, tier-gated (only Admin/SecurityAudit),
and the engine remains authoritative on how the override participates in scoring -- the Console sets it,
it does not compute trust.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click a principal row -> the drawer (identity, score, policies, recent decisions, actions).
- **Suspend/revoke a principal:** a principal (1) -> Suspend/Revoke (2) -> confirm (3).
- **Add a principal:** Add (1) -> form (2) -> save (3).
- **Sync an IdP:** External IDAM (1) -> Sync Now on the connector (2).
- **Create a group:** Groups (1) -> Create Group (2) -> save (3).

## 5. Performance, states

Server-paged/virtualized table; group cards and connectors are small bounded reads. Loading skeletons;
empty states ("no principals match", "no connectors configured"); a status change shows optimistic-
pending then engine-confirmed; unauthorized principals/fields absent per tier; a connector sync surfaces
progress + the last-sync result (real, from the engine), never a fake success.

## 6. Acceptance and failure semantics

**Acceptance:**
- Every principal, group, and connector value derives from a real engine record; no fabricated user
  (contract test + fixtureless render).
- Type maps to the real Principal kind; Status/Override/Compliance reflect the engine record.
- Add/edit/status/override/group operations commit through the engine with audit and are tier-gated +
  confirm-gated; a connector sync performs a real federation and reports its real result.
- The Section 4 tasks complete within budget.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- an unauthorized management action is refused
with the typed error; a failed IdP sync surfaces the connector's real error, not a silent success; a
`PENDING` action is a labelled non-live control.

## 7. Six-bug-category notes

Cross-module gap: principal/group/connector view models typed in `@forge/contracts` against the TRD-04
Principal DTO + the connector shape. Schema bypass: the add/edit form emits the typed principal shape.
Missing failure path: unauthorized-override, revoke, failed-sync, `PENDING` tested. Dead code: every
action maps to a real (or `PENDING`) command binding.
