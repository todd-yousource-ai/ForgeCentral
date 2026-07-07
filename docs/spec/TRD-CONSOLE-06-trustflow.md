# TRD-CONSOLE-06 -- TrustFlow (brokered egress and inference plane)

**Status:** DRAFT (authored 2026-07-07). Inherits `TRD-CONSOLE-00`. TrustFlow is the operator view of
the platform's **brokered egress and inference plane** -- the real `torch-trustflow` component through
which governed agents reach model APIs and MCP servers, with their requests/responses observed and
egress classified. The term is retained (`TRD-CONSOLE-00` Section 3) because it names a real component.

---

## 1. Purpose

Show the operator how governed agents talk to the outside world -- which model/MCP endpoints they reach,
through the broker, with what egress disposition -- **let the operator connect to the actual captured
agent-to-model conversation and read it, search across all captured conversations for malicious intent,
and see the automated intent findings** -- and manage egress posture. TrustFlow is where "what did the
agent ask the model, and was it up to something" becomes visible, searchable, and governable. This
covers both cloud LLM chats and local inference-model chats: Torch captures the conversation regardless
of the endpoint (IP-TORCH-CAPTURE), so a locally-hosted model is inspected the same way as a cloud API.

## 2. Model

- **Flows:** each brokered path `agent (GCI) -> model/MCP endpoint`, through the `torch-trustflow`
  loopback proxy, with the endpoint (e.g. `api.anthropic.com`, a local model endpoint, an MCP server),
  the egress disposition (the TRD-32 v2 `EgressClass`: Permit/Restricted/...), and volume.
- **Inference intent (the `llm.*` tap):** for a flow routed through the broker, the governed
  `llm.request`/`llm.response` observations (model, message counts, the content reference -- classified,
  not raw), joined to the agent's GCI (the AG.5 tap on the one governed envelope).
- **Conversation content (the captured chat).** The actual agent-to-model conversation is captured by
  Torch (IP-TORCH-CAPTURE, the transcript/SDK/browser/egress tiers) and stored content-addressed in
  Crucible; the governed event carries a `ContentRef` (`ContentLocator::ContentHash` + classification)
  pointing at that evidence, never inlining it. The Console can **connect to a conversation** and render
  its turns (system/user/assistant/tool) by resolving the `ContentRef` to the captured content in
  Crucible, subject to classification + EXPLAIN tier. This is the "read the chat" surface.
- **MCP tool calls (the `mcp.*` tap):** the governed `mcp.tool_call`/`mcp.result` observations (server,
  tool, arguments reference).
