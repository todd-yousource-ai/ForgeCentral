# ForgeCentral configuration census -- slice: governance and entity surfaces

Slice: the left-rail navigation, Overview, Virtual Trust Zones, Policies (incl. the distribution panel),
Objects, Users (All Users, Groups, External IDAM), and the shared entity drawer (incl. Isolate).
Method: read-only code reading. Source of truth = code; TRDs compared for drift only.
Repo state read: forgecentral `d3ea588` (2026-09-25), crucible `d0ace55a`. Crucible lines are cited only
where a Console behavior depends on them (the engine side of each op is another census slice).
Nothing was built, run, or edited. "By code reading" marks a behavior traced end to end in source but not
observed at runtime.

## Conventions

- Status: **LIVE** = the SPA exposes the control and it binds to a LIVE manifest binding.
  **PENDING** = the binding is PENDING in the manifest, or the capability is named but not built.
  **READ-ONLY** = a display, a client-side view control (search/filter/paging), or navigation; changes
  no state. **WIRED-NO-UI** = a LIVE binding + a BFF route exist, but no SPA control reaches it.
- Field items (suffix `-F<n>`) are inputs that travel on a command item; their Binding/route/op are the
  command's.
- "Audited" = the manifest's `audited: true` (a command binding is audited by construction,
  forgecentral/packages/contracts/src/binding.ts:49-50); the engine commit is the audit authority.
- Exact rendered strings are quoted; `<x>` marks a substituted value.
- UNVERIFIED: = could not be established from code; the check performed is stated.
- Citations are repo-relative with the repo directory first (`forgecentral/...`, `crucible/...`, both under
  /home/todd/dev). In prose, "TRD-02" etc. abbreviate forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md etc.;
  every TRD citation is written out as a full path.

## Index (98 items)

| ID | Item | Status |
|----|------|--------|
| NAV-01 | Primary navigation rail (nine destinations) | READ-ONLY |
| NAV-02 | Unknown routes and the placeholder surface | READ-ONLY |
| NAV-03 | Account menu (identity, tier badge, Sign out) | READ-ONLY (session action) |
| NAV-04 | Live indicator and environment badge | READ-ONLY |
| OV-01 | Overview header status (risk, Live, Partial graph, stale banner) | READ-ONLY |
| OV-02 | Trust-zone pager (Previous zones / More zones) | READ-ONLY |
| OV-03 | Hover-to-filter | READ-ONLY |
| OV-04 | Open a container's members | READ-ONLY |
| OV-05 | Open a trust zone (ring -> VTZ Configure) | READ-ONLY |
| OV-06 | Live refresh (2 s poll) / push stream `overview.live` | PENDING |
| VTZ-01 | Active zone grid and zone card (incl. risk band) | READ-ONLY |
| VTZ-02 | KPI tiles: Total VTZs, High-sensitivity zones | READ-ONLY |
| VTZ-03 | Search zones | READ-ONLY |
| VTZ-04 | Configure tab, zone selection, `?zone=` deep link | READ-ONLY |
| VTZ-05 | Create a zone (New zone -> Create zone) | LIVE |
| VTZ-06 | Save changes to a zone (settings edit) | LIVE |
| VTZ-07 | Move or rename a zone (parent/name change on Save) | LIVE (defect by code reading) |
| VTZ-08 | Delete zone | LIVE |
| VTZ-F1 | VTZ name | LIVE (field) |
| VTZ-F2 | VTZ type (archetype) | LIVE (field) |
| VTZ-F3 | Parent VTZ (optional) | LIVE (field) |
| VTZ-F4 | Description | LIVE (field) |
| VTZ-F5 | Session duration (hours) | LIVE (field) |
| VTZ-F6 | Telemetry mode | LIVE (field) |
| VTZ-F7 | Micro-segmentation | LIVE (field) |
| VTZ-F8 | Lifecycle (Draft / Published) | LIVE (field) |
| VTZ-09 | Zone members (count and assignment) | PENDING |
| VTZ-10 | Zone policy count | PENDING |
| VTZ-11 | Zone posture matrix (own / effective / floor / ancestors) | READ-ONLY (read, not rendered) |
| POL-01 | Policy list: zone accordions + table | READ-ONLY |
| POL-02 | Search policies + Zone filter | READ-ONLY |
| POL-03 | Create a policy (Save as Draft) | LIVE |
| POL-04 | Edit a policy (Save as Draft) | LIVE |
| POL-05 | Save & Publish | LIVE |
| POL-06 | Delete a policy | LIVE |
| POL-F1 | Policy Name | LIVE (field) |
| POL-F2 | Zone | LIVE (field) |
| POL-F3 | Subjects (Who) / Targets (What) | LIVE (field) |
| POL-F4 | Protocol | LIVE (field) |
| POL-F5 | Ports | LIVE (field) |
| POL-F6 | Action | LIVE (field) |
| POL-F7 | Logging Level | LIVE (field) |
| POL-F8 | Schedule: Days / From (hour) / To (hour) | LIVE (field) |
| POL-F9 | Geo allowlist | LIVE (field) |
| POL-F10 | Tags | LIVE (field) |
| POL-F11 | Applied To | LIVE (field) |
| POL-F12 | Max Classification | LIVE (field) |
| POL-F13 | Description | LIVE (field) |
| POL-07 | Active window (from / until) | READ-ONLY (authoring deferred) |
| POL-08 | Breaking-publish flag | READ-ONLY |
| POL-09 | Policy detail + version history | WIRED-NO-UI |
| POL-10 | Runtime enforcement of schedule/geo/ports | PENDING |
| DIST-01 | Policy distribution ledger (convergence) | READ-ONLY |
| DIST-02 | Commit & re-distribute | LIVE |
| DIST-03 | First distribution / choosing endpoints | PENDING (not built) |
| OBJ-01 | Object catalog (cards grouped by kind) | READ-ONLY |
| OBJ-02 | Search objects + Kind filter | READ-ONLY |
| OBJ-03 | Create an object | LIVE |
| OBJ-04 | Edit an object | LIVE |
| OBJ-05 | Delete an object | LIVE |
| OBJ-F1 | Name | LIVE (field) |
| OBJ-F2 | Kind | LIVE (field) |
| OBJ-F3 | Selector (form) | LIVE (field) |
| OBJ-F4 | Value (selector value) | LIVE (field) |
| OBJ-F5 | Description | LIVE (field) |
| OBJ-06 | Object lifecycle, tags, attributes (no authoring control) | READ-ONLY |
| OBJ-07 | Object detail in the drawer (members; governing policies) | READ-ONLY (+ PENDING section) |
| USR-01 | All Users table | READ-ONLY |
| USR-02 | Search users + Type / Status / Origin filters | READ-ONLY |
| USR-03 | Add a user | LIVE |
| USR-04 | Edit a user | LIVE |
| USR-05 | Suspend / Activate / Revoke a user | LIVE |
| USR-F1 | User Name | LIVE (field) |
| USR-F2 | Type | LIVE (field) |
| USR-F3 | Email Address | LIVE (field) |
| USR-F4 | Organization | LIVE (field) |
| GRP-01 | Groups tab (cards + show members) | READ-ONLY |
| GRP-02 | Create a group | LIVE |
| GRP-F1 | Group Name / Description | LIVE (field) |
| GRP-03 | Edit a group's description | WIRED-NO-UI |
| GRP-04 | Set a group's members | WIRED-NO-UI |
| IDM-01 | External IDAM connector cards (status) | READ-ONLY |
| IDM-02 | Onboard Auth0 / Configure -> Save connector | LIVE |
| IDM-F1 | Provider Domain | LIVE (field) |
| IDM-F2 | Client ID | LIVE (field) |
| IDM-F3 | Audience | LIVE (field) |
| IDM-F4 | Client Secret (secret write) | LIVE (field) |
| IDM-F5 | Delta poll interval (seconds) | LIVE (field) |
| IDM-F6 | Full directory sync (hours) | LIVE (field) |
| IDM-03 | Sync Now | LIVE |
| IDM-04 | Enable / disable a connector | WIRED-NO-UI |
| DRW-01 | Entity drawer entry points + hover prefetch | READ-ONLY |
| DRW-02 | Entity drawer sections | READ-ONLY (+ PENDING sections) |
| DRW-03 | Isolate from network | LIVE |
| DRW-04 | Modify VTZ assignment | PENDING (not rendered) |
| DRW-05 | View remediation | PENDING (not rendered) |
| DRW-06 | Open full report | PENDING (not rendered) |
| DRW-07 | Container member list (from Overview) + Back | READ-ONLY |

Status totals: LIVE 56 (19 action controls + 37 fields), PENDING 8, READ-ONLY 30 (one of them,
NAV-03, is a session action rather than configuration), WIRED-NO-UI 4. Total 98.

A binding-coverage table (all 52 manifest bindings in this slice) and a per-TRD drift summary follow the
items.

---

## Cross-cutting facts (apply to every item below)

### X-1 Who can use these controls (gating)
- SPA: no control in this slice is hidden or disabled by role or tier. The SPA's operator record carries
  only `subject`, `tier`, `email` (forgecentral/apps/console/src/auth/api.ts:10-14), and no surface file in
  this slice reads role or tier (grep of apps/console/src/surfaces, shell/DrawerHost.tsx,
  packages/design/src/components/EntityDrawer.tsx for useSession/operator.tier/.role found only unrelated
  display fields). Every signed-in operator sees every control below.
- BFF: every route in this slice checks only (a) a live session -> else 401 `unauthorized`, and (b) that
  its backend seam exists (the engine facade -> else 503 `engine_unavailable`; the signer port for
  distribute; the sidecar secret port for the IdAM secret write). There is no role or tier check on any
  governance route. The one role check in server.ts is `GET /api/settings/console-rbac`
  (forgecentral/apps/bff/src/server.ts:2102-2120), outside this slice.
- The manifest's `authz` strings (`operator:vtz.author`, `operator:policies.author`,
  `operator:objects.manage`, `operator:users.manage`, `operator:contain`, `operator:vtz.reassign`, ...)
  are labels only: the field is declared at forgecentral/packages/contracts/src/binding.ts:47-48 and no code
  outside the manifest reads it (grep for `authz` over apps/ and packages/ src finds only binding.ts).
- What the engine is told: the OperatorEngine injects `operator = { principal, tenant }` on every
  governance request (forgecentral/apps/bff/src/engine/operator-engine.ts:1023-1026 vtzCreate, :897-900
  policyCreate, :739-742 idamConnect, :977-983 contain). The operator's EXPLAIN tier is written only to the
  BFF delegation log line, never to the wire; `settings_tier` is added only on Settings calls for a
  global admin (forgecentral/apps/bff/src/engine/principal.ts:48-61; wire shape
  forgecentral/packages/contracts/src/generated/wire-dto.ts:28-32).
- Engine context (engine census owns it): a delegated session keeps the Console PEER's tier as the
  ceiling (crucible/crates/cdb-server/src/handler.rs:2296-2301), and the provisioning admission used by
  object/policy/principal/group and IdAM commands is delegation + tenant only
  (crucible/crates/cdb-server/src/handler.rs:2561-2569; IdAM uses at :2599, 2633, 2668, 2726).
- Net, by code reading: any signed-in operator whose Console role resolves (global-admin, tenant-admin or
  tenant-user) can use every create/edit/delete/publish/distribute/connect/sync/isolate control in this
  slice, within their tenant.
- Role and tier resolution: IdAM groups -> role (highest wins), local map only when the token carries no
  group (forgecentral/apps/bff/src/auth/rbac.ts:45-82); role -> tier: global-admin Admin, tenant-admin
  Admin, tenant-user User (forgecentral/apps/bff/src/auth/tier.ts:33-37).

### X-2 Tenant scope
Every call names one tenant: the session's. A global admin could override it per request with an
`x-active-tenant` header (forgecentral/apps/bff/src/server.ts:187-192;
forgecentral/apps/bff/src/engine/principal.ts:48-54), but the SPA never sends that header (grep of
apps/console/src for `x-active-tenant` finds nothing). So in the Console a global admin always acts in the
configured default tenant (forgecentral/apps/bff/src/auth/rbac.ts:76-78).

### X-3 Request limits and refusal shapes
- Command bodies are capped at 8,192 bytes (forgecentral/apps/bff/src/server.ts:233, used by every
  command handler in this slice) except distribute (64 KiB, forgecentral/apps/bff/src/server.ts:968). Over-limit or invalid JSON ->
  400 `malformed_request` (forgecentral/apps/bff/src/server.ts:236-247).
- Engine refusals carry a class, never a message. Command routes for users, objects, policies, IdAM:
  Conflict -> 409, Framing -> 400, anything else -> 403 (forgecentral/apps/bff/src/server.ts:1205-1209, 1367-1370, 1906-1909, 1974-1979, 2498-2502,
  2546-2550). VTZ mutations use their own mapping (see VTZ-05); read routes return 403 for any engine refusal. Any
  other failure -> 502 `engine_error`.
- The SPA turns HTTP status into fixed copy per surface (quoted per item). No request id is shown
  anywhere in this slice.

### X-4 Freshness
- BFF projection cache: in-memory, default TTL 2,000 ms (forgecentral/apps/bff/src/config.ts:49; env
  `FC_CACHE_TTL_MS`, forgecentral/apps/bff/src/config.ts:207). Cached: Overview sankey/members/connections (forgecentral/apps/bff/src/server.ts:595-607,
  681-691, 737-751), VTZ tree/detail (forgecentral/apps/bff/src/server.ts:811-839), policies list/detail (forgecentral/apps/bff/src/server.ts:1793-1810).
  Dropped on write: the tenant's VTZ entries after any VTZ mutation (forgecentral/apps/bff/src/server.ts:1072), the tenant's policy
  entries after any policy command (forgecentral/apps/bff/src/server.ts:1901). Never cached: VTZ convergence (forgecentral/apps/bff/src/server.ts:809-811);
  objects, users, groups, IdAM (their handlers make no cache calls).
- SPA: queries retry once and are stale after 5 s; mutations never retry
  (forgecentral/apps/console/src/query/client.ts:11-18). Successful mutations invalidate the matching reads
  (per item).

### X-5 Navigation into the drawer
The entity drawer (DRW-*) is reachable from: a Users table row, an Objects card name, a member of an
Overview container, and a Logs row / EXPLAIN "View <id>" (Logs is another slice). It is never opened for a
VTZ (see DRW-01).

---

## A. Navigation and shell

### NAV-01 Primary navigation rail (nine destinations)
- Location: every page > left rail (landmark `nav`, aria-label "Primary"), below the YouSource logo and
  the environment badge.
- Configures: nothing. Navigation only; each entry is a route link that marks the active page.
- Binding: none (IA data, not an engine read).
- BFF route: none (client routes; the BFF serves the SPA for any unmatched GET when `FC_SPA_DIST` is set,
  forgecentral/apps/bff/src/server.ts:2704-2708; forgecentral/apps/bff/src/config.ts:214).
- Engine op: none.
- Fields: the entries, in order, label -> path -> surface rendered:
  1. "Overview" -> `/` -> OverviewSurface
  2. "Virtual Trust Zones" -> `/vtz` -> VtzSurface
  3. "Users" -> `/users` -> UsersSurface
  4. "Objects" -> `/objects` -> ObjectsSurface
  5. "Policies" -> `/policies` -> PoliciesSurface
  6. "SOC Ops" -> `/soc-ops` -> SocOpsSurface (another slice)
  7. "Reports" -> `/reports` -> ReportsSurface (another slice)
  8. "Logs" -> `/logs` -> LogsSurface (another slice)
  9. "Settings" -> `/settings` -> SettingsSurface (another slice)
  Every one of the nine has a real surface element; none currently renders the placeholder (NAV-02). The
  top-bar title is the active destination's label. Each destination also defines a two-letter `short`
  glyph (e.g. "Vz") for a collapsed rail, but NavRail renders only the full label (the glyph is unused;
  grep for `.short` in apps/console/src finds no reader).
- Applies: immediately (client routing).
- Gating: none (every signed-in operator sees all nine).
- Preconditions and disabled states: shown only after sign-in (the app root renders Login otherwise,
  forgecentral/apps/console/src/App.tsx:37-45).
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/shell/NavRail.tsx:12-37;
  forgecentral/apps/console/src/ia/destinations.ts:21, 33-43; forgecentral/apps/console/src/routing/routes.tsx:25-40, 59-72;
  forgecentral/apps/console/src/shell/Shell.tsx:18-35; forgecentral/apps/console/src/test/contract/no-stub.test.tsx:49-59.
- TRD drift: TRD-CONSOLE-00 Section 5.1 lists ELEVEN destinations incl. "Agent Ops" and "Network Ops"
  (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:256-263); the code removed both on 2026-09-24 (crdb C.9)
  rather than ship placeholders (forgecentral/apps/console/src/ia/destinations.ts:30-32). TRD-00 puts the
  account menu at the rail bottom (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:262-263); the code puts it top-right in the top bar
  (forgecentral/apps/console/src/shell/TopBar.tsx:65-75). TRD-00 says the nav collapses to icons (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:431-432);
  no collapse glyph is rendered (see above).

