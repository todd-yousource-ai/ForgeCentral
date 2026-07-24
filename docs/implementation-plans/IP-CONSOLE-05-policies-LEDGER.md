# IP-CONSOLE-05-POLICIES -- landing ledger

Plan: `IP-CONSOLE-05-policies.md` (TRD-CONSOLE-05, Policies). Created WITH the plan (2026-07-24) per the
ledger discipline: **every step's row is updated (status + commit hash) in the same session its PR merges,
and the Resume-here section is rewritten at every merge.** A stale ledger is a defect.

## Resume here (rewrite at every merge)

- **State (2026-07-24): DESIGN AUTHORED + the crdb engine half COMPLETE; no FC code yet.
  NEXT = P5.1 (unblocked).** `TRD-CONSOLE-05` revised the same date (re-anchored
  TRD-04 -> TRD-32 v2; four-action lattice Permit/Monitor/Quarantine/Deny; logging reconciled to
  Full/Sampled/Off; source/destination spine; ports/protocol `NetworkMatch`; recurring schedule + absolute
  active-window; Applied-To as an authored `IdentityScope`; grouping by VTZ; compose/sign/push + convergence
  re-homed here). The Create modal mock `08-*.png` is the ground truth for the two collapsibles.
- **Cross-repo prerequisite SATISFIED:** the crdb substrate (`crdb IP-CONSOLE-POLICY-SUBSTRATE`) is
  COMPLETE IN CODE -- PS.1..PS.N all landed 2026-07-24 (PS.N capstone merge crdb `69b0057a`; full gate +
  ueba suite green; PS.3..PS.N awaiting operator review). The policy DTOs regen into
  **`wire-dto.schema.json`** (not forge-dto; the artifact `@forge/contracts` vendors -- deviation flagged
  in the crdb ledger). The deferred-live :7878 drive folds into P5.N.
- **Inherited unfinished work absorbed:** `IP-CONSOLE-02-FORGE-DISTRIBUTION` FD.7c -- the `DistributionPanel`
  + `useDistribution` + `apps/bff/src/engine/distribute.ts` exist and the convergence read is proven live,
  but the panel was reverted off the VTZ surface (wrong placement, 2026-07-21) and awaits re-homing. P5.5 is
  that re-home. The `packages/wire` `BundleCommit`/`BundleConvergence` CBOR codecs (fixed 2026-07-21) land
  with P5.5. `FC_SIGNER_PORT` must be in the running BFF env.
- **Reused live surfaces:** `vtz.tree` (grouping axis + VTZ dropdown), `objects.list` (subject/target
  pickers). Both COMPLETE.
- **Next action:** P5.1 -- the contract (re-vendor crdb `wire-dto.schema.json` + `node
  scripts/generate.mjs` + `policies.ts` view models + fail-closed closed-enum projections + binding
  registration). UNBLOCKED.
- Enforcement stays AG.7-OFF: a published + distributed bundle realizes nothing until enforcement is engaged.

## Cross-repo engine prerequisites (crdb -- tracked here, land in crdb)

| Id | Deliverable | Status | Commit |
|----|-------------|--------|--------|
| PS.1 | `Protocol`/`PortSpec`/`NetworkMatch` + TRD-32 v2 grammar amendment | LANDED | crdb `c2d4a3ce` (merge `dbbf1d49`) |
| PS.2 | `Schedule`/`ActiveWindow`/`PolicyRestrictions`/`PolicyLogging`/`DistributionScope` | LANDED | crdb `ebc801ea` (merge `44e390ec`) |
| PS.3 | `Policy` extended additively (name/network_match/restrictions/logging/applied_to/lifecycle) | LANDED | crdb `1b19ea7c` (merge `80938212`) |
| PS.4 | `Keyspace::Policy` + `policy_store` audited CRUD + published-version immutability + store-minted SemVer (breaking -> major) | LANDED | crdb `db8b007c` (merge `2b9a9fdd`) |
| PS.5 | `POLICY_LIST_BY_ZONE`/`POLICY_DETAIL` + `wire-dto.schema.json` regen (+359) | LANDED | crdb `0ec15ee4` (merge `713e98f0`) |
| PS.6 | `POLICY_CREATE/EDIT/PUBLISH/DELETE` audited commands + typed refusals + publish-only breaking flag | LANDED | crdb `88b54ba8` (merge `8b5ee9b4`) |
| PS.7 | `effective_published_policies` (composer seam; producer expiry) | LANDED | crdb `c41c5697` (merge `38f7060f`) |
| PS.N | live-node capstone (`policy_capstone.rs`); live :7878 drive deferred to P5.N | LANDED | crdb `975a0c32` (merge `69b0057a`) |

## Roster (Console PRs)

