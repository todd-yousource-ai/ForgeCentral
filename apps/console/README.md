# @forge/console-spa

The YouSource Console SPA: the operator pane of glass over the platform
(Crucible + Torch + Forge), served by the BFF. React + TypeScript; renders
`@forge/design`; holds **no surface data of its own** -- every value on screen
arrives through a registered binding (`INV-CONSOLE-NO-STUB`).

## Structure

- **Shell + IA** (`shell/`, `ia/`, `routing/`) -- the left `NavRail`, `TopBar`,
  `Brand`, the `DrawerHost` (the right-drawer pattern), and the information
  architecture honoring the <= 3-clicks-from-Overview rule
  (`INV-CONSOLE-3-CLICKS`).
- **Auth** (`auth/`) -- the Auth0 login flow against the BFF session; the SPA
  holds no tokens beyond the session cookie and projects the operator's
  engine-side RBAC.
- **Data layers** (`query/`, `live/`) -- TanStack Query for reads (`client.ts`
  over the BFF OpenAPI types) and the live-stream store (`LiveProvider`,
  `live-store.ts`) for decision/graph deltas.
- **Explicit states** (`states/`) -- every surface renders explicit
  empty/loading/error/stale states; a blank panel is a defect, not a state.
- **Surfaces** (`surfaces/`) -- one component + one `use*` hook per shipped
  surface: Overview (Sankey flow), Logs, Objects, VTZ (+ `VtzEditor`), Users,
  Policies (+ `PolicyForm`, `DistributionPanel`), and the SOC family
  (`SocOpsSurface`, decision queue, investigation dock, lineage graph, verdict
  panel, plan editor). Policy composition and distribution live on the POLICY
  tab, never on the VTZ panel. `SurfacePlaceholder` marks a routed-but-unbuilt
  surface honestly.
- **Entity detail** (`entity/`) -- the entity drawer over the crdb entity-read
  contract.

## Tests

`pnpm --filter @forge/console-spa test` (Vitest + Testing Library, happy-dom):
shell/IA navigation, auth flow over a mocked BFF, query/live-store behavior,
explicit-state rendering, and per-surface render contracts over recorded
view-models. The <= 3-click tasks are exercised by the Playwright e2e stage of
`scripts/ci.sh` against a seeded engine.