### NAV-02 Unknown routes and the placeholder surface
- Location: any URL with no destination; any destination without a real surface.
- Configures: nothing.
- Binding: none.
- BFF route: none.
- Engine op: none.
- Fields: n/a. An unknown path renders "That destination does not exist" / "No surface is mapped to
  <path>." with a "Go to Overview" link. The generic placeholder (title "No <label> data yet", hint "This
  surface ships its live bindings in its own phase. ...") and its home-only "Open entity drawer" button
  (which opens a generic drawer reading "Entity detail lands with the entity drawer surface. No data is
  shown here yet.") are unreachable today because all nine destinations map to a real surface.
- Applies: n/a.
- Gating: none.
- Preconditions and disabled states: n/a.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/routing/routes.tsx:42-58, 66, 69;
  forgecentral/apps/console/src/surfaces/SurfacePlaceholder.tsx:15-47;
  forgecentral/apps/console/src/shell/DrawerHost.tsx:219-225.
- TRD drift: none found for this slice.

### NAV-03 Account menu (identity, tier badge, Sign out)
- Location: every page > top bar, right > the button showing the operator's email (or OIDC subject) and a
  tier badge; opens a menu with the subject and "Sign out".
- Configures: ends the operator's Console session (not a configuration).
- Binding: none in the manifest (auth plane).
- BFF route: POST /auth/logout (the auth router, forgecentral/apps/bff/src/auth/router.ts:8, 243; outside this slice).
- Engine op: none.
- Fields: read-only display of the EXPLAIN tier (User / Developer / Admin / SecurityAudit). The Console
  role (global-admin / tenant-admin / tenant-user) is never shown to the operator (the operator record has
  no role field, forgecentral/apps/console/src/auth/api.ts:10-14).
- Applies: immediately; the SPA drops the cached identity and shows the login screen.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: the session is cleared client-side on settle either way
  (forgecentral/apps/console/src/auth/useSession.ts:36-43).
- Evidence: forgecentral/apps/console/src/shell/TopBar.tsx:27-58; forgecentral/apps/console/src/auth/useSession.ts:36-43.
- TRD drift: TRD-00 Section 5.1 places the account menu at the bottom of the rail (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:262-263).

### NAV-04 Live indicator and environment badge
- Location: top bar > "Live" / "Not live" badge; left rail top > environment badge.
- Configures: nothing (read-only status).
- Binding: none directly; "Live" reflects the shared live-store that the Overview poll drives (OV-06).
- BFF route: none.
- Engine op: none.
- Fields: "Live" (good) when the live-store is live; otherwise "Not live" (caution when stale, neutral
  otherwise) with the reason as a tooltip. The environment badge shows the build-time `VITE_FC_ENV`
  value, default "development"; "production" renders good, anything else caution.
- Applies: n/a.
- Gating: none.
- Preconditions and disabled states: only the Overview drives the live-store; leaving the Overview resets
  it, so every other page shows "Not live" (forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:88-97).
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/shell/TopBar.tsx:14-25; forgecentral/apps/console/src/shell/Brand.tsx:9-12, 41-45.
- TRD drift: TRD-00 Section 7 / TRD-01 Section 3 expect a real stream; the code polls (see OV-06).

---

## B. Overview (`/`)

The Overview has no configuration controls. Everything on it is read-only, a client-side view control,
or navigation. It is recorded because the manual must explain what the operator sees and where each
click leads.

### OV-01 Overview header status (risk, Live, Partial graph, stale banner)
- Location: Overview > header, right of the "Overview" heading.
- Configures: nothing (read-only).
- Binding: `overview.graph` (read, LIVE, op `connectivity_graph_v1`).
- BFF route: GET /api/overview/sankey -> handleOverview -> serveOverviewRead -> resolveOverviewSankey
  (forgecentral/apps/bff/src/server.ts:628-649, 576-620; forgecentral/apps/bff/src/engine/overview.ts:67-74).
- Engine op: `ConnectivityGraph` (forgecentral/apps/bff/src/engine/wire-client.ts:1206;
  forgecentral/packages/wire/src/dispatch.ts:33).
- Fields: "Risk: Nominal" (green) / "Risk: Elevated" (yellow) / "Risk: Critical" (red) = the WORST risk
  band across the graph's zones (no badge when there are no zones); "Live" when the last poll succeeded;
  "Partial graph" when the engine reports its edge scan hit the ceiling; a stale banner when a poll
  failed but a last-known graph is still shown. Request bound: limit 10,000 (no time window control).
- Applies: refreshed every 2 s (OV-06).
- Gating: none (X-1).
- Preconditions and disabled states: badges appear only once data has loaded.
- Failure states: no data + error -> "Could not load the connectivity graph." with retry; a refused
  read -> 403, an un-colorable graph -> 503, other -> 502 (forgecentral/apps/bff/src/server.ts:609-619).
- Evidence: forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:42, 45-66, 99-124, 150-155;
  forgecentral/packages/bindings/src/manifest.ts:224-230.
- TRD drift: TRD-CONSOLE-01 describes each VTZ as a 0-100 Trust Score ring
  (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:23-25, 41-44, 60-61, 105); the score was removed (manifest
  comment forgecentral/packages/bindings/src/manifest.ts:216-217) but TRD-01 was never amended (TRD-02 and
  TRD-04 were). TRD-01 promises an empty-state line "No connectivity observed in this window" with a
  time-range hint (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:95); there is no time-range control in the code.

### OV-02 Trust-zone pager (Previous zones / More zones)
- Location: Overview > above the graph (shown only when there is more than one page of zones).
- Configures: nothing (client-side view; the graph shows at most three zones per page).
- Binding: none beyond `overview.graph`.
- BFF route: none.
- Engine op: none.
- Fields: "Previous zones" (disabled on page 1), "Zones <n> of <total>", "More zones" (disabled on the
  last page).
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: hidden when all zones fit on one page.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:100-102, 126-148.
- TRD drift: TRD-01 does not describe paging; it describes "Top tabs -- All / Users / Devices / AI Agents"
  and "View 1 / View 2" saved views (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:68-72), neither of which exists in code.

### OV-03 Hover-to-filter
- Location: Overview > graph > hover a destination category or a source.
- Configures: nothing (client-side highlight; no data re-read).
- Binding: none.
- BFF route: none.
- Engine op: none.
- Fields: n/a.
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: pointer only; the keyboard/screen-reader path is the container
  button list (OV-04).
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:71-72, 157-164.
- TRD drift: TRD-01 Section 4.1 says hover shows the entity + count + Trust Score and prefetches the drawer
  (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:59-61); the code filters flows and does not prefetch a drawer from the graph.

### OV-04 Open a container's members
- Location: Overview > click a source lane (AI Agents, Users, Devices) or a destination ring (Network,
  SaaS Apps, Private Apps, Data Stores); keyboard: the buttons "Open <label> members (<n> connection(s))".
- Configures: nothing. Opens the drawer in list mode (DRW-07).
- Binding: `overview.graph` for the counts; the list itself is an unregistered read (see DRW-07).
- BFF route: GET /api/overview/members?container=<id> -> serveClassMembers -> resolveClassMembers
  (forgecentral/apps/bff/src/server.ts:644-647, 715-766; forgecentral/apps/bff/src/engine/overview.ts:159-178).
- Engine op: `ConnectivityMembers` (forgecentral/apps/bff/src/engine/wire-client.ts:1217; forgecentral/packages/wire/src/dispatch.ts:36).
- Fields: container ids `agents`, `users`, `devices`, `network`, `saas`, `private-apps`, `data-stores`.
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: see DRW-07.
- Evidence: forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:29-37, 165-167;
  forgecentral/packages/design/src/components/OverviewSankeyFlow.tsx:702-723.
- TRD drift: TRD-01 says clicking an entity opens the entity drawer directly (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:62-67) and lists
  destination classes "Websites, SaaS Apps, Private Apps, Data Stores, Servers" (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:26-27); the code
  opens a member LIST first (one extra click before any entity action) and its rings are Network, SaaS Apps,
  Private Apps, Data Stores. TRD-10 says clicking a destination class "scopes to those objects"
  (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:87); it opens connectivity members, not the Objects catalog.

### OV-05 Open a trust zone (ring -> VTZ Configure)
- Location: Overview > click a VTZ in the middle column; keyboard: "Open trust zone <name>".
- Configures: nothing. Navigates to `/vtz?zone=<id>` (VTZ-04).
- Binding: none.
- BFF route: none.
- Engine op: none.
- Fields: n/a.
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: if the Overview zone id is not a zone in the VTZ store, the VTZ
  surface shows "Select a zone to configure" (forgecentral/apps/console/src/surfaces/VtzSurface.tsx:211, 332-336). UNVERIFIED: whether the
  Overview's zones (engine-routed "demo VTZs", forgecentral/apps/console/src/surfaces/useOverview.ts:51-53)
  always carry VTZ-store ids; checked only the FC side.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/OverviewSurface.tsx:168-172;
  forgecentral/packages/design/src/components/OverviewSankeyFlow.tsx:725-735.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:73-74, forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:74, 100 match), except TRD-01 calls it a "score ring".

### OV-06 Live refresh (2 s poll) / push stream `overview.live`
- Location: Overview (implicit).
- Configures: nothing operator-settable.
- Binding: `overview.live` (read, PENDING; owning repo crdb; gating task "IP-CONSOLE-READINESS Part B
  (bounded connectivity SUBSCRIBE push stream)").
- BFF route: none for the stream; the poll re-reads GET /api/overview/sankey.
- Engine op: `ConnectivityGraph` (poll).
- Fields: poll interval 2,000 ms (constant); first paint reads 50 nodes then escalates to 10,000.
- Applies: n/a.
- Gating: none.
- Preconditions and disabled states: n/a.
- Failure states: a failed tick keeps the last graph and shows the stale banner (OV-01).
- Evidence: forgecentral/packages/bindings/src/manifest.ts:241-254;
  forgecentral/apps/console/src/surfaces/useOverview.ts:19, 27, 55-92.
- TRD drift: TRD-01 Section 3 specifies a real stream (`overview.live`, < 2 s) that "never full-refetches
  on a tick" (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:48-50, 87-88); the code full-refetches every 2 s.

---

## C. Virtual Trust Zones (`/vtz`)

Surface model (from code): a VTZ is the policy EDGE -- a named target that policies are authored against
on the Policies surface. This surface authors a zone's identity, nesting and operational settings; it
authors no posture (forgecentral/apps/console/src/surfaces/VtzEditor.tsx:5-10;
forgecentral/packages/contracts/src/vtz.ts:353-358). Two tabs: "Active" (grid) and "Configure" (editor).

### VTZ-01 Active zone grid and zone card (incl. risk band)
- Location: Virtual Trust Zones > Active > the zone cards.
- Configures: nothing (read-only). Clicking a card selects the zone and switches to Configure (VTZ-04).
- Binding: `vtz.tree` (read, LIVE, op `vtz_tree_v1`); `vtz.riskBand` (read, LIVE, op
  `connectivity_graph_v1`, a join by zone id); `vtz.memberCounts` and `vtz.policyCount` are PENDING
  (VTZ-09, VTZ-10).
- BFF route: GET /api/vtz/tree?limit=500 -> handleVtz -> resolveVtzTree
  (forgecentral/apps/bff/src/server.ts:782-852; forgecentral/apps/bff/src/engine/vtz.ts:67-83). Risk band: GET
  /api/overview/sankey?limit=10000 (forgecentral/apps/console/src/surfaces/useVtzTree.ts:74, 82-87).
- Engine op: `VtzTree` (forgecentral/apps/bff/src/engine/wire-client.ts:1268;
  forgecentral/packages/wire/src/dispatch.ts:49); `ConnectivityGraph` for the risk band.
- Fields (card): leaf name over its dotted path; archetype badge "Standard" / "Quarantine" / "Isolation" /
  "Public" / "Observability"; risk badge "Nominal" / "Elevated" / "Critical" -- ABSENT when no decision
  drives a band (never a default green); "Draft" badge for a draft zone; "Sub-zones" (real engine count
  of direct children); "Members" and "Policies" read "Not available" with a tooltip (VTZ-09, VTZ-10);
  footer "Root zone" or "Inherits from <parent>". Tree bound: the SPA asks 500; the BFF defaults to 200
  when absent and clamps to 500 (forgecentral/apps/bff/src/engine/vtz.ts:57, 60;
  forgecentral/apps/bff/src/server.ts:864-870); an engine-side ceiling sets `truncated` -> header badge
  "Partial tree".
- Applies: re-read on mount and after any VTZ mutation; not polled (forgecentral/apps/console/src/surfaces/useVtzTree.ts:45-55).
- Gating: none (X-1).
- Preconditions and disabled states: "Loading trust zones"; empty tenant: "No trust zones yet" / "The
  engine holds no trust zone for this tenant yet. Use New zone to author the first one."
- Failure states: first load fails -> "Could not load the trust zones." + retry. BFF 503 when ANY zone
  carries an enum tag the Console does not know (the whole tree is withheld, fail-closed), 403 on an
  engine refusal, 502 otherwise (forgecentral/apps/bff/src/server.ts:840-850; forgecentral/apps/bff/src/engine/vtz.ts:78-81).
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:42-61, 199-213, 223, 276-318;
  forgecentral/packages/design/src/components/VtzZoneCard.tsx:61-165;
  forgecentral/packages/bindings/src/manifest.ts:269-328.
- TRD drift: TRD-02 describes an "explorable grid/tree" whose zones "expand in place" into posture,
  members, boundary and policies (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:49-50, 69); the code is a flat
  card grid and the click opens only the settings editor.

### VTZ-02 KPI tiles: Total VTZs, High-sensitivity zones
- Location: Virtual Trust Zones > KPI row under the header.
- Configures: nothing (read-only).
- Binding: `vtz.tree` (derived).
- BFF route / Engine op: as VTZ-01.
- Fields: "Total VTZs" = number of zones returned; "High-sensitivity zones" = zones whose EFFECTIVE
  posture denies at least one domain that the engine did NOT flag as catastrophic floor. Both read "--"
  until the tree loads.
- Applies: with the tree.
- Gating: none.
- Preconditions and disabled states: n/a.
- Failure states: "--" when the tree is unavailable.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:63-76, 238-244.
- TRD drift: TRD-02 does not define this KPI (it struck "Avg Trust"). UNVERIFIED: how many Console-created
  zones count as high-sensitivity -- the engine leaves unauthored domains ABSENT from the composed map
  (crucible/crates/cdb-types/src/forge_v2.rs:1493-1513) and I did not check how VTZ_TREE projects absent
  domains into rows.

### VTZ-03 Search zones
- Location: Virtual Trust Zones > Active > "Search zones" (placeholder "zone name").
- Configures: nothing (client-side view over the complete tree).
- Binding / BFF route / Engine op: none beyond VTZ-01.
- Fields: case-insensitive substring match on the dotted name; while non-blank shows "Showing <n> of
  <total> zone(s)"; no match -> "No zones match" / "No zone name contains "<text>"."
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:78-86, 258-291.
- TRD drift: TRD-02 does not describe search.

### VTZ-04 Configure tab, zone selection, `?zone=` deep link
- Location: Virtual Trust Zones > "Configure" tab.
- Configures: nothing by itself; hosts the editor (VTZ-05..VTZ-08).
- Binding: `vtz.detail` (read, LIVE, op `vtz_detail_v1`).
- BFF route: GET /api/vtz/detail?id=<zone> -> handleVtz -> resolveVtzDetail (400 `bad_request` without an
  id) (forgecentral/apps/bff/src/server.ts:802-806, 834-837; forgecentral/apps/bff/src/engine/vtz.ts:91-107).
- Engine op: `VtzDetail` (forgecentral/apps/bff/src/engine/wire-client.ts:1289; forgecentral/packages/wire/src/dispatch.ts:50).
- Fields: selection comes from a card click or from `?zone=<id>` (the Overview ring, OV-05), which opens
  Configure with that zone preselected.
- Applies: n/a.
- Gating: none.
- Preconditions and disabled states: nothing selected -> "Select a zone to configure" / "Pick a zone on
  the Active tab to see the posture it set and the posture that applies." Detail loading -> "Loading the
  zone configuration". Zone vanished -> "That zone no longer exists" / "The engine holds no zone named
  <id>. It may have been deleted or re-scoped."
- Failure states: "Could not load the zone configuration." + retry.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:102-158, 190-197, 246-254, 332-350.
- TRD drift: the empty-state hint promises "the posture it set and the posture that applies", but the
  editor renders no posture (VTZ-11); stale copy inside the code as well as vs forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:72-73.

### VTZ-05 Create a zone (New zone -> Create zone)
- Location: Virtual Trust Zones > header > "New zone" -> Configure tab, "New trust zone" > "Create zone" ->
  confirm "Create <dotted name>?" -> "Commit".
- Configures: adds a new trust zone (a policy target) to the tenant's VTZ system of record.
- Binding: `vtz.create` (command, LIVE, op `vtz_create_v1`, authz label `operator:vtz.author`, audited).
- BFF route: POST /api/vtz -> handleVtzCommand -> parseVtzCommand (`toVtzSpecInput`) -> resolveVtzCreate
  (forgecentral/apps/bff/src/server.ts:909-912, 1023-1088; forgecentral/apps/bff/src/engine/vtz.ts:191-200).
- Engine op: `VtzCreate` { request_id: 0, operator: {principal, tenant}, spec: WireVtzSpec }
  (forgecentral/apps/bff/src/engine/wire-client.ts:1310; forgecentral/packages/wire/src/dispatch.ts:53; forgecentral/packages/wire/src/payload.ts:1028;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:1689-1698 for the spec).
- Fields: VTZ-F1..VTZ-F8. Body = { name, description, zoneType, ownPostures: [] (always empty from this
  surface), microSegmentation, telemetry, reauthIntervalHours, lifecycle }
  (forgecentral/apps/console/src/surfaces/VtzEditor.tsx:184-197). BFF narrowing is total and fail-closed: any
  missing/mistyped field or unknown tag -> 400 (forgecentral/packages/contracts/src/vtz.ts:402-445).
- Applies: on commit (audited). SPA invalidates the tree and the zone's detail; BFF drops the tenant's VTZ
  cache (forgecentral/apps/bff/src/server.ts:1071-1072; forgecentral/apps/console/src/surfaces/useVtzMutation.ts:139-152). The new zone becomes the selection.
- Gating: no role/tier check (X-1). Confirm: title "Create <dotted name>?", description "This is an
  audited change to the trust-zone system of record, attributed to you.", confirm "Commit" (default
  tone), "Cancel" (focused by default).
- Preconditions and disabled states: "New zone" is disabled until the tree has loaded (also after a
  failed first load). "Create zone" is disabled while a command is in flight or while the composed name
  is empty; every input disables while in flight. "Cancel" abandons the create.
- Failure states (one red line above the form, role=alert):
  - BFF 400 -> "That zone definition was rejected before it reached the engine. Nothing was committed."
  - engine Conflict -> 409 -> "The engine refused this change: the zone already exists, no longer exists,
    or still has sub-zones. Nothing was committed. Re-read the tree and try again."
  - engine Denied -> 403 {reason: denied} -> "The engine refused this change: it contradicts a rule the
    platform enforces on every zone. Nothing was committed."
  - engine Framing (e.g. a name the engine's VtzName rules reject) is not a classified VTZ refusal: the
    BFF returns 403 {class: "Framing"} with no `reason` (forgecentral/apps/bff/src/server.ts:1080-1081; forgecentral/apps/bff/src/engine/vtz.ts:162-167) and the SPA
    therefore shows the "contradicts a rule the platform enforces on every zone" line
    (forgecentral/apps/console/src/surfaces/useVtzMutation.ts:57-60) -- misleading copy, by code reading.
  - 502/503/network -> "The zone could not be reached. Nothing was committed." Note: a 503 is also
    returned when the write LANDED but the reply carried an unknown lifecycle tag (forgecentral/apps/bff/src/engine/vtz.ts:181-186), in
    which case "Nothing was committed" is untrue.
  - No auto-retry (retry: false, forgecentral/apps/console/src/surfaces/useVtzMutation.ts:143).
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:160-186, 224-235, 320-331;
  forgecentral/apps/console/src/surfaces/VtzEditor.tsx:66-80, 145-205, 360-410;
  forgecentral/apps/console/src/surfaces/useVtzMutation.ts:25-81, 109-116;
  forgecentral/packages/bindings/src/manifest.ts:330-341.
- TRD drift: TRD-02 says create/edit author "name, parent, default posture, boundary, risk rules" and
  shows an effective-posture preview and diff before save (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:58-60, 77-79, 98-99). The code authors
  no posture, boundary or risk rules and has no preview (removed 2026-07-19,
  forgecentral/packages/contracts/src/vtz.ts:447-452); it authors type, description, session duration,
  telemetry, micro-segmentation and lifecycle, none of which TRD-02 lists.

### VTZ-06 Save changes to a zone (settings edit)
- Location: Virtual Trust Zones > Configure (a zone selected) > edit fields > "Save changes" -> confirm
  "Save changes to <zone>?" -> "Commit".
- Configures: REPLACES the zone's stored definition (type, description, session duration, telemetry,
  micro-segmentation, lifecycle); a Draft -> Published change is committed here.
- Binding: `vtz.edit` (command, LIVE, op `vtz_edit_v1`, authz label `operator:vtz.author`, audited).
- BFF route: PUT /api/vtz/<id> -> handleVtzCommand -> parseVtzCommand -> resolveVtzEdit. The `<id>` in the
  path is IGNORED: the zone is identified by `spec.name` (forgecentral/apps/bff/src/server.ts:913-916;
  forgecentral/apps/bff/src/engine/vtz.ts:202-212).
- Engine op: `VtzEdit` { request_id: 0, operator, spec } (forgecentral/apps/bff/src/engine/wire-client.ts:1320; forgecentral/packages/wire/src/dispatch.ts:54). The engine
  replaces the record and refuses a name it does not hold (crucible/crates/cdb-cyber/src/vtz_store.rs:302-322).
- Fields: VTZ-F2, VTZ-F4..VTZ-F8 (changing VTZ-F1 or VTZ-F3 turns the Save into a move, VTZ-07).
- Applies: on commit; tree and detail re-read.
- Gating: no role/tier check (X-1). Confirm: title "Save changes to <zone>?", description "This is an
  audited change to the trust-zone system of record, attributed to you.", confirm "Commit".
- Preconditions and disabled states: see VTZ-04 load states; "Save changes" disabled while in flight or
  when the name is empty. The Description field starts BLANK in edit mode (the engine does not return the
  stored value) and says "The engine does not return the stored description, so saving replaces it." --
  every Save overwrites the stored description with whatever is in the field.
- Failure states: as VTZ-05.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:136-157;
  forgecentral/apps/console/src/surfaces/VtzEditor.tsx:157-167, 285-293, 386-410;
  forgecentral/apps/console/src/surfaces/useVtzMutation.ts:117-120;
  forgecentral/packages/bindings/src/manifest.ts:342-351.
- TRD drift: as VTZ-05; TRD-02 has no description, lifecycle, telemetry, session or micro-segmentation
  settings.

### VTZ-07 Move or rename a zone (parent / name change on Save)
- Location: Virtual Trust Zones > Configure > change "Parent VTZ (optional)" and/or the "VTZ name" leaf >
  "Save changes" -> confirm "Save <zone> and move it to <new dotted name>?" -> "Commit".
- Configures: the zone's place in the hierarchy. The dotted name IS the hierarchy, so a move is a rename;
  a zone's inherited posture depends on its place.
- Binding: `vtz.edit` then `vtz.rescope` (command, LIVE, op `vtz_rescope_v1`, authz label
  `operator:vtz.author`, audited).
- BFF route: PUT /api/vtz/<old id> (edit), then POST /api/vtz/<old id>/rescope { newName } ->
  resolveVtzRescope (forgecentral/apps/bff/src/server.ts:876, 885-908;
  forgecentral/apps/bff/src/engine/vtz.ts:219-233).
