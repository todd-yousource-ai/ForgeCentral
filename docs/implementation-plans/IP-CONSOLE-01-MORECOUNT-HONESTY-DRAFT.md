# DRAFT (saved, not started): Overview ring "+N more" honesty fix

Status: SAVED 2026-07-16 on operator direction ("create the PR, don't code it"). One small PR when
picked up. Implements a TRD-CONSOLE-01 honesty gap found live 2026-07-16.

## The defect (user-caught)

The network ring reads its true distinct-endpoint count (e.g. **910**), but its named list shows the
top 5 apps plus `+16 more` -- where 16 is only the remaining NAMED apps (21 named - 5 shown). The 889
distinct endpoints below the engine's top-50 naming cutoff (`TOP_DEST_CAP`) are never communicated,
so the list implies "21 total" while the ring says 910. The numbers are all real
(21 named + 889 unnamed = 910, verified live); the "+N more" is under-telling.

## The fix (renderer + view model, no engine change)

- `OverviewSankeyFlow` (packages/design): the ring's overflow line becomes honest about BOTH tails:
  hidden named apps AND the unnamed remainder. Preferred copy (pick at review):
  a) `+905 more` (ring count - the 5 displayed), or
  b) `16 more named · 889 unlisted` (two-part, more informative).
- The data is already present in the view model: `OverviewDestNode.count`, `.apps.length`,
  `.moreCount` (unnamed tail). No BFF/contracts/wire change needed -- display-only.
- Invariant to state: `INV-CONSOLE-OVERFLOW-HONEST` -- a ring's overflow label accounts for every
  entity in the ring's count (displayed + hidden-named + unnamed == count), asserted by a design
  package unit test and the overview-surface test.

## Scope guard

- Display-only PR: packages/design renderer + tests (+ overview-surface test expectation).
- Do NOT touch ring counts, classification, or the engine.
- Related-but-separate (explicitly NOT this PR): loopback destination treatment. Operator is
  deciding: keep loopback flow data in CDB (wanted), but ~100 Linux servers all emitting
  127.0.0.1:<ephemeral-port> endpoints will not compute right in observability -- likely a
  promotion-side rollup (all loopback -> one `Localhost` endpoint per host) rather than dropping
  the data. Decision pending; do not implement here.
