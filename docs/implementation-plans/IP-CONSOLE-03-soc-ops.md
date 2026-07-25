# IP-CONSOLE-03-soc-ops -- the SOC Operations surface

The ForgeCentral surface for `TRD-CONSOLE-03` (SOC Operations), built to the operator-supplied command
prototype: a decision surface, not a dashboard. Authored 2026-07-25 alongside the two crdb IPs it
consumes (`IP-SOC-SUBSTRATE` for the records and reads, `IP-SOC-VERDICT-NARRATIVE` for the generated
write-up).

Engine-first per `IP-CONSOLE-PHASE3-SEQUENCING`: this surface starts its contract step after crdb SS.4
regenerates the wire schema, exactly as Objects started after OB.3 and Policies after PS.5.

**Named invariants:**
- `INV-SOC-ONE-PAYLOAD` -- the queue, lineage, verdict, and dock all render from the single incident
  payload one read returned. No panel re-fetches its own version of the same incident, because two
  fetches are two chances to disagree on the screen an operator is deciding from.
- `INV-SOC-EDGE-STATE-HONEST` -- an edge's state (`observed` / `inferred` / `verified-enforced` /
  `pending`) is visually distinct and never upgraded by the surface. An inferred edge rendered as
  observed is the Console asserting something the engine did not.
- `INV-SOC-NARRATIVE-LABELLED` -- the generated write-up is always labelled as generated, always
  linked to its artifact, and never rendered when the engine refused it. The unavailable state is a
  first-class render, not an empty panel.
- `INV-SOC-NO-FABRICATED-NUMBER` -- a `PENDING` binding renders an explicit unavailable state. No tile
  is filled with a plausible figure, and no element derives a number the engine did not return.
- `INV-CONSOLE-3-CLICKS` (inherited) -- every task in `TRD-CONSOLE-03` Section 8 inside its budget.

## Read with

`TRD-CONSOLE-03` (the spec -- Section 7's binding table is the definition of this IP's scope),
`TRD-CONSOLE-00` Section 6 (design law, `<=3 clicks`, no-stub), `docs/ui-examples/README.md` +
the operator prototype (`preview/clean-layout-preview.png`), the `packages/design` glass material +
tokens, `IP-CONSOLE-05-policies` (the closest recent surface: contract -> read path -> surface ->
commands -> capstone, the shape this copies), and the two crdb IPs above.

## What already exists (do not rebuild)

- **The design system**: `GlassPanel` + `AmbientBackdrop` (the honeycomb-safe glass material),
  `DataTable`, `AccordionGroup`, chips, the semantic color tokens. The prototype's palette is
  byte-identical to the committed tokens (`TRD-CONSOLE-03` Section 4.3), so this is a token mapping,
  not a re-theme.
- **The shell**: rail, IA order, and destination naming from the 2026-07-24 revision (`SOC Ops` is
  already a rail entry pointing at a placeholder).
- **The BFF read pattern**: `CrucibleClient` / `WireCrucibleClient` / `OperatorEngine` delegated reads,
  fail-closed resolvers, tenant-scoped caches, the read-only 405 gate (commands mount ABOVE it -- the
  known gotcha from P5.4).
- **Engine reads already live**: `DETECT_SUMMARY` (FV.6) for the KPI totals; `LOG_QUERY`/`LOG_EXPLAIN`
  for the dock.

## Roster

One PR per row; branch-per-PR, full `scripts/ci.sh` (networked -- the audit stage is a real gate),
no-ff merge, docs separate, reviewed before the next.