- Engine op: `VtzEdit`, then `VtzRescope` { request_id: 0, operator, vtz_id, new_name }
  (forgecentral/apps/bff/src/engine/wire-client.ts:1330; forgecentral/packages/wire/src/dispatch.ts:55; forgecentral/packages/contracts/src/generated/wire-dto.ts:1682-1687).
- Fields: newName = the composed parent + "." + leaf; BFF requires a non-blank string (trimmed).
- Applies: two audited writes -- settings first, then the move -- so the moved record carries the new
  settings. On success the selection follows the new id.
- Gating: no role/tier check (X-1). Confirm title "Save <zone> and move it to <new name>?", description
  "This is an audited change to the trust-zone system of record, attributed to you. Moving the zone
  changes its full name and the posture it inherits; it is recorded as a separate audited write from the
  settings.", confirm "Commit".
- Preconditions and disabled states: the Parent select is disabled when the zone has sub-zones, with the
  note "This zone has sub-zones, so the engine refuses to move it -- moving it would orphan them.
  Re-parent or remove them first." The VTZ name input is NOT disabled in that case, so a rename is still
  offered. Parent options exclude the zone itself and its descendants.
- Failure states: DEFECT, by code reading -- the first (edit) call carries `spec.name` = the NEW composed
  name (forgecentral/apps/console/src/surfaces/VtzEditor.tsx:184-187, 203) on PUT /api/vtz/<old id>; the BFF edits by `spec.name`, the engine finds
  no zone by that name and refuses NotFound as Conflict
  (crucible/crates/cdb-cyber/src/vtz_store.rs:313-315; crucible/crates/cdb-server/src/handler.rs:6744-6749) ->
  BFF 409 -> "The engine refused this change: the zone already exists, no longer exists, or still has
  sub-zones. Nothing was committed. Re-read the tree and try again." The rescope call is never made
  (forgecentral/apps/console/src/surfaces/useVtzMutation.ts:117 throws first). So neither the settings nor the move commit. The UI test for this
  path stubs every mutation as a success and does not assert the PUT body's name
  (forgecentral/apps/console/src/test/vtz-surface.test.tsx:402-431). Not observed at runtime. If the edit
  succeeded and only the move failed, the SPA would say "The settings were committed; the zone was NOT
  moved and stays where it was." (forgecentral/apps/console/src/surfaces/VtzEditor.tsx:66-69; forgecentral/apps/console/src/surfaces/useVtzMutation.ts:121-130).
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:170-182, 252-273, 393-405;
  forgecentral/apps/console/src/surfaces/useVtzMutation.ts:91-131;
  forgecentral/packages/bindings/src/manifest.ts:352-362.
- TRD drift: TRD-02 frames re-scope as "edit boundary/posture + save (confirm-gated with the
  effective-posture diff shown)" (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:70-71); the code re-scopes by parent/name only, with no diff.

### VTZ-08 Delete zone
- Location: Virtual Trust Zones > Configure (a zone selected) > "Delete zone" -> confirm "Delete <zone>?"
  -> "Delete".
- Configures: removes the zone from the VTZ system of record (engine doc: tombstone + audit entry,
  crucible/crates/cdb-server/src/handler.rs:7059-7061).
- Binding: `vtz.delete` (command, LIVE, op `vtz_delete_v1`, authz label `operator:vtz.author`, audited).
- BFF route: DELETE /api/vtz/<id> -> handleVtzCommand -> parseVtzCommand -> resolveVtzDelete
  (forgecentral/apps/bff/src/server.ts:873, 918-920; forgecentral/apps/bff/src/engine/vtz.ts:236-245).
- Engine op: `VtzDelete` { request_id: 0, operator, vtz_id } (forgecentral/apps/bff/src/engine/wire-client.ts:1340; forgecentral/packages/wire/src/dispatch.ts:56;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:1640-1644).
- Fields: none (the zone id).
- Applies: on commit; selection cleared and the Active tab shown.
- Gating: no role/tier check (X-1). Confirm: title "Delete <zone>?", description "This is an audited change
  to the trust-zone system of record. The engine refuses to delete a zone that still has sub-zones.",
  confirm "Delete" (critical tone).
- Preconditions and disabled states: offered for every zone, the root included ("Nothing is a root by
  privilege", forgecentral/apps/console/src/surfaces/VtzEditor.tsx:12-15); disabled while in flight.
- Failure states: a zone with sub-zones -> engine Conflict -> 409 -> the conflict line (VTZ-05); others as
  VTZ-05. UNVERIFIED: what happens to policies still scoped to a deleted zone (engine-side; not checked).
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:154, 344-347;
  forgecentral/apps/console/src/surfaces/VtzEditor.tsx:374-383, 386-410;
  forgecentral/apps/console/src/surfaces/useVtzMutation.ts:113-116; forgecentral/packages/bindings/src/manifest.ts:363-373.
- TRD drift: TRD-02 never mentions deleting a zone; the code ships it (LIVE).

### VTZ-F1 VTZ name
- Location: Virtual Trust Zones > Configure > "VTZ name" (text, placeholder "reps"), with the note
  "Commits as <dotted name>".
- Configures: the zone's own label (leaf). Parent + leaf = the dotted name = the zone's identity AND its
  place in the hierarchy (e.g. parent `Demo.sales` + leaf `reps` commits as `Demo.sales.reps`).
- Binding: travels on `vtz.create` / `vtz.edit` / `vtz.rescope`.
- BFF route / Engine op: VTZ-05 / VTZ-06 / VTZ-07 (`spec.name` / `new_name`).
- Fields: string. SPA: required (the composed name must be non-empty); leaf and parent are trimmed; no
  character or length check; a dot typed in the leaf adds hierarchy levels. BFF: non-blank string,
  trimmed (forgecentral/packages/contracts/src/vtz.ts:406, 436). Engine (reference only): max 255 bytes, max
  16 labels, each label 1-63 bytes of ASCII letters/digits/hyphens starting and ending with a letter or
  digit, labels case-folded to lower case (crucible/crates/cdb-types/src/forge_v2.rs:37-41, 100-118, 174-198).
  Default: blank (create); the zone's current leaf (edit).
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight. In edit mode a change is a move (VTZ-07).
- Failure states: see VTZ-05 (an engine-invalid name surfaces as the misleading "contradicts a rule"
  line). The "Commits as" preview shows the operator's casing; the engine lower-cases labels
  (crucible/crates/cdb-types/src/forge_v2.rs:197). UNVERIFIED: how the stored name renders back (checked only label validation).
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:82-102, 155-159, 179-182, 216-232.
- TRD drift: none specific.

### VTZ-F2 VTZ type (archetype)
- Location: Virtual Trust Zones > Configure > "VTZ type" (select) with a one-line hint under it.
- Configures: the zone's archetype tag (`zone_type`): which KIND of policy the zone is meant to receive.
  The code states it "grants nothing by itself" (forgecentral/packages/contracts/src/vtz.ts:77-85).
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06 (`spec.zone_type`).
- Fields: enum, default "Standard". Options and their rendered hints:
  - Standard -- "Takes general policy authored on the Policies surface."
  - Quarantine -- "Holds its members under restriction while a disposition is worked."
  - Isolation -- "Deny-all: the quick cut-off used to contain."
  - Public -- "The least-trusted edge; reserved for the future full-kernel policy."
  - Observability -- "Visibility first: an agent is fully onboarded and wrapped here, under a permissive
    (any/any) policy authored on the Policies surface."
  BFF: must be one of the five tags (forgecentral/packages/contracts/src/vtz.ts:193-205, 409-412).
- Applies: with the command; the card badge changes (VTZ-01).
- Gating: none.
- Preconditions and disabled states: disabled while in flight.
- Failure states: see VTZ-05.
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:41-58, 234-250.
- TRD drift: TRD-02 mentions an archetype only in the binding list (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:48-50) and never defines the
  five types. UNVERIFIED: whether any engine/Torch logic acts on `zone_type` (FC treats it as a badge).

### VTZ-F3 Parent VTZ (optional)
- Location: Virtual Trust Zones > Configure > "Parent VTZ (optional)" (select).
- Configures: the dotted prefix of the zone's name -> its parent zone, and so the ancestors whose
  postures it inherits (tighten-only).
- Binding: `vtz.create`; in edit mode `vtz.edit` + `vtz.rescope` (VTZ-07).
- BFF route / Engine op: as VTZ-05 / VTZ-07.
- Fields: first option "None (top-level zone)"; then every zone name (create: all zones; edit: all except
  the zone itself and its descendants). Note: "Nests this zone under the chosen parent. Leave as None for
  a stand-alone zone." Default: none (create); the current parent (edit).
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight, and in edit mode when the zone has
  sub-zones (note quoted in VTZ-07).
- Failure states: see VTZ-05 / VTZ-07.
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:170-177, 252-273.
- TRD drift: none specific.

### VTZ-F4 Description
- Location: Virtual Trust Zones > Configure > "Description" (text).
- Configures: the zone's free-text description.
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06 (`spec.description`).
- Fields: string, no SPA bound, BFF requires a string (may be empty) (forgecentral/packages/contracts/src/vtz.ts:407). Engine: max 1024
  bytes (`VTZ_DESCRIPTION_MAX_BYTES`, crucible/crates/cdb-types/src/forge_v2.rs:1735, checked in
  `TrustZoneRecord::new`, crucible/crates/cdb-types/src/forge_v2.rs:1870-1872, which the edit/create handler calls,
  crucible/crates/cdb-server/src/handler.rs:6716-6725); an over-long description fails as Framing, which the
  SPA shows as the misleading "contradicts a rule" line (VTZ-05). Default blank.
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight. Edit mode starts blank and warns "The
  engine does not return the stored description, so saving replaces it." The stored description is never
  displayed anywhere in the Console (the zone read has no description field).
- Failure states: see VTZ-05.
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:160-161, 275-293.
- TRD drift: TRD-02 has no description field.

### VTZ-F5 Session duration (hours)
- Location: Virtual Trust Zones > Configure > "Session duration (hours)" (number) with the note "How long
  before a member must log in again (1-24)."
- Configures: the zone's re-authentication interval (`reauth_interval_hours`).
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06.
- Fields: integer 1-24, default 8. SPA: `min`/`max` attributes only -- the editor is not a `<form>` and its
  buttons are type=button, so the browser does not enforce them; the value is `Number(input)`. BFF: must
  be an integer 1..24 else 400 (forgecentral/packages/contracts/src/vtz.ts:343-346, 413-421). Engine bounds
  1/24 (crucible/crates/cdb-types/src/forge_v2.rs:1726, 1729).
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight.
- Failure states: out of range, blank or fractional -> 400 -> "That zone definition was rejected before
  it reached the engine. Nothing was committed."
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:166, 295-312.
- TRD drift: not in TRD-02. UNVERIFIED: which component makes members log in again (FC only stores it).

### VTZ-F6 Telemetry mode
- Location: Virtual Trust Zones > Configure > "Telemetry mode" (select).
- Configures: the zone's `telemetry` value -- "How much telemetry the zone's members emit"
  (forgecentral/packages/contracts/src/vtz.ts:87-88).
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06.
- Fields: "Full" / "Sampled" / "Off" (tags full / sampled / off), default Full; no hint text. BFF: one of
  the three (forgecentral/packages/contracts/src/vtz.ts:207-210, 410-412).
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight.
- Failure states: see VTZ-05.
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:163, 314-327.
- TRD drift: not in TRD-02. UNVERIFIED: which component consumes it.

### VTZ-F7 Micro-segmentation
- Location: Virtual Trust Zones > Configure > "Micro-segmentation" (checkbox).
- Configures: the zone's `micro_segmentation` boolean.
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06.
- Fields: boolean, default checked; no hint text. BFF: must be a boolean (forgecentral/packages/contracts/src/vtz.ts:408).
- Applies: with the command.
- Gating: none.
- Preconditions and disabled states: disabled while in flight.
- Failure states: see VTZ-05.
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:165, 329-338.
- TRD drift: not in TRD-02. UNVERIFIED: its runtime meaning -- no FC code or comment explains it.

### VTZ-F8 Lifecycle (Draft / Published)
- Location: Virtual Trust Zones > Configure > "Lifecycle" (select).
- Configures: the zone's authoring lifecycle; "`draft` keeps the zone unpublished; `published` is a real
  state transition the engine commits" (forgecentral/packages/contracts/src/vtz.ts:368).
- Binding: `vtz.create` / `vtz.edit`.
- BFF route / Engine op: as VTZ-05 / VTZ-06.
- Fields: "Draft" / "Published", default Draft. BFF: one of the two (forgecentral/packages/contracts/src/vtz.ts:189-191, 411-412).
- Applies: with the command; a draft zone shows a "Draft" badge on its card.
- Gating: none.
- Preconditions and disabled states: disabled while in flight.
- Failure states: see VTZ-05. By code reading the engine rebuilds the record from the spec as Draft and
  publishes it only when the spec says Published (crucible/crates/cdb-server/src/handler.rs:6716-6728;
  crucible/crates/cdb-types/src/forge_v2.rs:1888), so Published -> Draft is accepted. The distribute path does
  not check zone lifecycle (forgecentral/apps/bff/src/engine/distribute.ts:106-149).
- Evidence: forgecentral/apps/console/src/surfaces/VtzEditor.tsx:164, 340-352;
  forgecentral/apps/console/src/surfaces/VtzSurface.tsx:304.
- TRD drift: TRD-02 lists "lifecycle" only as a read field (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:49).

### VTZ-09 Zone members (count and assignment)
- Location: Virtual Trust Zones > zone card > "Members: Not available" (tooltip "Zone membership is not
  stored by the engine yet.").
- Configures: would move entities into/out of a zone; not built.
- Binding: `vtz.memberCounts` (read, PENDING, owning repo crdb, gating task "IP-CONSOLE-VTZ-SUBSTRATE
  VtzSetMembership (zone-membership substrate, TRD-CONSOLE-12)"); `vtz.setMembership` (command, PENDING,
  same gating task, authz label `operator:vtz.reassign`, audited).
- BFF route: none. Engine op: none.
- Fields: n/a. No control anywhere; the drawer's "Modify VTZ assignment" is not rendered (DRW-04).
- Applies: n/a. Gating: n/a.
- Preconditions and disabled states: always "Not available".
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:57-58, 306;
  forgecentral/packages/bindings/src/manifest.ts:300-314, 374-390.
- TRD drift: TRD-02 lists members, boundary and `vtz.setMembership` as part of the surface
  (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:37-39, 55, 61-62); none exists. TRD-00 surface catalog: "view members" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:521).

### VTZ-10 Zone policy count
- Location: Virtual Trust Zones > zone card > "Policies: Not available" (tooltip "Policies are not stored
  by the engine yet.").
- Configures: nothing (read-only count, not built).
- Binding: `vtz.policyCount` (read, PENDING, owning repo crdb, gating task "IP-CONSOLE-05 Policies surface
  (crdb policy store)").
- BFF route: none. Engine op: none.
- Fields: n/a.
- Applies: n/a. Gating: n/a.
- Preconditions and disabled states: always "Not available".
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/VtzSurface.tsx:60-61, 307;
  forgecentral/packages/bindings/src/manifest.ts:315-327.
- TRD drift: internal staleness -- the tooltip and the gating task say the policy store does not exist,
  but the same manifest registers the crdb policy store LIVE (forgecentral/packages/bindings/src/manifest.ts:627-635,
  637-739) and the Policies surface groups policies by zone. The count is derivable today but not wired.

### VTZ-11 Zone posture matrix (own / effective / floor / ancestors)
- Location: none rendered.
- Configures: nothing. The tree/detail reads carry, per zone, its OWN and EFFECTIVE posture for eleven
  object domains (governed-egress, execution, privilege-escalation, kernel-module, credential-store,
  persistence, ordinary-network, file-and-config, memory, ipc, device), each with the engine's
  catastrophic-floor flag; the detail read adds the contributing ancestors and the store commit version.
  None is displayed; only the High-sensitivity KPI uses them (VTZ-02), and distribution reads the
  effective ordinary-network posture (DIST-02).
- Binding: `vtz.tree`, `vtz.detail` (LIVE).
- BFF route / Engine op: as VTZ-01 / VTZ-04.
- Fields: posture values `deny` / `permit-deny-risky`; an unknown tag withholds the whole read (503).
- Applies: n/a. Gating: n/a.
- Preconditions and disabled states: n/a.
- Failure states: n/a.
- Evidence: forgecentral/packages/contracts/src/vtz.ts:50-72, 95-128, 156-165;
  forgecentral/apps/console/src/surfaces/VtzEditor.tsx:184-196 (ownPostures always []).
- TRD drift: TRD-02 centres the surface on own vs effective posture, the contributing ancestor, locked
  floor rows and a live preview (forgecentral/docs/spec/TRD-CONSOLE-02-vtz.md:29-36, 54-56, 72-79, 96-97); none is rendered. The surface's own
  header comment still describes a posture matrix, a preview and "three separate confirm-gated" acts
  (forgecentral/apps/console/src/surfaces/VtzSurface.tsx:19-24) -- stale vs the editor.

---

## D. Policies (`/policies`)

Surface model (from code): per-VTZ Forge policies (TRD-32 v2). One policy = a set of rules, the
cross-product of its Subjects x Targets, all with one lattice Action, qualified by protocol/ports,
restrictions, logging and an Applied-To list. Authoring is an INLINE form above the list (not a modal).
Distribution of a zone's published policies lives in each zone's accordion (section E).

### POL-01 Policy list: zone accordions + table
- Location: Policies > one accordion per zone (title = zone id, count badge) > expand -> table "Policies
  in <zone>".
- Configures: nothing (read-only); hosts the row actions (POL-04, POL-06) and the distribution panel
  (DIST-01).
- Binding: `policies.byZone` (read, LIVE, op `policy_list_by_zone_v1`); zone ordering reads `vtz.tree`.
- BFF route: GET /api/policies -> handlePolicies -> resolvePolicyZones
  (forgecentral/apps/bff/src/server.ts:1767-1822; forgecentral/apps/bff/src/engine/policies.ts:48-60).
- Engine op: `PolicyListByZone` { request_id } (forgecentral/apps/bff/src/engine/wire-client.ts:1108;
  forgecentral/packages/wire/src/dispatch.ts:74).
- Fields (columns): "Name" + a "v<semver>" badge (the newest version of each policy); "Scope" ("<kind>:<selector
  value> -> <kind>:<selector value>" for one rule, "<n> sources -> <m> targets" for several, "--" for none);
  "Protocol / Ports" (e.g. "TCP/HTTPS 443", "any" when unrestricted); "Action" (the distinct actions as
  badges: Permit good, Monitor info, Quarantine, Deny critical); "Restrictions" ("scheduled", "expires",
  "geo(<n>)", then each tag, joined by a middle-dot separator; "--" when none); "Logging" (Full / Sampled /
  Off); "Status" (raw "draft" caution / "published" good); "Actions" ("Edit", "Delete"). Zones are ordered
  by the VTZ tree, unknown zones last; accordions start collapsed unless a filter is active.
- Applies: re-read on mount and after any policy command (SPA invalidates `['policies']`; BFF drops the
  tenant's policy cache, forgecentral/apps/bff/src/server.ts:1901). BFF cache TTL 2 s (X-4).
- Gating: none (X-1).
- Preconditions and disabled states: "Loading the policies"; nothing authored -> "No policies match" /
  "No policies have been authored yet."
- Failure states: "Could not load the policies." + retry. BFF 503 when ANY record carries a tag the
  Console cannot narrow (the whole list is withheld), 403 refused, 502 otherwise (forgecentral/apps/bff/src/server.ts:1811-1820).
- Evidence: forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:35-132, 148-212, 276-315;
  forgecentral/apps/console/src/surfaces/usePolicies.ts:18-29; forgecentral/packages/contracts/src/policies.ts:129-160, 300-366;
  forgecentral/packages/bindings/src/manifest.ts:637-646.
- TRD drift: TRD-05 accordions carry "policy count and last-updated time" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:72-74)
  -- no last-updated in code; TRD row actions are "view / edit" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:86) -- code has Edit and Delete and
  no view; TRD empty text "no policies in this zone" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:199) differs. TRD-00's catalog still anchors
  Policies to "Crucible policy engine (TRD-04)" with "view version, EXPLAIN" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:524); TRD-05 itself
  re-anchored to TRD-32 v2.

### POL-02 Search policies + Zone filter
- Location: Policies > "Search policies..." box and "Zone" select.
- Configures: nothing (client-side view over the complete, engine-bounded list).
- Binding / BFF route / Engine op: none beyond POL-01.
- Fields: search = case-insensitive substring over name, scope summary, protocol/ports summary and
  restriction tags; Zone = "All" + every zone that has policies. Any active filter opens the accordions.
  No match -> "No policies match" / "No policy matches <search "x">, <zone y>."
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:134-146, 193-218, 254-274, 280-297.
- TRD drift: not described in TRD-05.

### POL-03 Create a policy (Save as Draft)
- Location: Policies > "+ Create Policy" (toggles the inline form, aria "Create a policy") > fill >
  "Save as Draft".
- Configures: authors a new policy scoped to one zone, as a DRAFT (the resolver documents the store
  minting v1.0.0, forgecentral/apps/bff/src/engine/policies.ts:88-92). A draft is never distributed.
- Binding: `policies.create` (command, LIVE, op `policy_create_v1`, authz label `operator:policies.author`,
  audited).
- BFF route: POST /api/policies -> handlePoliciesCommand -> `toPolicyDraftInput` -> resolveCreatePolicy
  (forgecentral/apps/bff/src/server.ts:1831-1900; forgecentral/apps/bff/src/engine/policies.ts:93-105).
- Engine op: `PolicyCreate` { request_id, operator, spec: WirePolicySpec } (forgecentral/apps/bff/src/engine/wire-client.ts:1141;
  forgecentral/packages/wire/src/dispatch.ts:81; forgecentral/packages/wire/src/payload.ts:1051;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:802-820).
- Fields: POL-F1..POL-F13. Body = { vtz, name, description, rules[{source, destination, action}],
  network{protocols, ports}, restrictions{scheduleDays, scheduleStartMinute, scheduleEndMinute,
  activeFrom: null, activeUntil: null, geo, tags}, logging, appliedTo[{endpointCn, agent: null}],
  maxClassification } (forgecentral/apps/console/src/surfaces/PolicyForm.tsx:159-188). Empty optional axes are
  omitted from the wire spec (forgecentral/packages/contracts/src/policies.ts:405-456). BFF narrowing is
  fail-closed: blank name/zone, unknown action/logging/protocol/kind/selector/day/classification, an empty
  rule list, or a malformed restriction -> 400 (forgecentral/packages/contracts/src/policies.ts:592-626).
- Applies: on commit; the list re-reads and the form closes.
- Gating: no role/tier check (X-1). No confirm dialog for Save as Draft.
- Preconditions and disabled states: both save buttons stay disabled until Policy Name, Zone, at least
  one Subject and one Target are set and Ports is valid; disabled while pending ("Saving..."). The Zone
  list comes from the VTZ tree and the Subject/Target lists from the object catalog, so a policy cannot
  be authored until at least one zone and one object exist. "Cancel" closes the form (and so does the
  "+ Create Policy" toggle).
- Failure states: 409 -> "A policy with that name already exists in the zone, or the version
  conflicts."; 400 -> "The policy is incomplete or a field does not fit the engine contract."; 403 ->
  "The engine refused the command (not authorized)."; other HTTP -> "The engine refused the command.";
  network -> "The command could not reach the engine." The whole body is capped at 8,192 bytes (X-3) and
  each Subject x Target pair is one rule object in it, so a large cross-product is refused 400 (by code
  reading; the exact count depends on value lengths).
- Evidence: forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:222-237;
  forgecentral/apps/console/src/surfaces/PolicyForm.tsx:70-81, 106-211, 434-454;
  forgecentral/apps/console/src/surfaces/usePolicyMutation.ts:16-72; forgecentral/packages/bindings/src/manifest.ts:684-694.
- TRD drift: TRD-05 describes a "Create modal" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:96-100); the code renders an inline form. TRD-05
  says Subjects are agents/users/groups incl. "the Users/Agents principals" and Targets are filtered to
  resource-capable nouns (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:114-118); the code offers the WHOLE object catalog in both lists (every
  kind, drafts included) and no principals.

