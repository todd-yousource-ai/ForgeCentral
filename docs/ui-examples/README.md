# UI Examples -- the canonical Console mockups

These are the reference screenshots of the YouSource Console (the "mock" that
`docs/spec/TRD-CONSOLE-00-platform.md` Section 6 reproduces as tokens). They are the **visual
ground truth** for what we are building: the look, the information architecture, the component
library, and the interaction model. Read them before designing or implementing any surface, and
check your output against them.

They are **grounding, not a second source of truth.** Where a pixel and the spec disagree, the
normative order still holds: `TRD-CONSOLE-00` Section 6 (design system + tokens) and the surface
TRD win; the committed brand assets in `docs/assets/` are canonical for the exact logo/honeycomb.
These images fix the *intent* -- proportions, density, hierarchy, and behavior -- that prose and
hex codes alone cannot pin down. If you build a surface that does not look like it belongs in this
set, it is wrong.

Captured 2026-07-05 from the design prototype (the `DEMO` environment badge is visible top-left;
data shown is illustrative demo data, not a live tenant).

## The screenshots

| # | Surface | What it establishes |
|---|---------|---------------------|
| 01 | **Trust Overview** (home) | The hero: a Sankey/flow connectivity graph. Left lanes **Users** (blue) / **Devices** (teal-green) / **AI Agents** (purple) flow through **Virtual Trust Zone** nodes rendered as **score rings** (`YouSource.Corp` 94 green, `AIAgents.Trusted` 82 green, `AIAgents.Dev` 75 amber) out to destination objects (Websites, SaaS Apps, Private Apps, Data Stores, Servers) in amber. Segment tabs All / Users / Devices / AI Agents. Faint honeycomb behind the flow. |
| 02 | **Dashboards** | Dashboard picker dropdown (Trust Overview, VTZ Management, User & Identity, Device & Endpoint, Endpoint Health, Policy & Enforcement, Telemetry & TrustFlow, Security Incident & Reflex). KPI cards (`Active VTZs`, `Active Sessions`, `TrustLock Rotations`) with Live/Today badges, an area chart, a multi-series line chart (Deny/Monitor/Permit/Quarantine), a Top-5 Anomalies list with severity chips, and an activity heatmap/bar chart. Top-right time-range picker + refresh. |
| 03 | **Users -> All Users** | Virtualized data table: Name, ID, Email, Org, Groups, Type, Status, Override, Remote, Compliance. Status chips (Pending / Active / Suspended / Revoked), compliance chips (FedRAMP / GDPR / HIPAA), group chips. Search + filter + `Add` + export. |
| 04 | **Users -> Groups** | Object-card grid of user groups (member count + description + gear), `Create Group`. |
| 05 | **Users -> External IDAM** | Federation connector cards (Okta Connected, Azure AD / Google Workspace Not Connected) with last-sync + `Sync Now`. Note the minimized picture-in-picture graph thumbnail, bottom-right. |
| 06 | **Policies** (collapsed) | Accordion of VTZs with a policy-count badge and updated date; search + filter + `Create`. |
| 07 | **Policies** (expanded) | Policy table inside a zone: Name (with version chip), Scope (`A -> B`), Protocol/Ports, **Action** chip (Permit / Deny / Monitor / Quarantine), Restrictions (Time/Geo/Tags), Logging (Sampled/Triggered/Verbose), Status (Published/Draft), row view/edit actions. |
| 08 | **TrustOps Command -> Rewind** | Tagline "Govern autonomous trust. Guide machine decisions." Tab strip: Trust Reflex, Operator Oversight, Incidents, Decision Stream, AI Governance, Containment, Workflows, Rewind, TrustSims. A **timeline scrubber** (Play/Reset, event markers) over a Decision Feed of cards with Info/Warning/Critical chips and per-decision scores. |
| 09 | **Reports -> Operational Trust** | Report tabs (Operational Trust, AI Governance, VTZ & Apps, Reflex & Autonomy, Zero-Trust Impact, Compliance & Audit, Exec Summary). Trust-score histogram, Reflex Actions bar meters, a High-Risk Trust Events list with action chips + `Rationale` buttons, and an Identity Attestation report. Share/export top-right. |
| 10 | **Logs** | Dense audit table: Time, Entity (typed icon), Category, **Decision** chip (Allowed / Warned / Blocked / Downgraded / Isolated), **Trust Delta** (`87 -> 92` with a trend arrow), VTZ, Confidence. Search + filter + time range. |
| 11 | **Objects** | The entity catalog, grouped by type (Group, Application, Service, Server, Network, Registry Key, Certificate, Script) as object cards; `Create Object`. |
| 12 | **Settings -> HA & Topology** | Settings tab strip (HA & Topology, Failover & DR, RBAC, Federation, Security, TrustLock, Policy, Observability, FIPS Mode). Controller-cluster nodes with replication-lag bars + `Leader` badge; DR-target cards (RPO/RTO/Ready) + `Rotate Leadership` / `Test Quorum Loss`. |
| 13 | **Trust Overview** (hover-focus) | The graph with one path emphasized and the rest dimmed, plus a hover tooltip (`Inventory-Bot - 1 connections - Trust: 78`). Shows the focus/dim interaction. |
| 14 | **Trust Overview** (entity drawer) | The right **slide-over drawer** for a focused entity: score-ring header + sparkline, Entity Information (Trust State, Risk Score, Region, Last Seen, Tags), Connected VTZs, Capabilities, Effective Policies, Recent Events (Denied/Success/Pass chips), and **Quick Actions** (View Remediation, Isolate from network, Modify VTZ assignment, Open full report). This is how the `<= 3-click` rule is met: select in the graph -> act in the drawer. |

