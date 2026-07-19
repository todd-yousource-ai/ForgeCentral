# IP-CONSOLE-02-VTZ -- landing ledger

The per-PR landing record for `IP-CONSOLE-02-VTZ` -- the ForgeCentral Virtual Trust Zones surface over the
live crdb VTZ system of record (`IP-CONSOLE-VTZ-SUBSTRATE`, `:7878`). One row per roster step; each lands
on its own branch through the full `scripts/ci.sh`, no-ff merged, then recorded here with its commit.

**Status: PLANNED -- no roster step landed. Plan authored on `docs/ip-console-02-vtz`, pending review. The
engine half (crdb `IP-CONSOLE-VTZ-SUBSTRATE`) is COMPLETE + LIVE over :7878 and deployed to the node
2026-07-19, so every read/command binding here is LIVE-backed except the named PENDINGs (member/policy
counts, `vtz.setMembership`).**

| Step | Invariant | Status | Commit | Proof |
|---|---|---|---|---|
| V2.1 | INV-CONSOLE-VTZ-CONTRACT | OPEN | -- | `@forge/contracts` regenerated from the crdb VTZ schema; VTZ view models + fail-closed projections; `vtz.*` bindings registered. |
| V2.2 | INV-CONSOLE-VTZ-BROKERED | OPEN | -- | BFF read path (`operator-engine` + `wire-client` + resolvers + `/api/vtz/tree` + `/api/vtz/detail`). |
| V2.3 | INV-CONSOLE-VTZ-MGMT-BROKERED | OPEN | -- | BFF write path (create/edit/rescope/delete + refusal mapping). |
| V2.4 | INV-CONSOLE-VTZ-GRID | OPEN | -- | Active VTZs grid: KPI row (no Avg Trust), zone cards (posture badge + risk band, sub-zone count). |
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