### POL-04 Edit a policy (Save as Draft)
- Location: Policies > expanded zone > row "Edit" -> form (aria "Edit <name>") > "Save as Draft".
- Configures: mints a new DRAFT version of the policy; a published version is never mutated. With no
  published lineage the sole draft keeps its version; otherwise the version is minted from the published
  one and a superseded draft is tombstoned (crucible/crates/cdb-cyber/src/policy_store.rs:495-535).
- Binding: `policies.edit` (command, LIVE, op `policy_edit_v1`, authz label `operator:policies.author`,
  audited).
- BFF route: POST /api/policies/edit { id, ...draft } -> handlePoliciesCommand -> resolveEditPolicy (400
  when `id` is blank) (forgecentral/apps/bff/src/server.ts:1892-1898; forgecentral/apps/bff/src/engine/policies.ts:108-121).
- Engine op: `PolicyEdit` { request_id, operator, id, spec } (forgecentral/apps/bff/src/engine/wire-client.ts:1151; forgecentral/packages/wire/src/dispatch.ts:82;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:728-733). The engine builds the new version ONLY from the spec
  (crucible/crates/cdb-server/src/handler.rs:6315-6345).
- Fields: as POL-03, seeded from the record; "Policy Name" is read-only; "Zone" stays editable.
- Applies: on commit; list re-reads; form closes.
- Gating: no role/tier check (X-1); no confirm for Save as Draft.
- Preconditions and disabled states: as POL-03.
- Failure states: as POL-03, plus these edit-specific behaviors, all by code reading:
  - Changing the Zone: the engine looks the policy up under the NEW zone and refuses NotFound as Conflict
    -> 409 -> "A policy with that name already exists in the zone, or the version conflicts."
    (crucible/crates/cdb-cyber/src/policy_store.rs:503-508; crucible/crates/cdb-server/src/handler.rs:6258-6266). A policy cannot be moved
    between zones.
  - Raising Max Classification above the published version's -> ClassificationWidened -> Conflict -> the
    same misleading 409 line (crucible/crates/cdb-cyber/src/policy_store.rs:514-518; crucible/crates/cdb-server/src/handler.rs:6266).
  - Rules are rebuilt from the CURRENT catalog by selector value: a rule whose selector no longer matches
    any catalog object is silently dropped from the new version (forgecentral/apps/console/src/surfaces/PolicyForm.tsx:120-125, 159-168).
  - One Action is applied to every rule; a policy whose rules had mixed actions collapses to the first
    rule's action (forgecentral/apps/console/src/surfaces/PolicyForm.tsx:130, 166-168).
  - The active window and default postures are never sent (forgecentral/apps/console/src/surfaces/PolicyForm.tsx:179-180;
    forgecentral/packages/contracts/src/policies.ts:405-456 has no default_postures), so a new version built from
    the spec carries neither -- an existing active window is cleared.
- Evidence: forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:159-182, 235-237;
  forgecentral/apps/console/src/surfaces/PolicyForm.tsx:117-146, 226-235; forgecentral/packages/bindings/src/manifest.ts:695-704.
- TRD drift: TRD-05 says "a concurrent edit is resolved by the engine's versioning" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:225) -- no FC
  handling beyond the 409 copy; TRD-05 does not mention that Name is fixed or that zone moves fail.

### POL-05 Save & Publish
- Location: Policies > form > "Save & Publish" -> confirm "Publish this policy?" -> "Publish".
- Configures: authors the draft (create or edit, POL-03/POL-04) and then publishes exactly that version.
  Only PUBLISHED policies are composed into a zone's bundle (distribute reads the effective published
  policies, forgecentral/apps/bff/src/engine/distribute.ts:122-130).
- Binding: `policies.create` or `policies.edit`, then `policies.publish` (command, LIVE, op
  `policy_publish_v1`, authz label `operator:policies.author`, audited).
- BFF route: POST /api/policies (or /api/policies/edit), then POST /api/policies/publish { vtz, id,
  version } -> resolvePublishPolicy; 400 when any of the three is blank
  (forgecentral/apps/bff/src/server.ts:1875-1883; forgecentral/apps/bff/src/engine/policies.ts:124-138).
- Engine op: `PolicyCreate`/`PolicyEdit`, then `PolicyPublish` { request_id, operator, vtz, id, version }
  (forgecentral/apps/bff/src/engine/wire-client.ts:1162; forgecentral/packages/wire/src/dispatch.ts:83; forgecentral/packages/contracts/src/generated/wire-dto.ts:761-767).
- Fields: as POL-03/POL-04.
- Applies: on commit. A non-breaking publish closes the form; a BREAKING publish (the engine says it
  revoked previously granted access) keeps it open with POL-08's notice.
- Gating: no role/tier check (X-1). Confirm: title "Publish this policy?", description "Publishing authors
  the version and makes it available to distribute to its Applied-To endpoints. A breaking change
  (revoking prior access) is flagged after it commits. Enforcement stays off until separately engaged.",
  confirm "Publish" (default tone).
- Preconditions and disabled states: as POL-03.
- Failure states: as POL-03. The two steps are not atomic: if authoring succeeds and publish fails, the
  draft exists, the SPA shows only the failure line, and the list is NOT refreshed (invalidation runs on
  success only); retrying on a still-open CREATE form then hits the name-taken 409
  (forgecentral/apps/console/src/surfaces/usePolicyMutation.ts:56-70). The confirm's "to its Applied-To
  endpoints" does not match distribution, which ignores Applied-To (DIST-02).
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:190-211, 427-466;
  forgecentral/packages/bindings/src/manifest.ts:705-714.
- TRD drift: none on the flow (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:185-186); see DIST-02 for the Applied-To mismatch.

### POL-06 Delete a policy
- Location: Policies > expanded zone > row "Delete" -> confirm "Delete <name>?" -> "Delete".
- Configures: tombstones every version of the policy (history preserved); it is no longer composed into
  future bundles.
- Binding: `policies.delete` (command, LIVE, op `policy_delete_v1`, authz label `operator:policies.author`,
  audited).
- BFF route: POST /api/policies/delete { vtz, id } -> resolveDeletePolicy (400 when either is blank)
  (forgecentral/apps/bff/src/server.ts:1867-1874; forgecentral/apps/bff/src/engine/policies.ts:141-150).
- Engine op: `PolicyDelete` { request_id, operator, vtz, id } (forgecentral/apps/bff/src/engine/wire-client.ts:1173; forgecentral/packages/wire/src/dispatch.ts:84;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:709-714).
- Fields: none (the row's zone + id).
- Applies: on commit; the list re-reads. By code reading, deleting does not re-distribute: endpoints keep
  the last bundle until DIST-02 runs (no distribute call on this path).
- Gating: no role/tier check (X-1). Confirm: description "Deleting a policy tombstones every version
  (history is preserved) and removes it from future distribution. Enforcement is unaffected until
  separately engaged.", confirm "Delete" (critical).
- Preconditions and disabled states: none (the button is never disabled).
- Failure states: NOT SHOWN -- the surface never renders the delete mutation's error
  (forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:151, 247 are its only uses); a refused delete leaves
  the row in place with no message.
- Evidence: forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:170-176, 239-252;
  forgecentral/apps/console/src/surfaces/usePolicyMutation.ts:75-85; forgecentral/packages/bindings/src/manifest.ts:715-724.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:170).

### POL-F1 Policy Name
- Location: Policies > form > "Policy Name".
- Configures: the policy's display label (unique per zone).
- Binding: `policies.create` / `policies.edit` (`spec.name`).
- BFF route / Engine op: as POL-03 / POL-04.
- Fields: string, required (SPA: non-blank after trim), read-only when editing. BFF: non-blank after trim
  (forgecentral/packages/contracts/src/policies.ts:595-598). Engine (reference): max 128 bytes (crucible/crates/cdb-types/src/forge_v2.rs:1522); a
  duplicate name in the zone -> 409.
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: read-only in edit mode.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:118, 156, 226-235.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:103).

### POL-F2 Zone
- Location: Policies > form > "Zone" (first option "Select a zone").
- Configures: the VTZ the policy belongs to (its grouping and composition boundary).
- Binding: `policies.create` / `policies.edit` (`spec.vtz`); publish/delete also carry it.
- BFF route / Engine op: as POL-03.
- Fields: select over the VTZ tree (label = zone name, value = zone id); required. BFF: non-blank.
- Applies / Gating: as POL-03.
- Preconditions and disabled states: empty when the tree has not loaded. Editable in edit mode, but a
  change fails (POL-04).
- Failure states: as POL-03 / POL-04.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:115, 119, 236-246.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:104-105).

### POL-F3 Subjects (Who) / Targets (What)
- Location: Policies > form > "Subjects (Who)" and "Targets (What)" (native multi-selects; Ctrl/Cmd-click
  to pick several).
- Configures: the rule spine. Every selected Subject x every selected Target becomes one rule with the
  chosen Action.
- Binding: `policies.create` / `policies.edit` (`spec.rules`).
- BFF route / Engine op: as POL-03.
- Fields: options = every catalog object, labelled "<kind>:<name>"; the option VALUE is the object's
  selector value, not its name. Required: at least one of each. The rule endpoint stores the object's kind,
  selector form and selector value COPIED at authoring time -- a policy does not reference the object by
  name, so later edits or deletes of the object do not change stored rules. Two catalog objects with the
  same selector value collapse into one entry. BFF: kind must be one of the 12 object kinds, selector form
  one of exact/glob/group_ref/cidr, value a string (forgecentral/packages/contracts/src/policies.ts:470-490, 603-610).
- Applies / Gating: as POL-03.
- Preconditions and disabled states: lists are empty until the catalog loads (OBJ-01).
- Failure states: as POL-03.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:64-67, 114, 120-125, 148-168, 250-281;
  forgecentral/packages/contracts/src/policies.ts:72-87.
- TRD drift: see POL-03 (principals and kind filtering promised, not built).

### POL-F4 Protocol
- Location: Policies > form > fieldset "Protocol" (chips "TCP", "UDP", "HTTPS", "SSH").
- Configures: the network-match protocols; none = unrestricted.
- Binding: as POL-03 (`spec.protocols`, omitted when empty).
- BFF route / Engine op: as POL-03.
- Fields: zero or more of tcp/udp/https/ssh. BFF: each must be a known tag (forgecentral/packages/contracts/src/policies.ts:497-504).
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:126-128, 284-295;
  forgecentral/packages/contracts/src/policies.ts:51-52.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:121-122). Runtime matching is deferred (POL-10).

### POL-F5 Ports
- Location: Policies > form > "Ports" (placeholder "80, 443, 8080-8090").
- Configures: the network-match ports; empty = unrestricted.
- Binding: as POL-03 (`spec.ports`, omitted when empty).
- BFF route / Engine op: as POL-03.
- Fields: SPA validation: a comma list whose entries are single ports 1-65535 or ranges "start-end" with
  1 <= start < end <= 65535; empty is valid. Invalid -> the field is marked invalid, the line "The port
  list must be ports or `start-end` ranges within 1-65535." shows, and both save buttons disable. BFF: only
  checks it is a string (forgecentral/packages/contracts/src/policies.ts:505-507). UNVERIFIED: engine re-validation of the format.
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:47-62, 129, 155-157, 296-305, 417-421.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:120-121).

### POL-F6 Action
- Location: Policies > form > "Action".
- Configures: the lattice action every rule of the policy carries: Permit < Monitor < Quarantine < Deny.
- Binding: as POL-03 (`rules[].action`).
- BFF route / Engine op: as POL-03.
- Fields: select "Permit" / "Monitor" / "Quarantine" / "Deny"; default Permit (create) or the first rule's
  action (edit). BFF: one of the four.
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:130, 309-322;
  forgecentral/packages/contracts/src/policies.ts:42-44, 628-640.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:124-126).

### POL-F7 Logging Level
- Location: Policies > form > "Logging Level".
- Configures: the policy's telemetry level.
- Binding: as POL-03 (`spec.logging`).
- BFF route / Engine op: as POL-03.
- Fields: "Full" / "Sampled" / "Off"; default Full. BFF: required, one of the three (forgecentral/packages/contracts/src/policies.ts:599-602).
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:131, 323-336.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:34-37, 84).

### POL-F8 Schedule: Days / From (hour) / To (hour)
- Location: Policies > form > "Restrictions (Optional)" (collapsible) > legend "Days" (chips "mon" ...
  "sun"), "From (hour)", "To (hour)" (time inputs).
- Configures: a recurring weekly window when the policy is active.
- Binding: as POL-03 (`schedule_days`, `schedule_start_minute`, `schedule_end_minute`, each omitted when
  empty).
- BFF route / Engine op: as POL-03.
- Fields: days = any subset of mon..sun; From/To = HH:MM converted to minutes since midnight (From
  inclusive, To exclusive per the contract); blank = all day. No SPA check that To > From or that a day is
  chosen when times are set. BFF: day tags must be known; minutes any finite number (forgecentral/packages/contracts/src/policies.ts:510-515,
  541-552). The table shows "scheduled".
- Applies: stored and carried in the bundle; runtime evaluation is deferred (POL-10).
- Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:92-104, 132-136, 175-178, 339-372;
  forgecentral/packages/contracts/src/policies.ts:102-116.
- TRD drift: none on shape (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:131-134).

### POL-F9 Geo allowlist
- Location: Policies > form > Restrictions > "Geo allowlist (comma-separated)".
- Configures: a residency allowlist for the policy.
- Binding: as POL-03 (`geo`, omitted when empty).
- BFF route / Engine op: as POL-03.
- Fields: comma-separated, trimmed, blanks dropped, carried verbatim (no code list). The table shows
  "geo(<n>)". BFF: array of strings.
- Applies: stored and carried; runtime evaluation deferred (POL-10).
- Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:84-89, 137, 181, 373-376.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:140-141).

### POL-F10 Tags
- Location: Policies > form > Restrictions > "Tags (comma-separated)".
- Configures: classification/grouping labels (e.g. PHI, PII) -- reporting only per the contract
  (forgecentral/packages/contracts/src/policies.ts:114).
- Binding: as POL-03 (`restriction_tags`, omitted when empty).
- BFF route / Engine op: as POL-03.
- Fields: comma-separated, trimmed, verbatim; each tag shows in the Restrictions column and is searchable.
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:138, 182, 377-380.
- TRD drift: TRD-05 says tags feed the bundle's `max_classification` derivation (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:142-143); FC's
  composition uses a fail-closed constant classification (forgecentral/packages/contracts/src/forge.ts:163-170).

### POL-F11 Applied To
- Location: Policies > form > "Advanced Settings" (collapsible) > "Applied To (endpoint CNs,
  comma-separated)" (placeholder "host-01.corp, host-02.corp").
- Configures: the policy's stored distribution scope (who should enforce it).
- Binding: as POL-03 (`applied_to`, omitted when empty; each entry { endpoint_cn, agent: null }).
- BFF route / Engine op: as POL-03.
- Fields: comma-separated CNs, trimmed; no format check; no agent can be named. Empty = "distributes
  nowhere" per the contract (forgecentral/packages/contracts/src/policies.ts:150).
- Applies: stored only. By code reading, distribution does NOT read it: re-distribute sends the current
  bundle's endpoint list taken from the convergence read
  (forgecentral/apps/console/src/surfaces/DistributionPanel.tsx:42-45, 114;
  forgecentral/apps/bff/src/engine/distribute.ts:36-40, 89-94).
- Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:139-141, 185, 383-392.
- TRD drift: TRD-05 makes Applied-To the scope a bundle is pushed to and resolved from enrolled
  device/agent records, with out-of-scope distribution refused (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:146-153, 171-173, 214, 226); in
  code it is free text that distribution ignores.

### POL-F12 Max Classification
- Location: Policies > form > Advanced Settings > "Max Classification".
- Configures: the policy's maximum classification (never widens across versions, R-FRG-7 per contract).
- Binding: as POL-03 (`max_classification`).
- BFF route / Engine op: as POL-03.
- Fields: "unclassified" / "internal" / "confidential" / "restricted" / "secret"; default internal
  (create). BFF: required, one of the five. Widening past the published version -> 409 (POL-04).
- Applies / Gating / Failure states: as POL-03 / POL-04.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:143-145, 393-406;
  forgecentral/packages/contracts/src/policies.ts:62-70.
- TRD drift: TRD-05 Section 3.4 lists "Description / priority" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:154-155) and no classification
  control; the code has Max Classification and no priority.

### POL-F13 Description
- Location: Policies > form > Advanced Settings > "Description".
- Configures: free-text operator metadata ("never a disposition input" per contract).
- Binding: as POL-03 (`description`).
- BFF route / Engine op: as POL-03.
- Fields: string, trimmed, optional. Engine (reference): max 1024 bytes
  (crucible/crates/cdb-types/src/forge_v2.rs:1527).
- Applies / Gating / Failure states: as POL-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:142, 172, 407-414.
- TRD drift: see POL-F12 (no priority field).

