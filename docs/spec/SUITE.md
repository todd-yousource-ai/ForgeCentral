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
| CONSOLE-00 | Platform and Architecture (foundation: BFF-over-Crucible, design system, IA, data contract, auth, performance, invariants) | DRAFT |
| CONSOLE-01 | Overview -- the live connectivity graph (home) | DRAFT |
| CONSOLE-02 | Virtual Trust Zones | DRAFT |
| CONSOLE-03 | SOC Operations | DRAFT |
| CONSOLE-04 | Users and Identity (principals + External IDAM) | DRAFT |
| CONSOLE-05 | Policies | DRAFT |
| CONSOLE-06 | TrustFlow (brokered egress / inference plane) | DRAFT |
| CONSOLE-07 | AIOps (command center: Reflex, Oversight, Incidents, Decision Stream, Governance, Containment, Workflows, Rewind, Simulations) | DRAFT |
| CONSOLE-08 | Reports | DRAFT |
| CONSOLE-09 | Logs (decision / audit stream -- the LOG) | DRAFT |
| CONSOLE-10 | Objects (protected resources) | DRAFT |
| CONSOLE-11 | Settings (HA/DR, KeyLock, Federation, Security, FIPS, RBAC, Observability, Policy) | DRAFT |
| CONSOLE-12 | Entity drawer (shared detail + quick-actions pattern) | DRAFT |

## Terminology (trust-era mock -> AI-native platform)

Normative map in `TRD-CONSOLE-00` Section 3. Highlights: **TrustOps -> AIOps**; Trust Overview -> the
live **Overview** graph; Trust Replay -> **Rewind** (Crucible `AS OF` time-travel). Retained because
they name real things: **Trust Score** (the computed risk/confidence value), **TrustFlow** (the real
`torch-trustflow` plane), **Virtual Trust Zones** (the real Forge TRD-32 v2 model).

## Brand assets (canonical)

`../assets/yousource-logo.png` / `.gif` and `../assets/yousource-honeycomb.jpg`. The design-system
tokens in `TRD-CONSOLE-00` Section 6 reproduce the mock; the assets are the source of truth.