| Step | Acceptance | Deliverable |
|------|-----------|-------------|
| **S3.1** | A1 | **The contract.** Re-vendor the crdb `wire-dto.schema.json` (SS.4 + VN.7) and regenerate `wire-dto.ts`; `packages/contracts/src/soc.ts` view models -- `SocIncidentRow`, `SocIncidentDetail`, `LineageNode`, `LineageEdge`, `EvidenceRow`, `ResponseStep`, `VerdictNarrative` -- with FAIL-CLOSED closed-enum projections for node kind, edge state, authority state, and severity (an unknown tag is refused, never coerced to a default that renders as fact). Reuses shared types rather than restating them. `soc.*` bindings registered. |
| **S3.2** | A1, A2 | **The read path.** `SOC_INCIDENT_LIST`/`DETAIL` + `SOC_NARRATIVE` over the QuerySubmit opcode; client + wire-client + `replyTo*`; `OperatorEngine` delegated reads injecting operator + tenant server-side; `engine/soc.ts` resolvers failing closed to a typed `SocUnavailableError`; `GET /api/soc/incidents` (+`/detail`, `/narrative`) with 401/503/400 and a tenant-scoped cache. **Encode-arm check**: add the new verbs to `@forge/wire`'s `encodeWireRequest` and prove it with a payload seam test -- the P5.N live leg showed mocks cannot catch a missing encode arm. |
| **S3.3** | A10, A12 | **The shell**: command header (`Forge Central` mark, tenant/shift line, posture pill, search, the three posture readouts), the focus tab strip with its standing tagline, and the five-tile KPI strip bound to `DETECT_SUMMARY` + SS.3. A `PENDING` binding renders its tile in an explicit unavailable state (`INV-SOC-NO-FABRICATED-NUMBER`). Glass + honeycomb via the committed material. |
| **S3.4** | A3, A12 | **The Decision Queue**: ranked cards (score, id + title, entity path, authority chip), authority-state-first ordering as the engine returned it (the surface does not re-sort), selection driving the rest of the surface, honest empty/error/loading states. |
| **S3.5** | A3, A4 | **The lineage graph**: three lanes (`ATTACK PATH` / `EVIDENCE` / `FORGE DECISION + RESPONSE`), six semantic columns, typed node cards with state chips, four visually distinct edge states + the legend, and the `Material Path` / `Show Evidence` / `Full Story` progressive disclosure with Material Path as default. Node selection re-scopes verdict + dock **without a second fetch** (`INV-SOC-ONE-PAYLOAD`). Library choice is this step's call against `DEPENDENCY-POLICY.md`; the prototype's React Flow + ELK is a reference, not a requirement. |
| **S3.6** | A5-A9, A2 | **The FORGE VERDICT panel**: the generated headline + narrative (labelled, artifact-linked), the three stat cards grounded per `TRD-CONSOLE-03` Section 5.3 (confidence + corroboration, real suppressing inputs, authority -- **not** a fabricated model-consensus percentage), Already enforced, Business impact, Coordinated response, and the two controls. **Renders the engine's refusal**: when VN.6 refused, the structured fields render with an explicit "narrative unavailable" state and the reason -- never a stale narrative, a templated sentence, or blank space. |
| **S3.7** | A3 | **The investigation dock**: `Evidence` (default) / `Timeline` / `Model Reasoning` / `Raw Telemetry` / `Audit Trail`, plus the current-graph-scope pane. `Model Reasoning` shows the narrative's grounding set and the skeptic's per-claim adjudications -- the operator can see what the model was given and what was thrown away. |
| **S3.8** | A11 | **The commands**: `Approve Full Response` / `Modify Plan` over SS.2, mounted ABOVE the read-only 405 gate, confirm-gated, with 409/400/403 mapping and cache-drop. A refusal (enforcement OFF, unavailable action) renders typed and honest, never a silent no-op. |
| **S3.N** | A1-A12 | **The capstone**: Playwright journeys for every Section 8 task within its click budget; edge-state distinctness assertion; the narrative-unavailable journey; a no-stub sweep proving no mock provider ships; and the **live drive on the box** -- real incident, real `gemma4` narrative, real approval path -- over the deployed BFF/SPA, following the P5.N precedent (and its lesson: drive the real wire, not the mock). |

## Sequencing note

S3.1 waits on crdb SS.4 + VN.7 (schema). S3.2 is the seam that must be proven against the real encode
path early. S3.3 -> S3.7 build the surface outward from the shell, each independently renderable so a
failing region degrades alone (`TRD-CONSOLE-03` Section 11.5). S3.8 adds the only mutating path.
S3.N proves it live.

## Deliberately out of scope (named)

- **Everything `TRD-CONSOLE-03` Section 9 defers**: business context (exposure, blast radius),
  containment simulation, the events-analyzed counter beyond SS.3, and multi-model consensus. Those
  tiles/fields render unavailable rather than estimated.
- **The narrative pipeline itself** -- `IP-SOC-VERDICT-NARRATIVE`. This surface reads a stored artifact
  and never triggers generation on render.
- **The other focus tabs** (`Alerts`, `Threat Intel`, `Assets`, `Analytics`, `Automation`,
  `Exceptions`). This IP ships `Incidents`; the rest render an honest "not yet built" state rather than
  a mock, and each earns its own step when its bindings exist.