### POL-07 Active window (from / until)
- Location: Policies > table > Restrictions shows "expires" when a record has an end; no authoring control.
- Configures: nothing from the Console. Every draft sends activeFrom = activeUntil = null.
- Binding: the fields exist on `policies.create` / `policies.edit`, never populated.
- BFF route / Engine op: as POL-03 (fields accepted if a caller sends numbers, forgecentral/packages/contracts/src/policies.ts:549-555).
- Fields: n/a. The code's reason: the bound is an engine HLC with no Console wall-clock conversion, so
  authoring a date would emit a wrong-scale bound.
- Applies: n/a. Gating: n/a.
- Preconditions and disabled states: n/a.
- Failure states: n/a. Editing a policy that has a window clears it (POL-04).
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:13-16, 179-180;
  forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:74-89.
- TRD drift: TRD-05 presents the active window ("block a threat for a week") as an authored field, real
  the day it ships (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:46-49, 135-139, 217-218); it is not authorable in the Console.

### POL-08 Breaking-publish flag
- Location: Policies > form, after a publish: "Published as a [breaking] change (it revoked previously
  granted access)."
- Configures: nothing (read-only notice from the publish acknowledgment).
- Binding: `policies.publish` reply (`breaking`; a missing value is treated as false).
- BFF route / Engine op: as POL-05.
- Fields: n/a.
- Applies: shown until the form is cancelled.
- Gating: n/a. Preconditions and disabled states: only after a breaking publish. Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/PolicyForm.tsx:200-208, 427-432;
  forgecentral/packages/contracts/src/policies.ts:459-465.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:168-169, 216).

### POL-09 Policy detail + version history
- Location: none in the SPA.
- Configures: nothing (read).
- Binding: `policies.detail` (read, LIVE, op `policy_detail_v1`).
- BFF route: GET /api/policies/detail?vtz=<zone>&id=<policy> -> resolvePolicyDetail (400 when either is
  missing) (forgecentral/apps/bff/src/server.ts:1785-1808; forgecentral/apps/bff/src/engine/policies.ts:63-77).
- Engine op: `PolicyDetail` (forgecentral/apps/bff/src/engine/wire-client.ts:1119; forgecentral/packages/wire/src/dispatch.ts:75).
- Fields: the newest record + every version with its lifecycle.
- Applies / Gating / Preconditions and disabled states / Failure states: n/a (no consumer; grep of apps/console/src for
  `/api/policies/detail` finds nothing).
- Evidence: as above; forgecentral/packages/bindings/src/manifest.ts:647-655.
- TRD drift: TRD-05 promises a row "view -> read-only detail" and version history (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:86, 165, 182);
  TRD-00 catalog lists "view version" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:524). Not reachable in the UI.

### POL-10 Runtime enforcement of schedule / geo / ports
- Location: none (the only UI trace is the confirm copy "Enforcement stays off until separately engaged.").
- Configures: nothing today.
- Binding: `policies.enforcement` (read, PENDING, owning repo torch, gating task "IP-TORCH-POLICY-ENFORCE
  (host realization of schedule/geo/port rules; AG.7-OFF)").
- BFF route: none. Engine op: none.
- Fields / Applies / Gating / Preconditions and disabled states / Failure states: n/a.
- Evidence: forgecentral/packages/bindings/src/manifest.ts:667-681.
- TRD drift: consistent with TRD-05 Section 8 (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:230-233).

---

## E. Policy distribution (inside each zone accordion on Policies)

### DIST-01 Policy distribution ledger (convergence)
- Location: Policies > expand a zone accordion > section "Policy distribution" under the table.
- Configures: nothing (read-only ledger).
- Binding: `policies.convergence` (read, LIVE, op `bundle_convergence_v1`).
- BFF route: GET /api/vtz/convergence?id=<zone> -> handleVtz -> resolveBundleConvergence; never cached;
  400 without an id (forgecentral/apps/bff/src/server.ts:803-811, 825-828;
  forgecentral/apps/bff/src/engine/vtz.ts:115-127).
- Engine op: `BundleConvergence` { request_id, vtz_id } (forgecentral/apps/bff/src/engine/wire-client.ts:1279; forgecentral/packages/wire/src/dispatch.ts:62).
- Fields: "Bundle v<version>" when a bundle exists; one row per endpoint in the bundle's scope: CN + a
  state badge "Applied" (good), "Rejected: <reason>" (critical; the reason is the engine's ApplyError
  variant name), or "No confirmation" (caution -- silent, never shown as delivered).
- Applies: read when the accordion opens and after a re-distribute (staleTime 0, gcTime 0); not polled.
- Gating: none (X-1).
- Preconditions and disabled states: a panel exists only for zones currently showing an accordion, i.e. a
  zone with at least one policy (any lifecycle) that passes the active filters. "Loading the distribution
  status". No bundle -> "No policy distributed yet" / "Distributing to endpoints for the first time needs
  endpoint selection, which is not built yet. Once a bundle exists, it can be re-distributed here."
- Failure states: "Could not load the distribution status." + retry. BFF 503 when a member state is
  unknown or a rejected member lacks a reason (whole ledger withheld), 403, 502.
- Evidence: forgecentral/apps/console/src/surfaces/DistributionPanel.tsx:15-88;
  forgecentral/apps/console/src/surfaces/useDistribution.ts:14-44; forgecentral/packages/contracts/src/forge.ts:254-301;
  forgecentral/apps/console/src/surfaces/PoliciesSurface.tsx:196-206, 309-311;
  forgecentral/packages/design/src/components/AccordionGroup.tsx:59-61; forgecentral/packages/bindings/src/manifest.ts:656-666.
- TRD drift: TRD-05 says the ledger "streams (LIVE, < 2s)" (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:201-202); it is read on open only.

### DIST-02 Commit & re-distribute
- Location: Policies > expanded zone > Policy distribution > "Commit & re-distribute to <n> endpoint(s)"
  -> confirm "Distribute to <n> endpoint(s)?" -> "Distribute".
- Configures: produces a new signed policy bundle for the zone and commits it for the SAME endpoints the
  current bundle names.
- Binding: `policies.distribute` (command, LIVE, op `bundle_commit_v1`, surface forge, authz label
  `operator:policies.author`, audited).
- BFF route: POST /api/vtz/<zone>/distribute { members } -> handleVtzDistribute -> resolveDistribute:
  zone detail read -> effective published policies read -> sign in the crypto sidecar -> bundle commit
  (forgecentral/apps/bff/src/server.ts:944-1021; forgecentral/apps/bff/src/engine/distribute.ts:106-169).
- Engine op: `VtzDetail`, then `PolicyEffective` { request_id, vtz }, then `BundleCommit` { request_id,
  bundle: <sidecar-signed CBOR bytes>, operator } (forgecentral/apps/bff/src/engine/wire-client.ts:1289, 1130, 1300; forgecentral/packages/wire/src/dispatch.ts:50, 78, 61;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:65-69). The signature is made by the sidecar signer (`signBundle`,
  forgecentral/apps/bff/src/engine/sign-client.ts:94; call site forgecentral/apps/bff/src/engine/distribute.ts:150).
- Fields: `members` = the endpoint CNs the convergence read lists (not editable here; not from Applied-To).
  BFF: a non-empty array of non-empty strings, body <= 64 KiB (forgecentral/apps/bff/src/server.ts:966-981). Bundle contents (by
  code reading): version = the zone detail's store commit version; a flat EndpointPolicy whose only
  zone-derived bit is `allow_ordinary_internet` (true only when the effective ordinary-network posture is
  permit-deny-risky; absent or deny -> false), a constant exec floor, empty brokered/restricted sets,
  fail-closed classification and resource bounds; rules + contributors = the zone's effective published
  policies; scope = the CNs (agent null); a 24 h freshness lease
  (forgecentral/packages/contracts/src/forge.ts:156-182; forgecentral/apps/bff/src/engine/distribute.ts:34, 71-98). Because the VTZ surface
  authors no posture (VTZ-11), a Console-authored zone's bundle denies ordinary internet unless an
  ancestor authored a permit (by code reading).
- Applies: on commit; the ledger re-reads. The reply (version, carried rules/policies, unexpressed domains
  and fields) is NOT displayed (the panel reads only pending/error state).
- Gating: no role/tier check (X-1). Confirm: title "Distribute to <n> endpoint(s)?", description "The
  zone's effective published policies are composed, signed in the crypto sidecar, and committed for these
  endpoints to fetch: <cn, cn, ...>. Enforcement stays off until separately engaged.", confirm "Distribute".
- Preconditions and disabled states: shown only when a bundle already exists (DIST-01); disabled while in
  flight (label "Re-distributing" + an ellipsis) or when the scope is empty. Needs the signer port
  configured (`FC_SIGNER_PORT`, forgecentral/apps/bff/src/config.ts:56, 210) else 503 `signer_unavailable`
  (forgecentral/apps/bff/src/server.ts:962-965).
- Failure states: every failure shows "The re-distribution failed. Nothing changed on the endpoints; try
  again." BFF statuses: 400 malformed, 404 `unknown_zone`, 503 `unavailable` (a published policy the
  contract cannot narrow) or `signer_unavailable`, 422 `signing_refused`, 409 (engine Framing, e.g. a
  non-advancing version), 403 other refusals, 502 (forgecentral/apps/bff/src/server.ts:997-1019). No auto-retry.
- Evidence: forgecentral/apps/console/src/surfaces/DistributionPanel.tsx:39-45, 90-117;
  forgecentral/apps/console/src/surfaces/useDistribution.ts:62-92; forgecentral/packages/bindings/src/manifest.ts:725-738.
- TRD drift: TRD-05 distributes "for the endpoints in each policy's Applied-To scope" and refuses a
  distribute outside it (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:171-173, 214, 226); code targets the existing bundle scope and ignores
  Applied-To. TRD-00/TRD-05 place compose/sign/push on the Policy tab (matches), but the route is under
  /api/vtz/ (naming only).

### DIST-03 First distribution / choosing endpoints
- Location: Policies > expanded zone > Policy distribution, empty state (quoted in DIST-01).
- Configures: nothing -- there is no way to pick endpoints for a zone that has never been distributed.
- Binding: none (not a manifest binding); the hook documents the deferral as "gated on a device
  directory".
- BFF route: the distribute route accepts any CN list, but no SPA control supplies one.
- Engine op: none.
- Fields / Applies / Gating: n/a.
- Preconditions and disabled states: always unavailable.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/DistributionPanel.tsx:69-74;
  forgecentral/apps/console/src/surfaces/useDistribution.ts:54-60.
- TRD drift: TRD-05's "Distribute + watch converge" task assumes a first distribution is possible
  (forgecentral/docs/spec/TRD-CONSOLE-05-policies.md:187-188); it is not, from the Console.

---

## F. Objects (`/objects`)

Surface model (from code): the catalog of named objects -- reusable policy NOUNS (a kind + a selector)
that Policies bind. No apply/enforce/posture control exists here by design
(forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:1-12). Objects are declarative: creating one
needs no observed entity.

### OBJ-01 Object catalog (cards grouped by kind)
- Location: Objects > one section per kind (heading = kind label) > cards.
- Configures: nothing (read-only); hosts Edit/Delete (OBJ-04/05) and the drawer link (OBJ-07).
- Binding: `objects.list` (read, LIVE, op `object_list_v1`).
- BFF route: GET /api/objects -> handleObjects -> resolveObjectCatalog; no BFF cache
  (forgecentral/apps/bff/src/server.ts:1379-1420; forgecentral/apps/bff/src/engine/objects.ts:47-59).
- Engine op: `ObjectList` { request_id } (forgecentral/apps/bff/src/engine/wire-client.ts:742;
  forgecentral/packages/wire/src/dispatch.ts:69).
- Fields (card): the name (a link-style button, aria "Open the drawer for <name>"); lifecycle badge
  "published" (good) / "draft" (caution); selector line "CIDR <v>" / "group <v>" / "exact <v>" / "glob
  <v>"; description or "--"; tag badges; "Edit"; "Delete". Kind order and labels: User, Group, Agent,
  Service, Server, Application, URI, Network, Registry Key, Certificate, Script, Data Store; kinds with no
  objects are hidden.
- Applies: re-read on mount and after any object command; not polled.
- Gating: none (X-1).
- Preconditions and disabled states: "Loading the object catalog"; empty tenant -> "No objects match" /
  "No objects have been registered yet."
- Failure states: "Could not load the object catalog." + retry. BFF 503 when ANY record carries an
  unknown kind/selector/lifecycle tag (the whole catalog is withheld), 403, 502 (forgecentral/apps/bff/src/server.ts:1409-1418).
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:24-37, 198-232, 299-376;
  forgecentral/apps/console/src/surfaces/useObjects.ts:22-28, 45-47;
  forgecentral/packages/contracts/src/objects.ts:35-81, 124-158, 198-225; forgecentral/packages/bindings/src/manifest.ts:560-569.
- TRD drift: TRD-10's type table has eight groups (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:52-61); the
  code has twelve kinds (TRD-10's own amendment points at the registry, forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:12-18). TRD-10 calls the
  grid "server-paged" (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:67-68, 91); the code reads the complete bounded catalog and filters
  client-side. TRD empty text "no objects of this type" (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:92) differs.

### OBJ-02 Search objects + Kind filter
- Location: Objects > "Search objects..." and "Kind" (All + the twelve kinds).
- Configures: nothing (client-side view).
- Binding / BFF route / Engine op: none beyond OBJ-01.
- Fields: search = case-insensitive substring over name, selector value, description and tags. No match
  -> "No objects match" / "No object matches <search "x">, <kind y>."
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:207-219, 234-237, 273-297, 306-314.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:63 "search + filter").

### OBJ-03 Create an object
- Location: Objects > "+ Create Object" (toggles the inline form, aria "Create an object") > "Create
  Object".
- Configures: registers a named object (kind + selector + description) in the tenant's catalog, as a
  DRAFT.
- Binding: `objects.create` (command, LIVE, op `object_create_v1`, authz label `operator:objects.manage`,
  audited).
- BFF route: POST /api/objects -> handleObjectsCommand -> parseObjectDraft -> resolveCreateObject
  (forgecentral/apps/bff/src/server.ts:1264-1311, 1318-1377; forgecentral/apps/bff/src/engine/objects.ts:70-82).
- Engine op: `ObjectCreate` { request_id, operator, spec: { name, kind, selector_kind, selector_value,
  description, lifecycle, tags? } } (forgecentral/apps/bff/src/engine/wire-client.ts:807; forgecentral/packages/wire/src/dispatch.ts:93; forgecentral/packages/wire/src/payload.ts:992-993;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:661-670).
- Fields: OBJ-F1..OBJ-F5. Body = { name, kind, selectorKind, selectorValue, description, tags: [],
  lifecycle: "draft" } (forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:95-106).
- Applies: on commit; the catalog re-reads and the form closes.
- Gating: no role/tier check (X-1). No confirm dialog.
- Preconditions and disabled states: submit disabled while pending ("Committing...") or when Name or
  Value is blank; it is a real form, so the browser also enforces `required`. "Cancel" closes it.
- Failure states: 409 -> "An object with that name already exists."; 400 -> "The form is incomplete or
  the selector does not fit the kind."; other HTTP -> "The engine refused the command."; network -> "The
  command could not reach the engine."
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:60-196, 245-256;
  forgecentral/apps/console/src/surfaces/useObjects.ts:50-80; forgecentral/packages/bindings/src/manifest.ts:595-605.
- TRD drift: TRD-10 says create/edit are confirm-gated and author "type, identity, tags,
  classification" (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:72-74, 101); the code has no confirm and no tag or classification input.

### OBJ-04 Edit an object
- Location: Objects > card "Edit" -> form (aria "Edit <name>") > "Save".
- Configures: REPLACES the object's stored record (crucible/crates/cdb-cyber/src/object_store.rs:180-203).
- Binding: `objects.edit` (command, LIVE, op `object_edit_v1`, authz label `operator:objects.manage`,
  audited).
- BFF route: POST /api/objects/edit -> handleObjectsCommand -> parseObjectDraft -> resolveEditObject
  (forgecentral/apps/bff/src/engine/objects.ts:85-97).
- Engine op: `ObjectEdit` { request_id, operator, spec } (forgecentral/apps/bff/src/engine/wire-client.ts:817; forgecentral/packages/wire/src/dispatch.ts:94).
- Fields: Name read-only; Kind, Selector, Value, Description editable; tags and lifecycle are carried
  over from the existing record. Attributes are NOT carried (the draft type has none and the wire mapping
  omits them, forgecentral/packages/contracts/src/objects.ts:95-103, 177-187), and the engine builds the record's
  attributes only from the spec (crucible/crates/cdb-server/src/handler.rs:5990-6013) -- so, by code reading, a
  Console edit clears any stored attributes.
- Applies: on commit; catalog re-reads.
- Gating: no role/tier check (X-1). No confirm dialog.
- Preconditions and disabled states: as OBJ-03. Changing Kind resets Selector to that kind's default but
  keeps Value.
- Failure states: as OBJ-03. An object deleted meanwhile returns engine NotFound as Conflict -> 409 ->
  "An object with that name already exists." (misleading; crucible/crates/cdb-server/src/handler.rs:6018-6023).
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:80-106, 118-127, 359-361;
  forgecentral/packages/bindings/src/manifest.ts:606-614.
- TRD drift: as OBJ-03.

### OBJ-05 Delete an object
- Location: Objects > card "Delete" -> confirm "Delete <name>?" -> "Delete".
- Configures: tombstones the object (history preserved). Policy rules hold a COPY of the object's
  selector (POL-F3), so deleting an object changes no stored policy.
- Binding: `objects.delete` (command, LIVE, op `object_delete_v1`, authz label `operator:objects.manage`,
  audited).
- BFF route: POST /api/objects/delete { name } -> resolveDeleteObject (400 when blank)
  (forgecentral/apps/bff/src/server.ts:1347-1353; forgecentral/apps/bff/src/engine/objects.ts:100-108).
- Engine op: `ObjectDelete` { request_id, operator, name } (forgecentral/apps/bff/src/engine/wire-client.ts:828; forgecentral/packages/wire/src/dispatch.ts:95;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:618-622).
- Fields: none.
- Applies: on commit; catalog re-reads.
- Gating: no role/tier check (X-1). Confirm: description "Deleting a catalog object changes no
  enforcement; a policy that references it must be re-authored on the Policy tab. History is
  preserved.", confirm "Delete" (critical).
- Preconditions and disabled states: none.
- Failure states: NOT SHOWN -- the delete mutation's error is never rendered
  (forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:200, 266 are its only uses).
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:258-271, 362-368;
  forgecentral/apps/console/src/surfaces/useObjects.ts:83-89; forgecentral/packages/bindings/src/manifest.ts:615-624.
- TRD drift: TRD-10 lists only create/edit (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:72-74); delete ships LIVE.

### OBJ-F1 Name
- Location: Objects > form > "Name".
- Configures: the object's unique name (the catalog's natural key; shown in Policies as "<kind>:<name>").
- Binding: `objects.create` / `objects.edit` (`spec.name`); delete keys on it.
- BFF route / Engine op: as OBJ-03.
- Fields: string, required, trimmed, read-only when editing. BFF: non-blank after trim
  (forgecentral/apps/bff/src/server.ts:1267-1268, 1289). Duplicate -> 409. UNVERIFIED: engine length/character rules (not checked).
- Applies / Gating / Failure states: as OBJ-03.
- Preconditions and disabled states: read-only in edit mode.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:81, 97, 118-127.
- TRD drift: none.

### OBJ-F2 Kind
- Location: Objects > form > "Kind".
- Configures: the object's TRD-32 v2 kind (its catalog section, and the endpoint kind a policy rule
  copies).
- Binding: as OBJ-03 (`spec.kind`).
- BFF route / Engine op: as OBJ-03.
- Fields: the twelve kinds (labels as OBJ-01); default Server. BFF: one of the twelve tags user, group,
  agent, service, server, application, uri, network, registry_key, certificate, script, data_store
  (forgecentral/apps/bff/src/server.ts:1273-1291). Changing it re-seeds Selector (OBJ-F3).
- Applies / Gating / Failure states: as OBJ-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:82, 89-93, 128-141.
- TRD drift: see OBJ-01.

### OBJ-F3 Selector (form)
- Location: Objects > form > "Selector".
- Configures: how the object's value matches: exact, glob, group_ref (a group NAME whose members come
  from IdAM/Users) or cidr (an IP/subnet).