| Step | Invariant | Status | Commit | Note |
|------|-----------|--------|--------|------|
| P5.1 | `INV-CONSOLE-POLICIES-CONTRACT` | PLANNED | -- | schema re-vendor (PS.5 DTOs) + `policies.ts` view models (`PolicyRow`/`PolicyDetailView`/`PolicyDraft`) + fail-closed closed-enum projections (four actions, three logging levels); `policies.*` bindings registered (reads/commands PENDING; enforcement-runtime PENDING -> torch) |
| P5.2 | `INV-CONSOLE-POLICIES-BROKERED` | PLANNED | -- | wire codecs (`PolicyListByZone`/`PolicyDetail`) + delegated actions; `engine/policies.ts` (fail-closed collapse -> 503; honest-empty) + `GET /api/policies`(+`/detail`); tenant-scoped cache; route tests |
| P5.3 | `INV-CONSOLE-POLICIES-GROUPED` | PLANNED | -- | `PoliciesSurface.tsx`: net-new accordion group component (VTZ card + count badge, `06-*.png`) + per-zone policy `DataTable` (`07-*.png` columns); reads-only; `policies` destination replaces placeholder |
| P5.4 | `INV-CONSOLE-POLICIES-AUTHOR` | PLANNED | -- | command codecs + POST routes (typed 409/400/403); the Create Policy modal (`08-*.png`): name/VTZ/subjects/targets/protocol chips/ports/action(4)/logging(3) + Restrictions collapsible (days+hours+active-window+geo+tags) + Advanced collapsible (Applied-To+description); Save-Draft vs Save-&-Publish; per-row edit/delete; client validation; 3-click paths |
| P5.5 | `INV-CONSOLE-POLICIES-DISTRIBUTED` | PLANNED | -- | re-home FD.7c: land `packages/wire` BundleCommit/Convergence codecs; mount `DistributionPanel` here (Distribute confirm-gated over Applied-To; compose `effective_published_policies`(PS.7) -> sidecar sign -> crdb carrier); 3-state convergence ledger; NO distribute control on VTZ surface (structural); signing key never in TS (hygiene) |
| P5.6 | `INV-CONSOLE-POLICIES-GROUNDED` | PLANNED | -- | land `06/07/08-*.png` + README rows; residual TRD grounding; cross-ref FORGE-DISTRIBUTION FD.7c re-home; docs-only |
| P5.N | `INV-CONSOLE-POLICIES-COMPLETE` | PLANNED | -- | Playwright capstone (grouped accordion; Create w/ Network+CIDR target + ports/HTTPS + Quarantine + Full + 7-day window + Applied-To devices; publish confirm; malformed-port 400; version chip on edit; distribute + convergence 3 states; no-distribute-on-VTZ + four-action + three-logging structural sweeps; empty tenant honest); `REAL_SURFACES` allowlist; acceptance sweep; box redeploy live leg (enforcement OFF) |

## Acceptance sweep (TRD-CONSOLE-05 Section 7) -- filled at P5.N

| Acceptance row | Proven by |
|---|---|
| Every policy row/field is a real engine record; no fabricated policy | (P5.1 fail-closed projections + P5.2 resolver tests + P5.N empty-tenant) |
| Grouping is by real `Policy.vtz` over live `vtz.tree` | (P5.3/P5.N) |
| Action control = exactly four; logging = exactly three; no unstorable value | (P5.1 closed enums + P5.N structural sweep) |
| Source/destination real `ObjectRef`; IP/subnet = `Selector::Cidr`; ports/protocol typed; malformed 400 | (P5.4/P5.N) |
| Applied-To authors a real `IdentityScope`; distribute targets only the named endpoints | (P5.5/P5.N) |
| Draft never mutates published; publish atomic+audited+confirm-gated; breaking flagged | (P5.4) |
| Active-window `until` past excludes from composed bundle (producer expiry) | (P5.5 over PS.7 + P5.N) |
| Compose->sign->push signs in the sidecar; convergence shows 3 states; no VTZ distribute control | (P5.5/P5.N) |
| Section 5 three-click tasks within budget | (P5.N) |

## Named deferrals (honest, gating work named)

- Runtime enforcement of schedule/geo/ports: `torch IP-TORCH-POLICY-ENFORCE` (enforcement AG.7-OFF).
- Zone-membership-defaulted Applied-To: crdb `VtzSetMembership` (deferred, TRD-CONSOLE-12).
- Simulate / dry-run: TRD-CONSOLE-07 (AIOps).
- EXPLAIN over a composed effective policy: later, once torch-forge compose is wired end to end.
- Live `:7878`/`:7879` drive: the box redeploy (P5.N's remaining item, the Objects/VTZ precedent).
