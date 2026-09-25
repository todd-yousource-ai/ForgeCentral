# YouSource Console -- TRD Suite

The Console is the operator pane of glass over the YouSource platform: **Crucible** (the `crdb` engine,
data/policy/audit, TRD-01..08), **Torch** (the agent edge, TRD-09/25), and **Forge** (governance /
Virtual Trust Zones, TRD-32/34). It is a TypeScript/Node backend-for-frontend + web app over those
systems. It holds **no** durable domain data -- Crucible is the sole system of record.

Four non-negotiable rules govern every TRD in this suite: **no UI stubs** (every value + action binds
to real Crucible/Torch/Forge data), **no second database**, **<= 3 clicks to any task**, and
**near-instant** feel. They are formalized as invariants in `TRD-CONSOLE-00`.

## Build order

The suite is sequenced into gated phases -- foundation first, then the surfaces in dependency order --
by [`../implementation-plans/IP-CONSOLE-ROADMAP.md`](../implementation-plans/IP-CONSOLE-ROADMAP.md),
which also names the cross-surface Crucible/Torch/Forge work (`INV-CROSS`) each surface depends on.

## Documents

| TRD | Title | Status |
|-----|-------|--------|
| CONSOLE-00 | Platform and Architecture (foundation: BFF-over-Crucible, design system, IA, data contract, auth, performance, invariants) | DRAFT; navigation and surface catalog amended to the built surface 2026-09-25 (GD.10) |
| CONSOLE-01 | Overview -- the live connectivity graph (home) | BUILT IN PART (refreshed GD.10) |
| CONSOLE-02 | Virtual Trust Zones | AMENDED 2026-09-25 (GD.4), built in part |
| CONSOLE-03 | SOC Operations | BUILT (refreshed GD.8; supersedes `TRD-CONSOLE-03-dashboards`, SUPERSEDED) |
| CONSOLE-04 | Users and Identity (principals + External IDAM) | AMENDED 2026-09-25 (GD.7), built in part |
| CONSOLE-05 | Policies | REVISED 2026-07-24, AMENDED 2026-09-25 (GD.6), built in part |
| CONSOLE-06 | Agent Ops (was TrustFlow; brokered egress / inference plane) | DRAFT; not built, off the rail |
| CONSOLE-07 | Network Ops (was AIOps; command center: Reflex, Oversight, Incidents, Decision Stream, Governance, Containment, Workflows, Rewind, Simulations) | DRAFT; not built, off the rail |
| CONSOLE-08 | Reports | PARTLY BUILT (refreshed GD.9) |
| CONSOLE-09 | Logs (decision / audit stream -- the LOG) | BUILT IN PART (refreshed GD.9) |
| CONSOLE-10 | Objects (protected resources) | AMENDED 2026-09-25 (GD.5), built in part |
| CONSOLE-11 | Settings (SOC, Configuration, RBAC, Federation, Changes, Security, KeyLock, Observability, HA & Topology, FIPS Mode, ReadMe) | REVISED 2026-09-25 (Sections 9 to 11: as built, gaps, the in-app guide) |
| CONSOLE-12 | Entity drawer (shared detail + quick-actions pattern) | BUILT IN PART (refreshed GD.10) |

## Terminology (trust-era mock -> AI-native platform)

Normative map in `TRD-CONSOLE-00` Section 3. Highlights: **TrustOps -> AIOps -> Network Ops**; Trust
Overview -> the live **Overview** graph; Trust Replay -> **Rewind** (Crucible `AS OF` time-travel);
TrustFlow -> **Agent Ops**. **Trust Score is removed** (struck from `TRD-CONSOLE-02` on 2026-07-19; no
surface or drawer shows one). Retained because it names a real thing: **Virtual Trust Zones** (the Forge
TRD-32 v2 model).

## Brand assets (canonical)

`../assets/yousource-logo.png` / `.gif` and `../assets/yousource-honeycomb.jpg`. The design-system
tokens in `TRD-CONSOLE-00` Section 6 reproduce the mock; the assets are the source of truth.