- Binding: as OBJ-03 (`spec.selector_kind`).
- BFF route / Engine op: as OBJ-03.
- Fields: options depend on Kind: Network -> cidr, exact, glob; Group -> group_ref; every other kind ->
  exact, glob. Default: Network cidr, Group group_ref, otherwise glob. BFF: one of the four tags but does
  NOT check the kind/selector pairing (forgecentral/apps/bff/src/server.ts:1287-1293). UNVERIFIED: engine pairing rules.
- Applies / Gating / Failure states: as OBJ-03 (a 400 reads "the selector does not fit the kind").
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:39-48, 83-85, 142-160.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:19-24 introduced Cidr).

### OBJ-F4 Value (selector value)
- Location: Objects > form > "Value".
- Configures: the selector's value (pattern, exact value, group name or CIDR).
- Binding: as OBJ-03 (`spec.selector_value`).
- BFF route / Engine op: as OBJ-03.
- Fields: string, required, trimmed; placeholder by selector/kind: cidr "e.g. 10.8.0.0/16"; group_ref
  "the group name (members come from IdAM/Users)"; Data Store "a locator (s3://bucket) or a path glob
  (/data/phi/**)"; Script "a path or path glob (**/backup.ps1)"; Server "a host name or glob (prod-*)";
  otherwise "an exact value or a glob (*)". BFF: non-blank. UNVERIFIED: engine format checks (e.g. CIDR
  syntax).
- Applies / Gating / Failure states: as OBJ-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:50-58, 86, 161-170.
- TRD drift: none.

### OBJ-F5 Description
- Location: Objects > form > "Description".
- Configures: free-text description shown on the card.
- Binding: as OBJ-03 (`spec.description`).
- BFF route / Engine op: as OBJ-03.
- Fields: optional, trimmed; card shows "--" when empty.
- Applies / Gating / Failure states: as OBJ-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:87, 101, 171-178, 346-348.
- TRD drift: none.

### OBJ-06 Object lifecycle, tags, attributes (no authoring control)
- Location: Objects > card badges (lifecycle, tags); drawer tags (attributes).
- Configures: nothing from the Console.
- Binding: carried on `objects.create` / `objects.edit` but never set by an operator input.
- BFF route / Engine op: as OBJ-03 / OBJ-04.
- Fields: lifecycle -- every Console-created object is "draft"; edit preserves the current value; no
  publish action exists (the engine's edit does support draft -> published,
  crucible/crates/cdb-cyber/src/object_store.rs:180-181). Tags -- new objects get none; edit preserves them;
  displayed and searchable only. Attributes (`broker` / `in_zone`) -- shown only in the drawer, never
  authorable, and cleared by a Console edit (OBJ-04).
- Applies / Gating: n/a.
- Preconditions and disabled states: n/a.
- Failure states: n/a. The card code calls a draft "not yet policy-referenceable"
  (forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:34), yet Policies offers draft objects as Subjects/Targets (POL-F3). UNVERIFIED:
  whether the engine refuses a rule built from a draft object (rules carry a copied selector; not
  checked).
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:34-37, 102-103, 343, 349-357;
  forgecentral/packages/contracts/src/objects.ts:73-80.
- TRD drift: TRD-10 says the Console edits tags and classification (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:73-74, 78-79); neither is
  editable.

### OBJ-07 Object detail in the drawer (members; governing policies)
- Location: Objects > click a card's name -> entity drawer (hover prefetches it).
- Configures: nothing (read-only), except the drawer's Isolate button (DRW-03), which is shown for
  objects too.
- Binding: `objects.detail` (read, LIVE, op `object_detail_v1`); `objects.governingPolicies` (read,
  PENDING, owning repo crdb, gating task "TRD-CONSOLE-05 Policy surface (object -> governing-policy
  resolution)").
- BFF route: GET /api/entity/object/<name> -> handleEntityDetail -> resolveEntityDetail ->
  resolveObjectEntity (forgecentral/apps/bff/src/server.ts:172, 199-227;
  forgecentral/apps/bff/src/engine/entity-detail.ts:214-276). (GET /api/objects/detail?name= also exists but no
  SPA code calls it; `fetchObjectDetail` is unused, forgecentral/apps/console/src/surfaces/useObjects.ts:31-39.)
- Engine op: `ObjectDetail` { request_id: 0, name } (forgecentral/apps/bff/src/engine/wire-client.ts:796; forgecentral/packages/wire/src/dispatch.ts:70).
- Fields: Status = name + kind label + an "unknown" status badge; Information = Role "None", Clearance
  "None", Enrolled, Tags: `selector=<form> <value>`, `lifecycle=<x>`, `tag=<t>`, `attribute=<a>`, and one
  `member=<m>` per entity the selector matches AT READ TIME (empty when nothing matches). Enrolled is
  always "1970-01-01 00:00 UTC" for an object (the resolver sets enrolledAt 0 and the drawer formats it,
  forgecentral/apps/bff/src/engine/entity-detail.ts:274; forgecentral/packages/design/src/components/EntityDrawer.tsx:211-214) -- a display defect
  by code reading. Effective policies: "Not yet available (TRD-CONSOLE-05 Policy surface (object ->
  governing-policy resolution))." Connected VTZs, Capabilities, Recent decisions: not rendered.
- Applies: n/a.
- Gating: none (X-1).
- Preconditions and disabled states: an unknown name renders Status and Information as "None.".
- Failure states: an engine error renders "object registry unavailable" in Status and Information.
- Evidence: forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:326-342;
  forgecentral/packages/bindings/src/manifest.ts:570-592.
- TRD drift: TRD-10 promises governing policies, the principals/zones that reach the object, and recent
  decisions (forgecentral/docs/spec/TRD-CONSOLE-10-objects.md:69-71, 83-85, 100); only members are shown. The PENDING gating task names the Policy
  surface, which has shipped (stale reason, as VTZ-10).

---

## G. Users (`/users`) -- All Users, Groups, External IDAM

### USR-01 All Users table
- Location: Users > "All Users" tab > table (caption "Every principal the engine authorizes").
- Configures: nothing (read-only); hosts the row actions (USR-04/05) and opens the drawer on row click.
- Binding: `users.list` (read, LIVE, op `list_principals_v1`); the AI-agent rows come from LIST_AGENTS
  (the op registered for `entity.header`, not a separate users binding).
- BFF route: GET /api/users -> handleUsers -> resolveUsersList (ListPrincipals + ListAgents concurrently,
  merged, sorted by username then id; no BFF cache) (forgecentral/apps/bff/src/server.ts:1218-1254;
  forgecentral/apps/bff/src/engine/users.ts:56-84).
- Engine op: `ListPrincipals`, `ListAgents` (forgecentral/apps/bff/src/engine/wire-client.ts:657, 646; forgecentral/packages/wire/src/dispatch.ts:65, 28).
- Fields (columns): Name; ID; Email ("--" when empty); Org ("--"); Groups (chips or "--"); Type ("Human" /
  "Service Account" / "AI Agent"); Status (badge: active good; suspended, disabled caution; revoked,
  compromised critical); Origin (the connector label for a federated account, e.g. "Auth0"; "Local" for
  an operator-provisioned record; "Observed" otherwise); Remote "--" and Compliance "--" (no engine
  substrate); Actions (USR-04/05 on Local rows, "--" otherwise). Row click opens the principal drawer;
  hover prefetches it.
- Applies: re-read on mount and after any users/groups command; not polled.
- Gating: none (X-1).
- Preconditions and disabled states: "Loading the principal directory"; empty -> "No principals match" /
  "No principals have been observed or provisioned yet."
- Failure states: "Could not load the principal directory." + retry. BFF 503 when a record carries an
  unknown tag (the whole directory is withheld), 403 on refusal, 502 (forgecentral/apps/bff/src/server.ts:1242-1251).
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:49-93, 203-337, 439-470;
  forgecentral/apps/console/src/surfaces/useUsers.ts:25-49; forgecentral/packages/contracts/src/users.ts:54-124, 285-368;
  forgecentral/packages/bindings/src/manifest.ts:405-425.
- TRD drift: TRD-04 Section 2.1 lists Type "Employee / Contractor / Partner / Service Account / AI
  Agent", Status "Pending / Active / Suspended / Revoked", a Remote Yes/No flag, Compliance chips, and "an
  audited engine export" (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:37-46); the code renders the engine tags
  (no Pending; adds disabled/compromised), Remote/Compliance are always "--", and there is no export. TRD-04
  calls the table server-paged (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:61-62, 93); it is a complete read.

### USR-02 Search users + Type / Status / Origin filters
- Location: Users > All Users > "Search users...", "Type", "Status", "Origin".
- Configures: nothing (client-side view over the complete directory).
- Binding / BFF route / Engine op: none beyond USR-01.
- Fields: search = substring over username, principal id, email, org and group chips; Type = All / Human
  / Service Account / AI Agent; Status = All / active / suspended / revoked / disabled / compromised (raw
  tags); Origin = All / Local / Observed. Federated (IdAM) rows are origin "observed" engine-side, so the
  Observed filter includes them (crucible/crates/cdb-cyber/src/lug_directory.rs:292-318). No match -> "No
  principals match" / "No principal matches <filters>."
- Applies: immediately.
- Gating: none.
- Preconditions and disabled states: none.
- Failure states: n/a.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:207-232, 339-409, 459-468.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:46 "Search + structured filters").

### USR-03 Add a user
- Location: Users > All Users > "+ Add" (toggles the inline form, aria "Add a user") > "Create User".
- Configures: provisions a LOCAL enterprise principal (origin "Local"), a first-class directory citizen
  for RBAC alignment and policy scoping.
- Binding: `users.create` (command, LIVE, op `principal_create_v1`, authz label `operator:users.manage`,
  audited).
- BFF route: POST /api/users -> handleUsersCommand -> parsePrincipalDraft -> resolveCreatePrincipal
  (forgecentral/apps/bff/src/server.ts:1116-1130, 1132-1172; forgecentral/apps/bff/src/engine/users.ts:121-133).
- Engine op: `PrincipalCreate` { request_id, operator, spec: { username, subject_type, email?, org? } }
  (forgecentral/apps/bff/src/engine/wire-client.ts:689; forgecentral/packages/wire/src/dispatch.ts:101; forgecentral/packages/contracts/src/generated/wire-dto.ts:875-880).
- Fields: USR-F1..USR-F4.
- Applies: on commit; users and groups re-read; the form closes. UNVERIFIED: the initial status the
  engine assigns (not checked).
- Gating: no role/tier check (X-1). No confirm dialog.
- Preconditions and disabled states: submit disabled while pending ("Committing...") or when User Name
  is blank; a real form, so the browser enforces `required` and the email format.
- Failure states: 409 -> "A principal with that username already exists."; 400 -> "The form is incomplete
  or malformed."; other HTTP -> "The engine refused the command."; network -> "The command could not reach
  the engine."
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:95-200, 349-355, 411-413;
  forgecentral/apps/console/src/surfaces/useUsers.ts:57-94; forgecentral/packages/bindings/src/manifest.ts:457-466.
- TRD drift: TRD-04 says add/edit are "tier-gated (Admin/SecurityAudit)" and confirm-gated
  (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:78-80, 105-106); there is no tier gate in the Console path (X-1) and no confirm.

### USR-04 Edit a user
- Location: Users > All Users > a Local row > "Edit" -> form (aria "Edit <username>") > "Save".
- Configures: rewrites the local record's enterprise fields (type, email, organization).
- Binding: `users.edit` (command, LIVE, op `principal_edit_v1`, authz label `operator:users.manage`,
  audited).
- BFF route: POST /api/users/edit -> handleUsersCommand -> resolveEditPrincipal
  (forgecentral/apps/bff/src/engine/users.ts:136-148).
- Engine op: `PrincipalEdit` { request_id, operator, spec } (forgecentral/apps/bff/src/engine/wire-client.ts:700; forgecentral/packages/wire/src/dispatch.ts:102).
- Fields: User Name read-only (the natural key); Type, Email, Organization editable. A cleared Email or
  Organization is sent ABSENT (not as an empty string) (forgecentral/apps/console/src/surfaces/UsersSurface.tsx:133-134;
  forgecentral/packages/contracts/src/users.ts:376-383). UNVERIFIED: whether the engine treats absent as "clear" or
  "keep".
- Applies: on commit; directory re-reads.
- Gating: no role/tier check (X-1). No confirm dialog.
- Preconditions and disabled states: Edit is offered only on Origin "Local" rows. Federated (IdAM) rows
  are origin "observed" engine-side and show no actions, so the engine's IdAM-owned-field refusal is not
  reachable from the UI (crucible/crates/cdb-cyber/src/lug_directory.rs:292-318).
- Failure states: as USR-03 (the 409 line says "already exists" even when the record is gone).
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:112-137, 276-293;
  forgecentral/apps/console/src/surfaces/useUsers.ts:97-103; forgecentral/packages/bindings/src/manifest.ts:467-476.
- TRD drift: TRD-04 expects a typed refusal naming the owning connector for IdAM-owned fields
  (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:70-71, 106-107); the UI never offers such an edit.

### USR-05 Suspend / Activate / Revoke a user
- Location: Users > All Users > a Local row > "Suspend" (when active) or "Activate" (any other status),
  plus "Revoke" (unless already revoked) -> confirm "<Suspend|Activate|Revoke> <username>?" -> "Commit".
- Configures: the local principal's lifecycle status; never a delete (history preserved).
- Binding: `users.setStatus` (command, LIVE, op `principal_set_status_v1`, authz label
  `operator:users.manage`, audited).
- BFF route: POST /api/users/status { username, status } -> resolveSetPrincipalStatus; status must be
  active, suspended or revoked, else 400 (forgecentral/apps/bff/src/server.ts:1173-1183;
  forgecentral/apps/bff/src/engine/users.ts:154-167).
- Engine op: `PrincipalSetStatus` { request_id, operator, username, status } (forgecentral/apps/bff/src/engine/wire-client.ts:711;
  forgecentral/packages/wire/src/dispatch.ts:103; forgecentral/packages/contracts/src/generated/wire-dto.ts:868-873).
- Fields: none beyond the chosen target status.
- Applies: on commit; directory re-reads. UNVERIFIED: the runtime access effect of a status change
  (engine/Torch side).
- Gating: no role/tier check (X-1). Confirm: title "<Activate|Suspend|Revoke> <username>?"; Revoke adds the
  description "Revocation closes access; the record stays in history and is never deleted." and the
  critical tone; Suspend/Activate have no description; confirm label "Commit".
- Preconditions and disabled states: Local rows only. "Activate" is offered on a REVOKED row too, and the
  engine sets any listed status with no transition check
  (crucible/crates/cdb-cyber/src/lug_provision.rs:318-339) -- so, by code reading, a revocation can be undone from
  the Console.
- Failure states: NOT SHOWN -- the status mutation's error is never rendered
  (forgecentral/apps/console/src/surfaces/UsersSurface.tsx:206, 432 are its only uses).
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:209-212, 294-329, 415-437;
  forgecentral/apps/console/src/surfaces/useUsers.ts:106-116; forgecentral/packages/bindings/src/manifest.ts:477-486.
- TRD drift: TRD-04's path is "a principal (1) -> Suspend/Revoke (2) -> confirm (3)" from the drawer
  (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:86); the actions live on the table row, not in the drawer.

### USR-F1 User Name
- Location: Users > Add/Edit form > "User Name".
- Configures: the principal's username (natural key; unique).
- Binding: `users.create` / `users.edit` (`spec.username`); setStatus keys on it.
- BFF route / Engine op: as USR-03.
- Fields: string, required, trimmed, read-only on edit. BFF: non-blank. Duplicate -> 409. UNVERIFIED:
  engine character/length rules.
- Applies / Gating / Failure states: as USR-03.
- Preconditions and disabled states: read-only in edit mode.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:122, 131, 149-158;
  forgecentral/apps/bff/src/server.ts:1122-1124.
- TRD drift: none.

### USR-F2 Type
- Location: Users > Add/Edit form > "Type".
- Configures: the principal's subject type.
- Binding: as USR-03 (`spec.subject_type`).
- BFF route / Engine op: as USR-03.
- Fields: "Human" (human) / "Service Account" (service); default Human (an edited service row opens as
  Service Account). "AI Agent" cannot be provisioned here. BFF: human or service only.
- Applies / Gating / Failure states: as USR-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:123-125, 159-169;
  forgecentral/apps/bff/src/server.ts:1123-1124.
- TRD drift: TRD-04's Employee/Contractor/Partner sub-types do not exist (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:40).

### USR-F3 Email Address
- Location: Users > Add/Edit form > "Email Address".
- Configures: the enterprise record's email.
- Binding: as USR-03 (`spec.email`, omitted when blank).
- BFF route / Engine op: as USR-03.
- Fields: optional; browser email-format validation (type=email); trimmed; blank -> absent. BFF: any
  non-blank string. UNVERIFIED: engine format checks.
- Applies / Gating / Failure states: as USR-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:126, 133, 170-178;
  forgecentral/apps/bff/src/server.ts:1125-1126.
- TRD drift: none.

### USR-F4 Organization
- Location: Users > Add/Edit form > "Organization".
- Configures: the enterprise record's organization.
- Binding: as USR-03 (`spec.org`, omitted when blank).
- BFF route / Engine op: as USR-03.
- Fields: optional free text, trimmed; blank -> absent.
- Applies / Gating / Failure states: as USR-03.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:127, 134, 179-182;
  forgecentral/apps/bff/src/server.ts:1127-1128.
- TRD drift: none.

### GRP-01 Groups tab (cards + show members)
- Location: Users > "Groups" tab > "User Groups" > cards.
- Configures: nothing (read-only). The member-count link switches to All Users filtered to the group.
- Binding: `groups.list` (read, LIVE, op `list_groups_v1`); `groups.detail` is registered on the same op
  and has no separate consumer.
- BFF route: GET /api/users/groups -> handleUsers -> resolveGroupsList (no cache)
  (forgecentral/apps/bff/src/engine/users.ts:206-214).
- Engine op: `ListGroups` (forgecentral/apps/bff/src/engine/wire-client.ts:667; forgecentral/packages/wire/src/dispatch.ts:66).
- Fields (card): name; "built-in" badge for observed/system groups; "<n> member(s)" (direct members)
  link, aria "Show the <n> members of <group>"; description or "--". No per-group edit or settings control.
- Applies: re-read on mount and after users/groups commands.
- Gating: none (X-1).
- Preconditions and disabled states: "Loading the group directory"; none -> "No groups" / "No groups
  have been observed or created yet."
- Failure states: "Could not load the group directory." + retry; 403; 502 (group projection is total, so
  no 503 path, forgecentral/packages/contracts/src/users.ts:328-338, 370-373).
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:476-481, 567-603, 606-640;
  forgecentral/apps/console/src/surfaces/useUsers.ts:34-54; forgecentral/packages/bindings/src/manifest.ts:426-443.
- TRD drift: TRD-04 group cards have "a settings affordance" (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:49-51); none exists.

### GRP-02 Create a group
- Location: Users > Groups > "+ Create Group" (toggles the form, aria "Create a group") > "Create".
- Configures: creates an enterprise group (name + description); a duplicate name is refused.
- Binding: `groups.create` (command, LIVE, op `group_create_v1`, authz label `operator:users.manage`,
  audited).
- BFF route: POST /api/users/groups { name, description } -> handleUsersCommand -> resolveCreateGroup
  (400 when name is blank) (forgecentral/apps/bff/src/server.ts:1159-1160, 1193-1201;
  forgecentral/apps/bff/src/engine/users.ts:101-114).
- Engine op: `GroupCreate` { request_id, operator, name, description } (forgecentral/apps/bff/src/engine/wire-client.ts:678;
  forgecentral/packages/wire/src/dispatch.ts:98; forgecentral/packages/contracts/src/generated/wire-dto.ts:351-356).
- Fields: GRP-F1.
- Applies: on commit; groups and users re-read; the form closes and clears.
- Gating: no role/tier check (X-1). No confirm dialog.
- Preconditions and disabled states: "Create" disabled while pending ("Creating...") or when Name is
  blank; the browser enforces `required`.
- Failure states: 409 -> "A group with that name already exists."; 400 -> "The group name is required.";
  other HTTP -> "The engine refused the command."; network -> "The command could not reach the engine."
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:482-565;
  forgecentral/apps/console/src/surfaces/useUsers.ts:123-148; forgecentral/packages/bindings/src/manifest.ts:487-495.
- TRD drift: forgecentral/docs/spec/TRD-CONSOLE-04-users.md:89 matches; members cannot be added afterwards from the UI (GRP-04).