- **Malicious-intent search + findings.** Across the corpus of captured conversations, the operator can
  **search for malicious intent** -- semantic (CrucibleQL `NEAR`, e.g. "data exfiltration", "credential
  harvesting", "jailbreak"), full-text (`TEXT`), or hybrid (`FUSE`) -- and the surface shows **automated
  intent findings**: conversations an intent detector flagged (prompt injection, exfiltration intent,
  jailbreak/guardrail-evasion, tool-abuse, secret solicitation), each with the flagged turn(s) and a
  rationale. Search is a real CrucibleQL capability today; the automated detector is the new engine work
  (Section 3, `PENDING`/`INV-CROSS`).
- **Egress posture:** the endpoint markers/allowlist and per-destination disposition (the same endpoint
  data the discovery behavioral signal uses).

## 3. Data source and bindings (INV-CONSOLE-NO-STUB, CRUCIBLEQL-FIRST)

- **Read binding `trustflow.flows`** -> a CrucibleQL query over the govern/observability stream for the
  brokered flows + their egress disposition, per agent GCI, tier-redacted.
- **Read binding `trustflow.inference(gci | flowId)`** -> the `llm.*`/`mcp.*` governed observations for a
  flow (the AG.5 taps on the one governed envelope, node-verified via `obs.batch_verified`).
- **Read binding `trustflow.conversation(refOrId)`** -> **connect to and render a captured conversation.**
  Resolves the governed event's `ContentRef` (`ContentLocator::ContentHash`) to the captured chat evidence
  stored content-addressed in Crucible (IP-TORCH-CAPTURE), returning the conversation turns
  (system/user/assistant/tool) for display, subject to classification + EXPLAIN tier. The raw content is
  gated: an operator sees the reference + classification always, and the decrypted/plaintext turns only at
  the authorized tier (TRD-04 classification; the capture path already governs this). This is the "read
  the chat" binding; the content is real captured evidence, never synthesized.
- **Read binding `trustflow.searchContent(query, {mode})`** -> **search the captured-conversation corpus
  for malicious intent.** A CrucibleQL search over the captured content: `NEAR` (semantic/vector, e.g.
  "exfiltrate customer data"), `TEXT` (full-text), or `FUSE` (hybrid RRF) -- the real `cdb-cql-exec`
  search steps -- returning ranked matching conversations/turns, tier-redacted and authorization-scoped
  in candidate generation (TRD-04, so a restricted conversation never leaks through ranking). Search is a
  real CrucibleQL capability today.
- **Read binding `trustflow.intentFindings({filter})`** -> the **automated malicious-intent findings**:
  conversations an intent detector flagged (prompt injection, exfiltration intent, jailbreak/guardrail
  evasion, tool-abuse, secret solicitation), each with the flagged turn(s), the intent class, a
  confidence, and a rationale (EXPLAIN). Each finding is a real DecisionObject/finding over the content;
  clicking it opens the conversation at the flagged turn and the acting agent (the drawer).
- **Read binding `trustflow.egressPolicy`** -> the endpoint markers + per-destination disposition.
- **Command bindings** (real, audited, confirm-gated): `trustflow.setEgress(destination, disposition)` ->
  adjust an endpoint's egress disposition (a Forge/Torch egress-policy operation). From an intent finding,
  the operator can act on the agent (contain/isolate via the drawer, `TRD-CONSOLE-12`).
- **What is real today vs `PENDING` / `INV-CROSS` (stated honestly):**
  - **Real:** the sensor-tap flows (agent -> endpoint) + egress disposition; **the captured conversations**
    (IP-TORCH-CAPTURE stores the chat content-addressed in Crucible, referenced by `ContentRef`), so
    `trustflow.conversation` can connect to and render a past chat, tier-gated; and **content search**
    (`trustflow.searchContent` over the corpus via CrucibleQL `NEAR`/`TEXT`/`FUSE`, `cdb-cql-exec`
    search). Reading and searching captured conversations for malicious intent is achievable now.
  - **`PENDING` -- the live inference tap.** The `torch-trustflow` proxy is a built, tested component, but
    the **live `llm.*` intent tap is a DEFERRED-LIVE leg** in Torch (the proxy is not yet spawned by the
    daemon). So *live* streaming of an in-progress chat (`trustflow.inference` on an active flow) is
    `PENDING` until the proxy is wired live (the implementing IP names the Torch work: stand up the proxy,
    route agents through it, land the tap into the govern envelope). Historical captured chats are read
    via `trustflow.conversation` regardless. The live panel shows a labelled state and **never fabricates
    inference content**.
  - **`PENDING` -- the automated malicious-intent detector.** Scanning captured conversation *content* for
    malicious intent (prompt injection, exfiltration, jailbreak, tool-abuse, secret solicitation) and
    emitting a finding is **new engine work** -- the existing cyber detectors are behavior/telemetry-based,
    not content-intent. `trustflow.intentFindings` binds to that detector; the `INV-CROSS` task (Section 6
    of the roadmap) is a Crucible content-intent detector over the captured corpus (a CrucibleQL
    vector/semantic + rule classifier emitting a DecisionObject), optionally with a Torch-side inline
    classifier at capture time. **Hard acceptance gate: the surface never fabricates a finding** -- until
    the detector is live, `intentFindings` shows the labelled `PENDING` state, and only the operator-driven
    `searchContent` (real) is available. Operator search is the interim; the detector is the automation.
  - Live egress **enforcement** actions are `PENDING` behind AG.7; egress **classification/observation** is
    what the surface shows today.

## 4. Interaction and three-click paths (INV-CONSOLE-3-CLICKS)

- Click a flow -> its detail (endpoint, disposition, the agent via the drawer, and -- when live -- its
  inference-intent observations).
- **Read a captured conversation:** a flow or an intent finding (1) -> the conversation view (2), rendered
  from the captured content in Crucible, tier-gated.
- **Search all conversations for malicious intent:** the content search (1 interaction) -> a ranked match
  (1) -> the conversation at the matching turn (2).
- **Triage an intent finding and act:** an intent finding (1) -> the conversation + rationale (2) ->
  contain/isolate the agent via the drawer (3, confirm-gated).
- **See what an agent asked the model (live):** a flow (1) -> the inference panel (2) [live once the tap
  is wired; `PENDING` state until then; historical chats always via the conversation view].
- **Adjust an endpoint's egress disposition:** an endpoint (1) -> set disposition (2) -> confirm (3).
- From the entity drawer, an agent's TrustFlow activity + its conversations link here.

## 5. Performance, states

Flows stream from the govern/observability stream (`LIVE`); the inference panel streams when live; the
conversation view resolves captured content on open (large chats are paged by turn); content search is a
bounded, ranked CrucibleQL query. Loading skeletons; empty ("no brokered flows", "no matches", "no intent
findings"); the distinctive **`PENDING` banners** on (a) the live inference-tap panel and (b) the
automated intent-findings panel where those legs are not yet wired (labelled, no fabricated content or
findings); unauthorized flows/content/findings absent per tier (conversation content is classification-
gated -- the operator sees the reference + classification always, decrypted turns only at the authorized
tier).

## 6. Acceptance and failure semantics

**Acceptance:**
- Every flow + egress disposition derives from the real govern/observability stream; no fabricated flow
  (contract test + fixtureless render).
- The inference-intent panel shows real `llm.*`/`mcp.*` observations **only when the tap is live**; until
  then it shows the labelled `PENDING` state and no fabricated inference content (this is a hard
  acceptance gate -- the surface must never invent inference content).
- **The conversation view renders real captured content** resolved from the `ContentRef` in Crucible; it
  never fabricates a turn, and it is classification/tier-gated (the reference + classification always;
  decrypted turns only at the authorized tier).
- **Content search returns real CrucibleQL matches** (`NEAR`/`TEXT`/`FUSE`) over the captured corpus,
  authorization-scoped in candidate generation so a restricted conversation never leaks through ranking;
  an empty result renders the empty state, never a fabricated match.
- **The automated intent-findings panel shows a finding only when the detector is live**; until then it
  shows the labelled `PENDING` state and **no fabricated finding** (a hard acceptance gate), and only the
  operator-driven search is available. A shipped finding is a real DecisionObject over the content with a
  rationale, and clicking it opens the exact flagged turn.
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
