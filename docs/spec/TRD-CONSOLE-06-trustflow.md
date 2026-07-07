# TRD-CONSOLE-06 -- TrustFlow (brokered egress and inference plane)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. TrustFlow is the operator view of
the platform's **brokered egress and inference plane** -- the real `torch-trustflow` component through
which governed agents reach model APIs and MCP servers, with their requests/responses observed and
egress classified. The term is retained (`TRD-CONSOLE-00` Section 3) because it names a real component.

---

## 1. Purpose

Show the operator how governed agents talk to the outside world -- which model/MCP endpoints they reach,
through the broker, with what egress disposition -- and let them see the inference intent (the `llm.*`
tap) and manage egress posture. TrustFlow is where "what did the agent ask the model" becomes visible and
governable.

## 2. Model

- **Flows:** each brokered path `agent (GCI) -> model/MCP endpoint`, through the `torch-trustflow`
  loopback proxy, with the endpoint (e.g. `api.anthropic.com`, an MCP server), the egress disposition
  (the TRD-32 v2 `EgressClass`: Permit/Restricted/...), and volume.
- **Inference intent (the `llm.*` tap):** for a flow routed through the broker, the governed
  `llm.request`/`llm.response` observations (model, message counts, the content reference -- classified,
  not raw), joined to the agent's GCI (the AG.5 tap on the one governed envelope).
- **MCP tool calls (the `mcp.*` tap):** the governed `mcp.tool_call`/`mcp.result` observations (server,
  tool, arguments reference).
- **Egress posture:** the endpoint markers/allowlist and per-destination disposition (the same endpoint
  data the discovery behavioral signal uses).

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `trustflow.flows`** -> a CrucibleQL query over the govern/observability stream for the
  brokered flows + their egress disposition, per agent GCI, tier-redacted.
- **Read binding `trustflow.inference(gci | flowId)`** -> the `llm.*`/`mcp.*` governed observations for a
  flow (the AG.5 taps on the one governed envelope, node-verified via `obs.batch_verified`).
- **Read binding `trustflow.egressPolicy`** -> the endpoint markers + per-destination disposition.
- **Command bindings** (real, audited, confirm-gated): `trustflow.setEgress(destination, disposition)` ->
  adjust an endpoint's egress disposition (a Forge/Torch egress-policy operation).
- **`PENDING` / `INV-CROSS` (significant here, stated honestly):** the `torch-trustflow` proxy is a built,
  tested component, but the **live `llm.*` intent tap is a DEFERRED-LIVE leg** in Torch today (the govern
  lane captures the sensor taps; the proxy that decodes inference intent is not yet spawned by the
  daemon, and live kernel-level egress enforcement, AG.7, is OFF by design). So on this surface:
  - The sensor-tap flows (agent -> endpoint connections) and their egress disposition are real today.
  - The **`llm.*`/`mcp.*` inference-intent panels are `PENDING`** until the trustflow proxy is wired live
    (the implementing IP names the Torch work: stand up the proxy, route the agent through it, land the
    tap into the govern envelope). Until then the panel shows a labelled "inference tap not yet live"
    state and renders **no fabricated inference content** -- consistent with the SOC-report honesty rule
    already applied elsewhere in the platform.
  - Live egress **enforcement** actions are `PENDING` behind AG.7; egress **classification/observation**
    is what the surface shows today.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click a flow -> its detail (endpoint, disposition, the agent via the drawer, and -- when live -- its
  inference-intent observations).
- **See what an agent asked the model:** a flow (1) -> the inference panel (2) [live once the tap is
  wired; `PENDING` state until then].
- **Adjust an endpoint's egress disposition:** an endpoint (1) -> set disposition (2) -> confirm (3).
- From the entity drawer, an agent's TrustFlow activity links here.

## 5. Performance, states

Flows stream from the govern/observability stream (`LIVE`); the inference panel streams when live.
Loading skeletons; empty ("no brokered flows"); the distinctive **`PENDING` inference-tap banner** where
the `llm.*` tap is not yet wired (labelled, no fabricated content); unauthorized flows/content absent per
tier (inference content is classification-gated -- the operator sees the reference + classification, raw
content only at the authorized tier).

## 6. Acceptance and failure semantics

**Acceptance:**
- Every flow + egress disposition derives from the real govern/observability stream; no fabricated flow
  (contract test + fixtureless render).
- The inference-intent panel shows real `llm.*`/`mcp.*` observations **only when the tap is live**; until
  then it shows the labelled `PENDING` state and no fabricated inference content (this is a hard
  acceptance gate -- the surface must never invent inference content).
- Egress disposition changes commit through the engine with audit and are confirm-gated.
- Content is classification/tier-gated; the operator never sees raw inference content above their tier.

**Failure semantics:** inherit `TRD-CONSOLE-00` Section 11 -- engine-unreachable shows a typed state; a
`PENDING` inference panel or enforcement action is a labelled non-live control; an unauthorized content
view is refused with the typed error.

## 7. Six-bug-category notes

Cross-module gap: flow + inference view models typed in `@forge/contracts` against the govern-envelope /
`llm.*`/`mcp.*` shapes. Missing failure path: no-flows, `PENDING`-tap, unauthorized-content tested. Schema
bypass: inference observations come from the typed govern-envelope shape, never a raw parse. Honesty:
the `PENDING`-tap acceptance gate is the specific defense against the fabricated-inference-content defect.