### GRP-F1 Group Name / Description
- Location: Users > Groups > Create form > "Name", "Description".
- Configures: the group's name (key) and description.
- Binding: as GRP-02.
- BFF route / Engine op: as GRP-02.
- Fields: Name required, trimmed; Description optional, trimmed. UNVERIFIED: engine bounds.
- Applies / Gating / Failure states: as GRP-02.
- Preconditions and disabled states: as GRP-02.
- Evidence: forgecentral/apps/console/src/surfaces/UsersSurface.tsx:484-497, 532-548.
- TRD drift: none.

### GRP-03 Edit a group's description
- Location: none in the SPA.
- Configures: an enterprise group's description.
- Binding: `groups.edit` (command, LIVE, op `group_edit_v1`, authz label `operator:users.manage`,
  audited).
- BFF route: POST /api/users/groups/edit { name, description } -> resolveEditGroup
  (forgecentral/apps/bff/src/server.ts:1111, 1193-1201; forgecentral/apps/bff/src/engine/users.ts:170-183).
- Engine op: `GroupEdit` (forgecentral/apps/bff/src/engine/wire-client.ts:721; forgecentral/packages/wire/src/dispatch.ts:99).
- Fields: name (non-blank), description.
- Applies / Gating / Preconditions and disabled states / Failure states: n/a in the UI (useUsers.ts has no edit-group hook).
- Evidence: forgecentral/apps/console/src/surfaces/useUsers.ts:1-148; forgecentral/packages/bindings/src/manifest.ts:496-504.
- TRD drift: TRD-04 lists `groups.edit` as a surface command (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:72); not exposed.

### GRP-04 Set a group's members
- Location: none in the SPA.
- Configures: an enterprise group's DIRECT membership, as a set-diff (additions written, removals
  tombstoned; observed device memberships untouched).
- Binding: `groups.setMembers` (command, LIVE, op `group_set_members_v1`, authz label
  `operator:users.manage`, audited).
- BFF route: POST /api/users/groups/members { name, members: string[] } -> resolveSetGroupMembers;
  non-string entries are silently dropped (forgecentral/apps/bff/src/server.ts:1184-1192;
  forgecentral/apps/bff/src/engine/users.ts:185-203).
- Engine op: `GroupSetMembers` { request_id, operator, name, members } (forgecentral/apps/bff/src/engine/wire-client.ts:732;
  forgecentral/packages/wire/src/dispatch.ts:100; forgecentral/packages/contracts/src/generated/wire-dto.ts:344-349).
- Fields: name, members.
- Applies / Gating / Preconditions and disabled states / Failure states: n/a in the UI.
- Evidence: forgecentral/packages/bindings/src/manifest.ts:505-514.
- TRD drift: TRD-04 lists `groups.setMembers` (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:72) and "manage group membership" (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:27);
  not exposed. Groups created in the Console therefore stay empty unless membership arrives otherwise.

### IDM-01 External IDAM connector cards (status)
- Location: Users > "External IDAM" tab > "External Identity & Access Management". The SAME component is
  mounted on Settings > Federation > "Identity providers" (forgecentral/apps/console/src/surfaces/SettingsIdentityTabs.tsx:197-203).
- Configures: nothing (read-only); hosts Sync Now (IDM-03) and Configure (IDM-02).
- Binding: `idam.connectors` (read, LIVE, op `idam_connectors_v1`).
- BFF route: GET /api/idam/connectors -> handleIdam -> resolveIdamConnectors (no cache)
  (forgecentral/apps/bff/src/server.ts:2559-2589; forgecentral/apps/bff/src/engine/idam.ts:45-50).
- Engine op: `IdamConnectors` { request_id } (forgecentral/apps/bff/src/engine/wire-client.ts:753; forgecentral/packages/wire/src/dispatch.ts:87).
- Fields (card): display name; a state badge derived fail-closed, first match wins: "Disabled" (not
  enabled), "Syncing" (running), "Error" (a last error), "Never synced" (no last sync), then "Connected"
  (complete) / "Partial sync" (partial) / "Error" (failed) / "Unknown" (anything else); provider tenant or
  "No tenant configured"; "Last sync" (UTC "YYYY-MM-DD HH:MM:SS" or "Never"); "Objects synced"; "Poll
  interval" "<n>s"; the engine's last error text. The full-sync cadence is read but not displayed.
- Applies: re-read on mount and after sync/connect; polls every 3 s while any connector is running.
  Engine context (by code reading): the connector is ONE node-level Auth0 connector, not per tenant --
  IDAM_CONNECTORS returns the node's single connector snapshot to any admitted tenant
  (crucible/crates/cdb-server/src/handler.rs:2594-2623).
- Gating: none (X-1).
- Preconditions and disabled states: "Loading identity connectors"; none configured -> "No IdAM connector
  configured" / "No external identity connector is configured on this node yet." + "Onboard Auth0".
- Failure states: "Could not load identity connectors." + retry; 403; 502.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:23-49, 218-318;
  forgecentral/apps/console/src/surfaces/useIdam.ts:21-41; forgecentral/packages/contracts/src/users.ts:143-201, 398-461;
  forgecentral/packages/bindings/src/manifest.ts:444-453.
- TRD drift: TRD-04 names Okta, Azure AD and Google Workspace connectors (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:53-57); only Auth0 can be
  onboarded (the button, and the sidecar accepts only provider "auth0",
  forgecentral/sidecar/src/secret_service.rs:48-50, 162-166).

### IDM-02 Onboard Auth0 / Configure -> Save connector
- Location: Users > External IDAM > empty state "Onboard Auth0", or a card's "Configure" -> form (aria
  "Configure <provider>") > "Save connector". (Same on Settings > Federation.)
- Configures: in three sequential, non-atomic calls: (1) writes the connector's client secret to the
  node's protected secret file; (2) sets the connector's connectivity (domain, client id, audience, secret
  path) and re-spawns it; (3) enables it and sets its two sync cadences.
- Binding: `idam.connect` (command, LIVE, op `idam_connect_v1`, authz label `operator:users.manage`,
  audited) and `idam.configure` (command, LIVE, op `idam_configure_v1`, same label, audited). Step (1) has
  NO binding: it goes to the crypto sidecar, not the engine.
- BFF route: (1) POST /api/idam/secret { provider, secret } -> handleIdamSecret -> setConnectorSecret
  (loopback to the sidecar secret leg on `FC_IDAM_SECRET_PORT`; 503 `secret_plane_unprovisioned` when
  unset) (forgecentral/apps/bff/src/server.ts:2392-2444; forgecentral/apps/bff/src/engine/secret-client.ts:56-110;
  forgecentral/apps/bff/src/config.ts:59, 211). (2) POST /api/idam/connect { provider, domain, clientId, audience }
  -> handleIdamConnect -> resolveIdamConnect, with `client_secret_ref` FIXED to
  "/etc/cdb/secrets/auth0-management.secret" (forgecentral/apps/bff/src/server.ts:1926, 2446-2509;
  forgecentral/apps/bff/src/engine/idam.ts:80-94). (3) POST /api/idam/configure { provider, enabled: true,
  pollIntervalSecs, fullSyncCadenceHours } -> handleIdamConfigure -> resolveIdamConfigure
  (forgecentral/apps/bff/src/server.ts:1928-1986; forgecentral/apps/bff/src/engine/idam.ts:102-114).
- Engine op: (2) `IdamConnect` { request_id, operator, provider, domain, client_id, audience,
  client_secret_ref } (forgecentral/apps/bff/src/engine/wire-client.ts:774; forgecentral/packages/wire/src/dispatch.ts:89; forgecentral/packages/contracts/src/generated/wire-dto.ts:367-375). (3) `IdamConfigure` {
  request_id, operator, provider, enabled, poll_interval_secs, full_sync_cadence_hours }
  (forgecentral/apps/bff/src/engine/wire-client.ts:785; forgecentral/packages/wire/src/dispatch.ts:90; forgecentral/packages/contracts/src/generated/wire-dto.ts:358-365). (1) is not an engine op: the sidecar accepts
  only provider "auth0" and a non-empty secret and writes it atomically with mode 0640
  (forgecentral/sidecar/src/secret_service.rs:48-50, 151-200).
- Fields: IDM-F1..IDM-F6. Provider is fixed: "auth0" when onboarding, the card's connector id on
  Configure. The form's note reads: "The secret is written to this node's protected store and never
  leaves it; the console never stores it or sends it over the engine wire. Cadences are engine-bounded
  (poll 60-86400s, full sync 1-168h)."
