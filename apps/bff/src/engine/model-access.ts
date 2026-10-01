// apps/bff/src/engine/model-access.ts -- the model-access resolvers (IP-FRONTIER-GATEWAY GW.10 over
// crdb GW.10a, `MODEL_ACCESS_READ` / `AGENT_GRANT_SET`).
//
// The engine gates both by tier (the read Admin / SecurityAudit, the write Admin) under the Settings
// delegation, and does the grant read-modify-write itself: the BFF sends what the operator wants and
// what the operator saw, and projects the reply fail-closed. Nothing is cached: a grant toggle must
// show what was just written.

import type {
  AgentGrantChange,
  AgentGrantOutcome,
  ModelAccessView,
  WireAgentGrantSet,
  WireModelAccessQuery,
} from '@forge/contracts';
import { toAgentGrantOutcome, toModelAccessView } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';
import { requestId } from './soc.js';

const DAY_MS = 86_400_000;

/** The longest spend window the page may ask for, in days. TUNE: 31 -- a month of daily rows. */
export const MAX_SPEND_DAYS = 31;

/**
 * The spend window for the last `days` UTC days, today included: from the start of the first day to
 * one millisecond past `nowMs` (the engine's end is exclusive).
 */
export function spendWindow(days: number, nowMs: number): { from: number; to: number } {
  const today = Math.floor(nowMs / DAY_MS);
  return { from: (today - (days - 1)) * DAY_MS, to: nowMs + 1 };
}

/** Read the model-access page; `null` is the engine's refusal (a tier below Admin / SecurityAudit). */
export async function resolveModelAccess(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  days: number,
  nowMs: number,
  opts?: EngineCallOptions,
): Promise<ModelAccessView | null> {
  const window = spendWindow(days, nowMs);
  const request: WireModelAccessQuery = {
    request_id: requestId(),
    from_unix_ms: window.from,
    to_unix_ms: window.to,
  };
  return toModelAccessView(await engine.modelAccessRead(principal, request, opts));
}

/**
 * Apply one agent's model and tool change; `null` is the engine's refusal (below Admin). A stale
 * write is a `conflict` outcome carrying what is stored now, never an overwrite.
 */
export async function applyAgentGrant(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  change: AgentGrantChange,
  opts?: EngineCallOptions,
): Promise<AgentGrantOutcome | null> {
  const request: WireAgentGrantSet = {
    request_id: requestId(),
    agent: change.agent,
    models: [...change.models],
    tools: [...change.tools],
    expected_models: [...change.expectedModels],
    expected_tools: [...change.expectedTools],
  };
  return toAgentGrantOutcome(await engine.agentGrantSet(principal, request, opts));
}
