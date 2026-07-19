# IP-CONSOLE-02-VTZ -- landing ledger

The per-PR landing record for `IP-CONSOLE-02-VTZ` -- the ForgeCentral Virtual Trust Zones surface over the
live crdb VTZ system of record (`IP-CONSOLE-VTZ-SUBSTRATE`, `:7878`). One row per roster step; each lands
on its own branch through the full `scripts/ci.sh`, no-ff merged, then recorded here with its commit.

**Status: IN PROGRESS -- V2.1 landed. The engine half (crdb `IP-CONSOLE-VTZ-SUBSTRATE`) is COMPLETE + LIVE
over :7878 and deployed to the node 2026-07-19, so every read/command binding here is LIVE-backed except
the named PENDINGs (member/policy counts, `vtz.setMembership`). NEXT = V2.3 (the BFF write path).**

| Step | Invariant | Status | Commit | Proof |
|---|---|---|---|---|
| V2.1 | INV-CONSOLE-VTZ-CONTRACT | LANDED | `a12ae5e` | `@forge/contracts` regenerated from the crdb VTZ schema (13 `Vtz*` defs, 6 request + 3 reply variants, additive; pinned contract version unchanged so the codegen drift gate holds). `src/vtz.ts` view models + fail-closed projections (`toVtzTree`/`toVtzDetail`/`toVtzZone`/`toVtzMutation`), every enum narrowed CLOSED, the catastrophic floor carried from the engine's own flag, no trust score in the model. `vtz.*` bindings registered: tree/detail/riskBand + the four audited mutations LIVE; memberCounts/policyCount/setMembership PENDING with gating tasks. 19 tier-1 projection tests + the binding assertions; full `scripts/ci.sh` green. |
| V2.2 | INV-CONSOLE-VTZ-BROKERED | LANDED | `dc1f5fc` | BFF read path end to end: `CrucibleClient.vtzTree`/`vtzDetail` + `replyToVtzTree`/`replyToVtzDetail` + dispatch; `OperatorEngine` methods injecting the operator delegation server-side (tenant-narrowed engine-side, never client-asserted); `engine/vtz.ts` resolvers bounding the tree read and projecting through the shared contract projection, failing CLOSED to `VtzUnavailableError` on an unknown enum tag; routes `GET /api/vtz/tree` + `GET /api/vtz/detail?id=` (401/503/400, unknown tag 503, refusal sanitized 403, else 502) over a tenant-scoped short-TTL projection cache. An unknown zone id is the honest not-found (`zone: null`), not an error. 10 resolver + 7 route + delegation + reply-mapper tests; full `scripts/ci.sh` green. |
| V2.3 | INV-CONSOLE-VTZ-MGMT-BROKERED | OPEN | -- | BFF write path (create/edit/rescope/delete + refusal mapping). |
| V2.4 | INV-CONSOLE-VTZ-GRID | LANDED | `25c17c8` | `/vtz` is a real surface: `VtzZoneCard` (design system) with archetype + joined risk band and NO trust gauge; `useVtzTree`/`useVtzDetail`/`useVtzRiskBands`; `VtzSurface` with the KPI row (Total VTZs, high-sensitivity = denies BEYOND the catastrophic floor; no Avg Trust), the Active/Configure `TabStrip`, search-as-view stating matches against the true total, and the truncated-scan badge. Absent member/policy counts and an absent risk band render as an explicit labelled absence, never a fabricated zero or a defaulted green. Configure is READ-ONLY over the live `vtz.detail` binding (own vs effective posture, engine-flagged floor rows locked, contributing ancestor named) so the tab is not a dead affordance; authoring is V2.5. `vtz` added to the `REAL_SURFACES` allowlist. 9 card + 13 surface tests; full `scripts/ci.sh` green; Playwright e2e 7/7 green. |
| V2.5 | INV-CONSOLE-VTZ-AUTHOR | OPEN | -- | Configure editor + Create modal: per-domain posture editor (floor locked, effective preview), draft/publish. |
| V2.6 | INV-CONSOLE-VTZ-GROUNDED | OPEN | -- | Six VTZ mockups into `docs/ui-examples/`; `TRD-CONSOLE-02` Trust-Score amendment (5 sites). |
| V2.N | INV-CONSOLE-VTZ-COMPLETE | OPEN | -- | Playwright E2E over the real surface; `REAL_SURFACES` allowlist; §8 acceptance green. |

**crdb backing (SATISFIED, cross-repo):** `IP-CONSOLE-VTZ-SUBSTRATE` VZ.1-VZ.N (crdb main `a9103616`) --
`VtzTree`/`VtzDetail` reads + `VtzCreate`/`VtzEdit`/`VtzRescope`/`VtzDelete` audited writes + graph union +
seed, live over `:7878`, deployed. The `vtz.riskBand` join reuses the live `overview.graph` per-VTZ risk.

**Deferred / cross-repo (named, PENDING, not blocking this surface's exit):**
- `vtz.memberCounts` + `vtz.setMembership` -- gated on the crdb zone-membership substrate
  (`VtzSetMembership` deferred, `TRD-CONSOLE-12`).
- `vtz.policyCount` -- gated on the Policies surface `CONSOLE-05` (crdb policy store).
- **torch-forge ingest** of the zone store (endpoint compose/distribute) -- a separate epic; enforcement
  AG.7-OFF.

**Sequence:** V2.1 -> V2.2 -> V2.4 -> V2.3 -> V2.5 -> V2.6 (independent) -> V2.N.