## Design language (observed; normative source is `TRD-CONSOLE-00` Section 6)

- **One dark theme.** Near-black navy canvas, slightly-lighter panels and elevated cards, hairline
  borders. No light theme.
- **Honeycomb ambient field.** A faint hex-mesh "wave" (lower-right) on content-light pages and
  behind the Overview flow; always low-contrast so it never competes with data.
- **Brand.** The teal-to-navy swirling torus mark + `YouSource.ai` wordmark top-left, with an
  environment badge (`DEMO` / `PROD` / tenant). A user chip sits at the bottom of the nav rail.
- **Left nav rail.** Fixed, icon+label, one active item highlighted with a soft blue-tinted
  rounded fill. Order: Trust Overview, Virtual Trust Zones, Dashboards, Users, Policies, TrustFlow,
  TrustOps, Reports, Logs, Objects, Settings.
- **Semantic color is load-bearing, not decorative.** Flow lanes: Users blue, Devices teal-green,
  AI Agents purple, objects amber. Score/status: green good/permit, amber caution/monitor, red
  critical/deny, orange-red quarantine/isolate, blue info. A trust score is always a 0-100 number
  in a ring colored by its band.
- **Chips/badges everywhere** as pill shapes with a tinted fill and colored text: status,
  compliance framework, policy action, severity, decision.
- **The shared component library** (see the images for the canonical rendering of each): flow/Sankey
  graph, score ring, KPI card, virtualized data table, tab strip, right drawer, badge/chip, timeline
  scrubber, time-series/histogram/heatmap charts, policy row, object/group card, connector card.
- **Information architecture.** Every primary nav item is a page; secondary navigation is a
  horizontal tab strip under the bold page title; sub-views are a dropdown (Dashboards) or an
  accordion (Policies). Top-right holds the time-range picker, refresh/export, and the primary
  `Add`/`Create` button.
- **Interaction model.** Hover focuses a path and dims the rest with a tooltip; selecting an entity
  opens the right drawer with its detail + Quick Actions -- select-then-act, in `<= 3 clicks`.
- **Motion is subtle and purposeful** -- the flow's gentle animation and the drawer slide -- never
  decorative jank.

## How to use this during development

- Building a surface? Find its screenshot here first and match its **density, hierarchy, and
  component choices**. Reuse the shared components (table, drawer, chip, score ring, KPI card); do
  not invent a new pattern where one already exists in these images.
- Choosing a color? Use the semantic token for its **meaning** (`TRD-CONSOLE-00` Section 6.1), not a
  hand-picked hex. Green means good/permit, red means deny/critical, and so on -- consistently.
- Adding data viz? The chart types shown here (area, multi-series line, histogram, horizontal bar
  meter, heatmap, sparkline, Sankey flow) are the established set; read the `dataviz` skill and stay
  inside this palette.
- Reviewing a PR? "Does this look like it belongs in this set?" is a valid, expected review question.