- Applies: connect is "applied live via a fail-closed re-spawn", configure "applied without restart"
  (manifest comments, forgecentral/packages/bindings/src/manifest.ts:516-538); the connector list re-reads on
  success. By code reading, both engine handlers change IN-MEMORY state on the node-level connector
  (pending connectivity + re-spawn; cadence and enabled atomics) and commit nothing to the audit chain
  (they return commit_version 0) (crucible/crates/cdb-server/src/handler.rs:2667-2691, 2725-2754;
  crucible/crates/cdb-ingest/src/connector.rs:316-318, 363-386) -- contrary to the manifest's `audited:
  true` for `idam.connect` / `idam.configure`. UNVERIFIED: whether these settings survive an engine
  restart (no persistence call in the handlers; boot wiring not read).
- Gating: no role/tier check on any of the three routes (X-1). The secret write additionally has no
  engine authorization at all: the BFF route checks only for a session (forgecentral/apps/bff/src/server.ts:2400-2404) and the
  sidecar leg takes no caller identity, and it runs BEFORE the engine sees the connect -- so, by code
  reading, any signed-in operator can replace the node's Auth0 client-secret file even if the engine then
  refuses the connect. No confirm dialog.
- Preconditions and disabled states: submit disabled while pending ("Configuring...") or when Provider
  Domain, Client ID or Client Secret is blank; it is a real form, so the browser also enforces `required`
  and the number bounds. Configure on an existing card pre-fills ONLY the domain: Client ID, Audience and
  Client Secret start empty and the cadences reset to 300 s / 24 h instead of the connector's current
  values -- changing one cadence means re-entering the client id and the secret.
- Failure states: the first failing call stops the chain. 409 -> "The engine rejected the connectivity or
  the secret." (also a sidecar refusal of step 1); 403 -> "You do not have permission to configure
  connectors."; 503 -> "The secret store is not available on this node." (also returned for engine
  unavailable on steps 2-3); anything else (400, 502) -> "The connector could not be configured.";
  network -> "The request could not reach the server." Partial outcomes are not reported: step 1 may have
  replaced the secret file when step 2 fails; step 2 may have applied when step 3 fails. The secret path is
  one node-wide file regardless of tenant (forgecentral/apps/bff/src/server.ts:1926), matching the engine's single node-level
  connector (IDM-01) -- so an operator of ANY tenant reconfigures the one connector every tenant shares.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:70-216, 230-256, 305-313;
  forgecentral/apps/console/src/surfaces/useIdam.ts:76-152.
- TRD drift: TRD-04 lists only `idam.configure(connector)` / `idam.sync(connector)` (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:73);
  `idam.connect` and the sidecar secret write are absent from the TRD.

### IDM-F1 Provider Domain
- Location: IDAM form > "Provider Domain" (placeholder "dev-xxxx.us.auth0.com").
- Configures: the provider tenant domain the connector authenticates against.
- Binding: `idam.connect` (`domain`).
- BFF route / Engine op: IDM-02 step 2.
- Fields: required, trimmed; pre-filled with the card's provider tenant on Configure. BFF: non-blank
  (forgecentral/apps/bff/src/server.ts:2482-2485). The engine validates (a malformed value -> Framing -> 400).
- Applies / Gating / Failure states: as IDM-02.
- Preconditions and disabled states: required.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:98, 130-139.
- TRD drift: none.

### IDM-F2 Client ID
- Location: IDAM form > "Client ID".
- Configures: the client id of the provider machine-to-machine application.
- Binding: `idam.connect` (`client_id`).
- BFF route / Engine op: IDM-02 step 2.
- Fields: required, trimmed; always starts empty (also on Configure). BFF: non-blank.
- Applies / Gating / Failure states: as IDM-02.
- Preconditions and disabled states: required.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:99, 140-148.
- TRD drift: none.

### IDM-F3 Audience
- Location: IDAM form > "Audience" (placeholder "(defaults to the Management API)").
- Configures: the Management API audience; empty lets the engine derive the conventional value
  (forgecentral/packages/contracts/src/users.ts:238).
- Binding: `idam.connect` (`audience`).
- BFF route / Engine op: IDM-02 step 2.
- Fields: optional, trimmed; always starts empty.
- Applies / Gating / Failure states: as IDM-02.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:100, 149-157.
- TRD drift: none.

### IDM-F4 Client Secret (secret write)
- Location: IDAM form > "Client Secret" (password field, autocomplete off).
- Configures: the connector's client secret, written to the node's secret file (mode 0640) by the
  sidecar; the engine only ever receives the file path.
- Binding: none (sidecar leg); see IDM-02 step 1.
- BFF route / Engine op: POST /api/idam/secret -> sidecar; no engine op.
- Fields: required, never trimmed, never read back or displayed (write-only). BFF: non-empty string,
  provider non-blank; sidecar: provider must be "auth0", secret non-empty, request <= 64 KiB
  (forgecentral/sidecar/src/secret_service.rs:40-45).
- Applies: immediately on step 1, before the connect call.
- Gating: session only (IDM-02 security note).
- Preconditions and disabled states: required; needs `FC_IDAM_SECRET_PORT` configured.
- Failure states: sidecar refusal -> 409; seam failure -> 503 `secret_plane_unavailable`; unprovisioned
  -> 503 (forgecentral/apps/bff/src/server.ts:2405-2442) -> the IDM-02 copy.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:101, 158-168;
  forgecentral/apps/console/src/surfaces/useIdam.ts:113-122.
- TRD drift: absent from TRD-04.

### IDM-F5 Delta poll interval (seconds)
- Location: IDAM form > "Delta poll interval (seconds)".
- Configures: how often the connector polls the provider for changes.
- Binding: `idam.configure` (`poll_interval_secs`).
- BFF route / Engine op: IDM-02 step 3.
- Fields: integer, default 300 (not the current value), min 60, max 86400 (browser-enforced in this
  form). BFF: must be an integer (forgecentral/apps/bff/src/server.ts:1956-1962); the engine enforces 60..86400 (bounds per the
  contract, forgecentral/packages/contracts/src/users.ts:216; forgecentral/apps/console/src/surfaces/useIdam.ts:84-86).
  The card shows it as "Poll interval <n>s".
- Applies / Gating / Failure states: as IDM-02 (an engine out-of-range refusal -> 400 -> "The connector
  could not be configured.").
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:102, 169-179.
- TRD drift: TRD-04 does not specify cadences.

### IDM-F6 Full directory sync (hours)
- Location: IDAM form > "Full directory sync (hours)".
- Configures: the full-directory re-sync cadence.
- Binding: `idam.configure` (`full_sync_cadence_hours`).
- BFF route / Engine op: IDM-02 step 3.
- Fields: integer, default 24 (not the current value), min 1, max 168 (browser-enforced). BFF: integer;
  engine 1..168 (forgecentral/packages/contracts/src/users.ts:218; forgecentral/apps/console/src/surfaces/useIdam.ts:87-88). Not shown on the card.
- Applies / Gating / Failure states: as IDM-F5.
- Preconditions and disabled states: none.
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:103, 180-190.
- TRD drift: as IDM-F5.

### IDM-03 Sync Now
- Location: Users > External IDAM > a card > "Sync Now" -> confirm "Run a federation sync for
  <provider>?" -> "Sync".
- Configures: queues an immediate federation sync (an ACK; the engine marks the sync due and returns).
- Binding: `idam.sync` (command, LIVE, op `idam_sync_v1`, authz label `operator:users.manage`, audited).
- BFF route: POST /api/idam/sync { provider } -> handleIdamCommand -> resolveIdamSync (400 when blank)
  (forgecentral/apps/bff/src/server.ts:2511-2557; forgecentral/apps/bff/src/engine/idam.ts:62-73).
- Engine op: `IdamSync` { request_id, operator, provider } (forgecentral/apps/bff/src/engine/wire-client.ts:763; forgecentral/packages/wire/src/dispatch.ts:88;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:400-404).
- Fields: none (the card's provider).
- Applies: queued immediately; the card shows "Syncing..." while the engine reports `running`, and the
  list polls every 3 s until it stops. By code reading the IDAM_SYNC handler only marks a full sync due
  on the node-level connector (refused Conflict when the connector is absent or disabled) and commits no
  audit record itself (crucible/crates/cdb-server/src/handler.rs:2632-2657); UNVERIFIED whether the walk it
  triggers writes audit records. The confirm copy calls it "a real audited directory sync".
- Gating: no role/tier check (X-1). Confirm: description "This runs a real audited directory sync against
  the provider.", confirm "Sync" (default tone).
- Preconditions and disabled states: disabled while this connector is running or the request is in
  flight.
- Failure states (on that card, role=alert): 409 -> "The connector is disabled or not configured."; 403 ->
  "You do not have permission to run a sync."; other HTTP -> "The engine refused the sync."; network ->
  "The sync could not reach the engine."
- Evidence: forgecentral/apps/console/src/surfaces/IdamConnectorsPanel.tsx:51-60, 220-224, 261-304, 320-332;
  forgecentral/apps/console/src/surfaces/useIdam.ts:43-74; forgecentral/packages/bindings/src/manifest.ts:539-549.
- TRD drift: none (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:88, 95-96).

### IDM-04 Enable / disable a connector
- Location: none in the SPA (the card can show "Disabled").
- Configures: whether the connector runs.
- Binding: `idam.configure` (LIVE) supports `enabled: false`.
- BFF route: POST /api/idam/configure accepts any boolean (forgecentral/apps/bff/src/server.ts:1953-1958).
- Engine op: `IdamConfigure`.
- Fields: n/a -- every Save connector sends `enabled: true` (forgecentral/apps/console/src/surfaces/useIdam.ts:141).
- Applies / Gating / Preconditions and disabled states / Failure states: n/a in the UI.
- Evidence: as above.
- TRD drift: TRD-04 implies configure covers the connector's settings (forgecentral/docs/spec/TRD-CONSOLE-04-users.md:73); disable is not exposed.

---

## H. The entity drawer (shared)

### DRW-01 Entity drawer entry points + hover prefetch
- Location: a right-side overlay opened from: a Users > All Users row (principal ref); an Objects card
  name (object ref); a member of an Overview container list (principal ref for member kinds
  `agent_instance`, `mcp_server`, `user`; object ref for every other kind, e.g. device endpoints and
  network destinations); a Logs row or the Logs EXPLAIN "View <id>" button (Logs is another slice).
- Configures: nothing. Dismiss with the close button, Escape, or a click on the scrim; a Back control
  appears when the drawer was opened from a container list (DRW-07).
- Binding: see DRW-02.
- BFF route: GET /api/entity/<principal|vtz|object>/<id> -> handleEntityDetail -> resolveEntityDetail
  (forgecentral/apps/bff/src/server.ts:172, 199-227).
- Engine op: see DRW-02.
- Fields: hover on a Users row or an Objects card prefetches the detail so the open is instant.
- Applies: n/a.
- Gating: none (X-1).
- Preconditions and disabled states: nothing in the SPA opens a `vtz` ref (grep of apps/console/src for
  openEntity finds only principal/object/Logs callers); the BFF would resolve a vtz ref through the
  agent/principal directories (forgecentral/apps/bff/src/engine/entity-detail.ts:278-415), not the VTZ store.
- Failure states: a failed detail read -> a drawer titled "Entity" reading "Could not load this entity."
- Evidence: forgecentral/apps/console/src/shell/DrawerHost.tsx:58-157, 162-166;
  forgecentral/apps/console/src/surfaces/UsersSurface.tsx:452-458; forgecentral/apps/console/src/surfaces/ObjectsSurface.tsx:330-338;
  forgecentral/apps/console/src/surfaces/LogsSurface.tsx:108-122, 338-350; forgecentral/packages/contracts/src/overview.ts:590-608;
  forgecentral/packages/design/src/components/Drawer.tsx:17-21, 44-56.
- TRD drift: TRD-12 says any entity, including a VTZ, opens the drawer and that hover prefetches from
  every trigger (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:15-17, 23-29); no VTZ entry exists and the
  Overview graph does not prefetch.

### DRW-02 Entity drawer sections
- Location: the drawer body.
- Configures: nothing (read-only).
- Binding: `entity.header` + `entity.info` (read, LIVE, op `list_agents_v1`; LUG principals are resolved
  from LIST_PRINCIPALS by the same resolver, not separately registered); `entity.capabilities` (read,
  LIVE, op `agent_capabilities_v1`); `entity.recentDecisions` (read, LIVE, op `entity_decisions_v1`);
  `entity.zones` (read, PENDING, owning repo forge, gating task "Forge VTZ membership store + a queryable
  read surface (not in crdb today)"); `entity.effectivePolicies` (read, PENDING, forge, "Forge
  effective-policy resolution as a queryable read surface (not in crdb today)");
  `overview.entityConnections` (read, LIVE, op `entity_connections_v1`); for objects `objects.detail`
  (LIVE) and `objects.governingPolicies` (PENDING) -- see OBJ-07.
- BFF route: GET /api/entity/<kind>/<id> fans out in parallel, each section degrading on its own:
  ListAgents, ListPrincipals, EntityDecisions (limit 50), and two QuerySubmit reads ("FIND
  agent_capabilities WHERE agent_id = $a RETURN relation, target" and "FIND construction_report WHERE
  agent_id = $a RETURN surface, entry"); an object ref instead reads ObjectDetail
  (forgecentral/apps/bff/src/engine/entity-detail.ts:278-415, 214-276). Connections: GET
  /api/overview/entity-connections?id=&kind= (400 without both) -> resolveEntityConnections
  (forgecentral/apps/bff/src/server.ts:658-704; forgecentral/apps/bff/src/engine/overview.ts:101-115).
- Engine op: `ListAgents`, `ListPrincipals`, `EntityDecisions`, `QuerySubmit`, `ObjectDetail`,
  `EntityConnections` (forgecentral/apps/bff/src/engine/wire-client.ts:646, 657, 1184, 621, 796, 1195; forgecentral/packages/wire/src/dispatch.ts:26-30, 65, 70).
- Fields (sections, in order): "Status" (display name, kind label, status badge active / suspended /
  compromised / unknown); "Information" (Role, Clearance -- "None" when absent -- Enrolled as a UTC stamp,
  Tags as key=value badges: for a LUG principal origin, namespace, lifecycle, email, org, group,
  privilege, identity); "Connected VTZs" (principal: "Not yet available (Forge VTZ membership store (not
  queryable in crdb))."; object: absent); "Capabilities" (agents only: the signed Construction Report rows
  when present, else the AIG capability edges, else "None."; absent for non-agents); "Effective policies"
  (principal: "Not yet available (Forge effective-policy resolution (not queryable in crdb)).");
  "Recent decisions" (principal: outcome badge + summary + time; object: absent); "Connections" (only
  when opened from an Overview member: outbound destinations, empty "No outbound connections observed.",
  error "Could not load connections.").
- Applies: read on open (no live subscription).
- Gating: none (X-1); sections the engine withholds would be absent.
- Preconditions and disabled states: skeletons while loading. An unknown entity shows "None." in Status
  and Information (no typed not-found). Section errors show a message with no per-section retry.
  Recent-decision rows are buttons, but the drawer host passes no click handler (`onOpenDecision`,
  `onOpenZone`, `onOpenPolicy` are never supplied), so clicking one does nothing (by code reading).
- Failure states: per-section messages, e.g. "entity directory unavailable", "agent directory
  unavailable", "capabilities unavailable", "decisions unavailable".
- Evidence: forgecentral/packages/design/src/components/EntityDrawer.tsx:96-137, 172-337;
  forgecentral/apps/console/src/shell/DrawerHost.tsx:146-178; forgecentral/apps/console/src/entity/useEntityDetail.ts:17-40;
  forgecentral/packages/bindings/src/manifest.ts:27-98, 231-240.
- TRD drift: TRD-12 specifies a Trust Score + trend sparkline (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:39-43; struck in code, never amended
  in TRD-12), info fields Trust State / Risk Score / Region / Last Seen (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:46-49; code has Role /
  Clearance / Enrolled / Tags), zones for objects (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:51-54), EXPLAIN click-through on decisions
  (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:76, 102), a LIVE subscription (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:109-110), inline per-section retry (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:115-116) and a
  typed "entity not found" (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:120). TRD-12 still calls effective policies "TRD-04 precedence"
  (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:67-68), which TRD-05 superseded. The Connections section is not in TRD-12.

### DRW-03 Isolate from network
- Location: drawer > "Quick actions" > "Isolate from network" (critical) -> confirm "Isolate from
  network?" -> "Isolate".
- Configures: records an operator containment disposition (Quarantine) on the entity's id: audited and
  attributed to the operator. Enforcement is OFF (AG.7), so nothing is blocked; the engine's own doc says
  the disposition is "distributed to Torch to realize" (crucible/crates/cdb-server/src/handler.rs:2354-2360).
- Binding: `entity.isolate` (command, LIVE, op `entity_isolate_v1`, surface forge, authz label
  `operator:contain`, audited).
- BFF route: POST /api/entity/<kind>/<id>/isolate { commandId, posture } -> handleEntityIsolate ->
  parseIsolateRequest -> resolveIsolate (forgecentral/apps/bff/src/server.ts:230-318;
  forgecentral/apps/bff/src/engine/isolate.ts:34-63).
- Engine op: `Contain` { operator, request: { subject: <entity id>, action: Quarantine | Deny, reason:
  "Operator isolate from the Console (<posture>)", command_id, issued_at: <now ms>,
  derived_from_decision_id: null, ai_assist: null } } (forgecentral/apps/bff/src/engine/wire-client.ts:1227; forgecentral/packages/wire/src/dispatch.ts:45;
  forgecentral/packages/contracts/src/generated/wire-dto.ts:18-26, 192-195).
- Fields: posture -- the SPA always sends "quarantine" (forgecentral/apps/console/src/shell/DrawerHost.tsx:187); the BFF also accepts "deny"
  (forgecentral/apps/bff/src/server.ts:255) but no control offers it. commandId -- a fresh UUID made when "Isolate from network" is
  pressed (forgecentral/apps/console/src/shell/DrawerHost.tsx:177); required non-blank; the engine is idempotent per command id. Body <= 8 KiB.
- Applies: recorded on confirm. Success line: "Isolation recorded (<posture>). Enforcement is off; the
  disposition is audited and distributed to the endpoint." -- fixed text: it does not read the reply's
  `enforcementActive` or `summary` (forgecentral/apps/console/src/shell/DrawerHost.tsx:195-200; forgecentral/apps/bff/src/engine/isolate.ts:58-62).
- Gating: no role/tier check (X-1). Confirm: description "Move <id> into a quarantine posture: contained in
  a locked-down zone with brokered-only egress. The action is recorded and audited. Live enforcement is
  OFF (observe/quarantine posture), so no traffic is blocked yet.", confirm "Isolate" (critical).
- Preconditions and disabled states: shown on EVERY drawer -- principals, objects, and Overview members
  of any kind (e.g. a device endpoint or a network destination) -- with no disabled state and no pending
  indicator.
- Failure states: any failure (400 malformed, 403 refused with class, 405, 502, 503) -> "Isolation could
  not be recorded (refused or unavailable)."
- Evidence: forgecentral/apps/console/src/shell/DrawerHost.tsx:71-74, 177-205;
  forgecentral/apps/console/src/entity/useIsolate.ts:19-46; forgecentral/packages/design/src/components/EntityDrawer.tsx:338-347;
  forgecentral/packages/contracts/src/entity.ts:225-242; forgecentral/packages/bindings/src/manifest.ts:100-112.
- TRD drift: TRD-12 requires the confirm to show "the exact effect" (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:84; forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:429-430); the
  confirm is fixed copy and the posture cannot be chosen. TRD-00/TRD-01 count Isolate as 3 clicks from
  the Overview (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:273; forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:81); via a container list it is 4 (container, member, Isolate, confirm).

### DRW-04 Modify VTZ assignment
- Location: would be a drawer quick action "Modify VTZ assignment"; NOT rendered (the host passes no
  handler, and the design component renders only provided actions).
- Configures: would move the entity into another zone.
- Binding: `entity.reassignZone` (command, PENDING, owning repo forge, gating task "IP-CONSOLE-12 DR.5 /
  IP-CONSOLE-02: Forge VTZ membership-change command", authz label `operator:vtz.reassign`, audited);
  see also `vtz.setMembership` (VTZ-09).
- BFF route: none. Engine op: none.
- Fields / Applies / Gating / Preconditions and disabled states / Failure states: n/a.
- Evidence: forgecentral/packages/design/src/components/EntityDrawer.tsx:28-34, 348-352;
  forgecentral/apps/console/src/shell/DrawerHost.tsx:177; forgecentral/packages/bindings/src/manifest.ts:113-125.
- TRD drift: TRD-12 lists it as a quick action with a 3-click path (forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:85, 101); absent.

### DRW-05 View remediation
- Location: would be a drawer quick action "View remediation"; NOT rendered.
- Configures: navigation to a remediation workflow (not built).
- Binding: `entity.remediation` (command, PENDING, owning repo forgecentral, gating task "IP-CONSOLE-07
  AIOps Workflows surface", authz label `operator:remediation.view`).
- BFF route: none. Engine op: none.
- Fields / Applies / Gating / Preconditions and disabled states / Failure states: n/a.
- Evidence: forgecentral/packages/design/src/components/EntityDrawer.tsx:353-357;
  forgecentral/packages/bindings/src/manifest.ts:126-138.
- TRD drift: forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:86 lists it; absent. Its target surface (Network Ops, ex-AIOps) was removed from the
  nav (NAV-01).

### DRW-06 Open full report
- Location: would be a drawer quick action "Open full report"; NOT rendered.
- Configures: navigation to an entity report (not built).
- Binding: `entity.fullReport` (command, PENDING, owning repo forgecentral, gating task "IP-CONSOLE-08
  Reports surface", authz label `operator:report.view`).
- BFF route: none. Engine op: none.
- Fields / Applies / Gating / Preconditions and disabled states / Failure states: n/a.
- Evidence: forgecentral/packages/design/src/components/EntityDrawer.tsx:358-362;
  forgecentral/packages/bindings/src/manifest.ts:139-151.
- TRD drift: forgecentral/docs/spec/TRD-CONSOLE-12-entity-drawer.md:87 lists it; absent. Note the Reports destination now exists (NAV-01) but this
  binding is still PENDING.

### DRW-07 Container member list (from Overview) + Back
- Location: Overview > click a container -> drawer titled "AI Agents" / "Users" / "Devices" / "Network" /
  "SaaS Apps" / "Private Apps" / "Data Stores" -> list rows "<name>" + "<n> connection(s)" -> click a row
  -> that entity's drawer, with a "Back" control returning to the list.
- Configures: nothing (read-only navigation).
- Binding: none registered for the member read (the manifest has no CONNECTIVITY_MEMBERS binding; grep
  finds none); counts come from `overview.graph`; the member's connections use
  `overview.entityConnections`.
- BFF route: GET /api/overview/members?container=<id> -> serveClassMembers -> resolveClassMembers; 400 for
  a missing or unknown container; destination rings are BFF re-buckets of the engine's flat `network`
  members using reverse DNS (forgecentral/apps/bff/src/server.ts:715-766;
  forgecentral/apps/bff/src/engine/overview.ts:147-178).
- Engine op: `ConnectivityMembers` { request_id: 0, operator, class, limit: 500 }
  (forgecentral/apps/bff/src/engine/overview.ts:120, 181-188; forgecentral/apps/bff/src/engine/wire-client.ts:1217; forgecentral/packages/wire/src/dispatch.ts:36).
- Fields: rows ordered by the engine (connection count, highest first).
- Applies: read on open; BFF cache 2 s.
- Gating: none (X-1).
- Preconditions and disabled states: skeleton rows while loading; empty -> "No members observed in this
  container."
- Failure states: "Could not load this container's members." + "Retry".
- Evidence: forgecentral/packages/design/src/components/ContainerMembersView.tsx:33-91;
  forgecentral/apps/console/src/shell/DrawerHost.tsx:86-107, 143-144, 208-217;
  forgecentral/apps/console/src/surfaces/useClassMembers.ts:18-43.
- TRD drift: TRD-01/TRD-12 open the entity drawer directly from the graph (forgecentral/docs/spec/TRD-CONSOLE-01-overview.md:62-67); the list step
  is not in either TRD. The member read is outside the binding registry (a no-stub contract gap: every
  value the Console renders is supposed to have a registered binding, forgecentral/packages/bindings/src/manifest.ts:3-6).

---

## I. Binding coverage (all 52 manifest bindings in this slice)

| Binding | Kind | Status | Where it surfaces (item) |
|---------|------|--------|--------------------------|
| entity.header | read | LIVE | DRW-02 |
| entity.info | read | LIVE | DRW-02 |
| entity.zones | read | PENDING (forge) | DRW-02 pending note |
| entity.effectivePolicies | read | PENDING (forge) | DRW-02 pending note |
| entity.recentDecisions | read | LIVE | DRW-02 |
| entity.capabilities | read | LIVE | DRW-02 |
| entity.isolate | command | LIVE | DRW-03 |
| entity.reassignZone | command | PENDING (forge) | DRW-04 (not rendered) |
| entity.remediation | command | PENDING (forgecentral) | DRW-05 (not rendered) |
| entity.fullReport | command | PENDING (forgecentral) | DRW-06 (not rendered) |
| overview.graph | read | LIVE | OV-01..OV-05, VTZ-01 (risk join) |
| overview.entityConnections | read | LIVE | DRW-02 Connections |
| overview.live | read | PENDING (crdb) | OV-06 (polling instead) |
| vtz.tree | read | LIVE | VTZ-01, VTZ-02, POL-01 order, POL-F2 |
| vtz.detail | read | LIVE | VTZ-04, DIST-02 |
| vtz.riskBand | read | LIVE | VTZ-01 |
| vtz.memberCounts | read | PENDING (crdb) | VTZ-09 "Not available" |
| vtz.policyCount | read | PENDING (crdb; stale reason) | VTZ-10 "Not available" |
| vtz.create | command | LIVE | VTZ-05 |
| vtz.edit | command | LIVE | VTZ-06, VTZ-07 |
| vtz.rescope | command | LIVE | VTZ-07 (unreachable by code reading) |
| vtz.delete | command | LIVE | VTZ-08 |
| vtz.setMembership | command | PENDING (crdb) | VTZ-09 (no control) |
| users.list | read | LIVE | USR-01 |
| users.detail | read | LIVE | DRW-02 (principal drawer) |
| groups.list | read | LIVE | GRP-01 |
| groups.detail | read | LIVE | no separate consumer (GRP-01) |
| idam.connectors | read | LIVE | IDM-01 |
| users.create | command | LIVE | USR-03 |
| users.edit | command | LIVE | USR-04 |
| users.setStatus | command | LIVE | USR-05 |
| groups.create | command | LIVE | GRP-02 |
| groups.edit | command | LIVE | GRP-03 (WIRED-NO-UI) |
| groups.setMembers | command | LIVE | GRP-04 (WIRED-NO-UI) |
| idam.configure | command | LIVE (engine handler not audited, by code reading) | IDM-02 step 3 (enable/disable not exposed, IDM-04) |
| idam.connect | command | LIVE (engine handler not audited, by code reading) | IDM-02 step 2 |
| idam.sync | command | LIVE (handler commits no audit record) | IDM-03 |
| objects.list | read | LIVE | OBJ-01, POL-F3 |
| objects.detail | read | LIVE | OBJ-07 (via the drawer route) |
| objects.governingPolicies | read | PENDING (crdb; stale reason) | OBJ-07 pending note |
| objects.create | command | LIVE | OBJ-03 |
| objects.edit | command | LIVE | OBJ-04 |
| objects.delete | command | LIVE | OBJ-05 |
| policies.byZone | read | LIVE | POL-01 |
| policies.detail | read | LIVE | POL-09 (WIRED-NO-UI) |
| policies.convergence | read | LIVE | DIST-01 |
| policies.enforcement | read | PENDING (torch) | POL-10 |
| policies.create | command | LIVE | POL-03, POL-05 |
| policies.edit | command | LIVE | POL-04, POL-05 |
| policies.publish | command | LIVE | POL-05 |
| policies.delete | command | LIVE | POL-06 |
| policies.distribute | command | LIVE | DIST-02 |

Reads/commands used by this slice with NO manifest binding: CONNECTIVITY_MEMBERS (DRW-07), the
POLICY_EFFECTIVE read inside distribute (DIST-02; folded under `policies.distribute`), LIST_PRINCIPALS for
the principal drawer (DRW-02; folded under `users.detail`), and the sidecar secret write (IDM-F4).
Source: forgecentral/packages/bindings/src/manifest.ts:27-739.

---

## J. TRD drift summary (by TRD)

- TRD-CONSOLE-00 (platform): 11 nav destinations vs 9 (Agent Ops, Network Ops removed); account menu
  position; "RBAC ... configured on Settings -> RBAC and enforced by the engine"
  (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:373) vs a read-only BFF installer map and no per-operator engine check for this slice's
  verbs (X-1); errors "with a request id" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:425) -- none shown; destructive actions "display the
  exact effect" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:429-430) -- fixed copy; surface catalog still lists Users "set override",
  Policies on "TRD-04", Objects "view governing policies", VTZ "set boundary + default posture, view
  members" (forgecentral/docs/spec/TRD-CONSOLE-00-platform.md:520-531).
- TRD-CONSOLE-01 (Overview): never amended for the Trust Score removal; top tabs, saved views, time range
  and push stream do not exist; paging, hover-filter and the container list step exist but are not
  specified; destination classes differ.
- TRD-CONSOLE-02 (VTZ): posture authoring, effective-posture preview/diff, members, boundary, risk rules and
  `vtz.setMembership` are specified but absent; delete, archetype, description, session duration,
  telemetry, micro-segmentation and lifecycle exist but are not specified; re-scope is parent/name based
  and (by code reading) fails.
- TRD-CONSOLE-04 (Users): Type sub-classes, Pending status, Remote/Compliance values, export, group
  settings, group edit/membership UI, non-Auth0 connectors and confirm/tier gating on add/edit are
  specified but absent; `idam.connect` + the secret write exist but are not specified.
- TRD-CONSOLE-05 (Policies): active window authoring, Applied-To-driven distribution, first distribution,
  policy detail/version view, live-streaming convergence, last-updated per zone, priority field and
  principal subjects are specified but absent; Max Classification, search/zone filter and the inline form
  differ.
- TRD-CONSOLE-10 (Objects): confirm-gated create/edit, tags/classification editing, governing policies,
  reach/decisions and "server-paged" are specified but absent; delete exists but is not specified.
- TRD-CONSOLE-12 (Drawer): Trust Score/sparkline, trust-era info fields, EXPLAIN click-through, VTZ entity,
  live subscription, per-section retry, typed not-found and three quick actions are specified but absent;
  Connections and the Back-to-list flow exist but are not specified.

---

## K. Open questions / UNVERIFIED (engine or runtime facts this slice could not establish)

1. VTZ-07: confirm at runtime that a parent/name change on Save is refused (edit by the NEW name) and
   decide the fix (edit by the old name, or send the old name in the spec).
2. VTZ-F5/F6/F7/F2: which component consumes session duration, telemetry mode, micro-segmentation and
   the archetype; the Console only stores them.
3. VTZ-02: whether VTZ_TREE emits unauthored domains as deny rows (drives the High-sensitivity KPI).
4. VTZ-F8: by code reading the engine accepts Published -> Draft (the record is rebuilt from the spec);
   confirm that is intended. The form seeds Lifecycle from the zone (forgecentral/apps/console/src/surfaces/VtzEditor.tsx:164), so it happens
   only when an operator picks Draft.
5. VTZ-08: what happens to policies scoped to a deleted zone.
6. POL-F5 / OBJ-F3 / OBJ-F4: engine validation of port lists, kind/selector pairing and CIDR syntax.
7. OBJ-06: whether rules built from DRAFT objects are accepted, and whether objects need publishing.
8. USR-03/04: the initial status of a provisioned user; whether an absent email/org on edit clears or keeps.
9. USR-05: the runtime access effect of suspend/revoke, and whether revoke should be terminal.
10. IDM-02/03: the IdAM connector is node-level and its configure/connect/sync handlers change in-memory
    state without an audit commit (by code reading) -- confirm whether the manifest's `audited: true` and
    the "audited" confirm copy are meant to hold, whether settings persist across an engine restart, and
    the intended authorization for the sidecar secret write (currently session-only) and for a
    tenant-scoped operator changing a node-wide connector.
11. X-1: whether per-operator role/tier gating of governance commands is intended to exist (manifest
    `authz` labels suggest yes; no layer enforces them for this slice).
12. OV-05: whether Overview zone ids always match VTZ-store ids.
