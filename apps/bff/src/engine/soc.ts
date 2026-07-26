// apps/bff/src/engine/soc.ts -- the SOC Operations read resolvers (IP-CONSOLE-03 S3.2).
//
// Projects the crdb SOC substrate reads into the Console view models: `soc.incidents` is the ranked
// decision queue (SOC_INCIDENT_LIST, crdb SS.4b), `soc.incident.detail` is one incident assembled --
// lineage, evidence, plan, narrative reference -- in ONE answer (SOC_INCIDENT_DETAIL, SS.4b), and
// `soc.narrative` is the recorded verdict write-up (SOC_NARRATIVE, VN.7b). All three are
// engine-bounded, tenant-private, and operator-delegated via `OperatorEngine`
// (INV-CONSOLE-ENGINE-AUTHZ).
//
// FAIL-CLOSED: a payload carrying an engine tag the contract cannot narrow collapses the WHOLE
// response to `SocUnavailableError`. On this surface that is not fussiness -- a mis-rendered edge
// state or authority is a security-relevant lie, and a queue silently missing an incident reads as a
// calmer environment than the one the analyst is standing in.
//
// THE ENGINE'S REFUSALS ARE PRESERVED, NOT REINTERPRETED:
//   * An over-ceiling queue is REFUSED by the engine rather than truncated. That refusal surfaces as
//     `SocUnavailableError` (503), never as an empty queue -- rendering "no open incidents" for a
//     queue too large to return is the one direction a SOC number must never fail in.
//   * An unknown incident, another tenant's, and one above the caller's clearance are ONE
//     indistinguishable refusal by design (crdb SS.4b). The resolver preserves that: it returns
//     `null` for all three and the route maps it to a single 404. Reconstructing a difference here
//     would rebuild the oracle the engine deliberately removed.
//   * A narrative is never an error. Absent, refused, and published are three legitimate states the
//     surface renders distinctly, so the resolver returns all three intact.

import type {
  SocIncidentDetail,
  SocIncidentRow,
  VerdictNarrative,
  WireSocIncidentDetailQuery,
  WireSocIncidentListQuery,
  WireSocNarrativeQuery,
} from '@forge/contracts';
import { toIncidentDetail, toIncidentQueue, toVerdictNarrative } from '@forge/contracts';

import type { EngineCallOptions } from './client.js';
import type { OperatorEngine } from './operator-engine.js';
import type { OperatorPrincipal } from './principal.js';

/** The engine returned a SOC payload the Console cannot render honestly; the route surfaces 503. */
export class SocUnavailableError extends Error {
  constructor(what: string) {
    super(`SOC read cannot be rendered honestly: ${what}`);
    this.name = 'SocUnavailableError';
  }
}

/**
 * The queue page size requested of the engine.
 *
 * The engine clamps this to its own ceiling (crdb `MAX_QUEUE_ROWS`) and REFUSES rather than
 * truncating when a tenant has more open incidents than that, so this is a request, not a bound the
 * Console enforces. Asking for the engine's own maximum means the Console never introduces a second,
 * smaller, invisible limit of its own.
 */
const QUEUE_LIMIT = 200;

let nextRequestId = 1n;
function requestId(): number {
  nextRequestId += 1n;
  return Number(nextRequestId % 1_000_000_000n);
}

/**
 * Resolve the ranked decision queue.
 *
 * The order is the ENGINE's (authority first, then posture, confidence, recency, id) and is passed
 * through untouched: the same authority field drives the `Decision Waiting` KPI, so a re-sort here
 * would make two panels disagree about what is blocking a person.
 */
export async function resolveIncidentQueue(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  opts?: EngineCallOptions,
): Promise<readonly SocIncidentRow[]> {
  const request: WireSocIncidentListQuery = { request_id: requestId(), limit: QUEUE_LIMIT };
  const list = await engine.socIncidentList(principal, request, opts);
  const queue = toIncidentQueue(list);
  if (queue === null) {
    // Both causes land here on purpose: the engine refused the queue (over its ceiling), or a row
    // carries a tag the Console cannot narrow. Either way the honest answer is "this queue cannot
    // be shown", never a shorter queue that reads as the whole one.
    throw new SocUnavailableError(
      list.refused
        ? `the engine refused the queue (${list.explanation ?? 'no reason given'})`
        : 'an incident row carries an unknown engine tag',
    );
  }
  return queue;
}

/**
 * Resolve one incident, assembled.
 *
 * `null` when the engine refused -- unknown, another tenant's, or above the caller's clearance, all
 * indistinguishable by design. A payload that arrives but cannot be narrowed is a different failure
 * (`SocUnavailableError`): the incident exists and the Console cannot draw it honestly, which the
 * operator needs told rather than shown as "not found".
 */
export async function resolveIncidentDetail(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<SocIncidentDetail | null> {
  const request: WireSocIncidentDetailQuery = { request_id: requestId(), incident };
  const wire = await engine.socIncidentDetail(principal, request, opts);
  if (wire.refused) {
    return null;
  }
  const detail = toIncidentDetail(wire);
  if (detail === null) {
    throw new SocUnavailableError('the incident carries an unknown lane, edge state, or authority');
  }
  return detail;
}

/**
 * Resolve one incident's recorded verdict narrative.
 *
 * Never triggers generation (crdb VN.7b is a read), and never collapses the three states: `found`
 * false means nobody has looked, `published` false means the pipeline looked and would not stand
 * behind it, and an operator deciding from this screen needs to tell those apart.
 */
export async function resolveNarrative(
  engine: OperatorEngine,
  principal: OperatorPrincipal,
  incident: string,
  opts?: EngineCallOptions,
): Promise<VerdictNarrative> {
  const request: WireSocNarrativeQuery = { request_id: requestId(), incident };
  const wire = await engine.socNarrative(principal, request, opts);
  const narrative = toVerdictNarrative(wire);
  if (narrative === null) {
    throw new SocUnavailableError('a withheld claim carries an unknown ruling');
  }
  return narrative;
}
