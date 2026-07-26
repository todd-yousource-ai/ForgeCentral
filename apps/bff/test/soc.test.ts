// apps/bff/test/soc.test.ts -- IP-CONSOLE-03 S3.2 tier-2 tests for the SOC-surface resolvers.
//
// Proves the S3.2 slice of INV-SOC-NO-FABRICATED-NUMBER: the three reads project, the engine's ORDER
// survives, an engine refusal is preserved rather than reinterpreted, an unnarrowable payload collapses
// the WHOLE read to SocUnavailableError, and the operator delegation is injected server-side.
//
// The distinction these tests exist to hold: a REFUSED queue and an EMPTY queue are different answers,
// and so are "this incident does not exist / is not yours" and "this incident cannot be drawn honestly".
// Collapsing either pair is how a SOC surface starts lying quietly.

import { describe, expect, it } from 'vitest';
import type {
  WireIncidentRow,
  WireSocIncidentDetail,
  WireSocIncidentList,
  WireSocNarrative,
} from '@forge/contracts';

import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';

import {
  SocUnavailableError,
  resolveIncidentDetail,
  resolveIncidentQueue,
  resolveNarrative,
} from '../src/engine/soc.js';

const PRINCIPAL: OperatorPrincipal = {
  principalId: 'op-1',
  tenant: 'tenant-1',
  tier: 'Admin',
} as unknown as OperatorPrincipal;

const wireRow = (overrides: Partial<WireIncidentRow> = {}): WireIncidentRow => ({
  incident_id: 'ep-soc-1',
  rule_id: 'LR-C2-001',
  anchor: 'T1071',
  subject: 'codex-helper',
  finding: 'Repeated outbound contact to a rare destination',
  authority: 'review_required',
  posture: 'candidate',
  confidence: 'HIGH',
  opened_at: 1_700_000_000,
  last_seen: 1_700_000_600,
  evidence_count: 2,
  ...overrides,
});

const wireDetail = (overrides: Partial<WireSocIncidentDetail> = {}): WireSocIncidentDetail => ({
  row: wireRow(),
  nodes: [
    {
      id: 'subject',
      lane: 'attack_path',
      kind: 'subject',
      label: 'codex-helper',
      sublabel: 'T1071',
    },
  ],
  edges: [{ from: 'subject', to: 'decision', state: 'inferred' }],
  evidence: ['leg:net:198.51.100.7'],
  plan: [],
  plan_revision: 0,
  plan_approved: false,
  refused: false,
  ...overrides,
});

const wireNarrative = (overrides: Partial<WireSocNarrative> = {}): WireSocNarrative => ({
  found: false,
  published: false,
  headline: '',
  narrative: [],
  impact: [],
  response: [],
  cited_evidence: [],
  withheld: [],
  needs_human_review: false,
  model_ref: '',
  input_hash: '',
  ...overrides,
});

/** An engine stub whose three SOC reads return what the test hands them. */
function engineOf(replies: {
  list?: WireSocIncidentList;
  detail?: WireSocIncidentDetail;
  narrative?: WireSocNarrative;
  seen?: unknown[];
}): OperatorEngine {
  return {
    socIncidentList: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(replies.list ?? { rows: [], refused: false });
    },
    socIncidentDetail: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(replies.detail ?? wireDetail());
    },
    socNarrative: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(replies.narrative ?? wireNarrative());
    },
  } as unknown as OperatorEngine;
}

describe('the SOC read resolvers (S3.2)', () => {
  it('projects the queue in the engine order, untouched', async () => {
    // The engine ranks by what blocks a human. The resolver passes that through: the same field
    // drives the Decision Waiting count, so a re-sort here would make two panels disagree.
    const list: WireSocIncidentList = {
      rows: [
        wireRow({ incident_id: 'ep-waiting', authority: 'approval_required' }),
        wireRow({ incident_id: 'ep-contained', authority: 'contained', posture: 'escalate' }),
      ],
      refused: false,
    };

    const queue = await resolveIncidentQueue(engineOf({ list }), PRINCIPAL);

    expect(queue.map((r) => r.incidentId)).toEqual(['ep-waiting', 'ep-contained']);
  });

  it('surfaces a refused queue as unavailable, never as an empty queue', async () => {
    // The engine refuses rather than truncating an over-ceiling queue. Rendering that as "no open
    // incidents" would show a calmer environment than the one the analyst is standing in.
    const list: WireSocIncidentList = {
      rows: [],
      refused: true,
      explanation: '250 open incidents exceed the queue ceiling of 200',
    };

    await expect(resolveIncidentQueue(engineOf({ list }), PRINCIPAL)).rejects.toBeInstanceOf(
      SocUnavailableError,
    );
    await expect(resolveIncidentQueue(engineOf({ list }), PRINCIPAL)).rejects.toThrow(
      /exceed the queue ceiling/,
    );
  });

  it('resolves an empty queue as an honest empty list', async () => {
    // A quiet SOC is a real state and must not read as an error.
    const queue = await resolveIncidentQueue(
      engineOf({ list: { rows: [], refused: false } }),
      PRINCIPAL,
    );

    expect(queue).toEqual([]);
  });

  it('collapses the whole queue when one row cannot be narrowed', async () => {
    const list: WireSocIncidentList = {
      rows: [wireRow(), wireRow({ incident_id: 'ep-2', authority: 'invented_state' })],
      refused: false,
    };

    await expect(resolveIncidentQueue(engineOf({ list }), PRINCIPAL)).rejects.toBeInstanceOf(
      SocUnavailableError,
    );
  });

  it('projects one incident assembled', async () => {
    const detail = await resolveIncidentDetail(engineOf({}), PRINCIPAL, 'ep-soc-1');

    expect(detail?.row.incidentId).toBe('ep-soc-1');
    expect(detail?.edges[0]?.state).toBe('inferred');
    expect(detail?.evidence).toEqual([{ leg: 'leg:net:198.51.100.7' }]);
    // No proposer exists engine-side yet, so an empty plan is the honest live answer.
    expect(detail?.plan).toEqual([]);
  });

  it('returns absent for a refused incident, whatever the reason was', async () => {
    // Unknown, another tenant's, and above-clearance are ONE refusal by design. The resolver must
    // not reconstruct a difference the engine deliberately removed.
    const detail = await resolveIncidentDetail(
      engineOf({ detail: wireDetail({ refused: true }) }),
      PRINCIPAL,
      'ep-somebody-elses',
    );

    expect(detail).toBeNull();
  });

  it('distinguishes cannot-see from cannot-draw', async () => {
    // A refusal is "not yours" (null -> 404). An unnarrowable payload is "it exists and I cannot
    // draw it honestly" (throw -> 503). Collapsing these would either hide a real defect or invent
    // an existence oracle.
    const undrawable = wireDetail({
      edges: [{ from: 'subject', to: 'decision', state: 'probably' }],
    });

    await expect(
      resolveIncidentDetail(engineOf({ detail: undrawable }), PRINCIPAL, 'ep-soc-1'),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });

  it('keeps the three narrative states intact rather than erroring on two of them', async () => {
    const absent = await resolveNarrative(engineOf({}), PRINCIPAL, 'ep-soc-1');
    expect(absent.found).toBe(false);

    const refused = await resolveNarrative(
      engineOf({
        narrative: wireNarrative({ found: true, refusal: 'the grounding set did not support it' }),
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(refused.found).toBe(true);
    expect(refused.published).toBe(false);
    expect(refused.refusal).toContain('did not support');

    const published = await resolveNarrative(
      engineOf({
        narrative: wireNarrative({ found: true, published: true, headline: 'Sustained C2' }),
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(published.published).toBe(true);
    expect(published.headline).toBe('Sustained C2');
  });

  it('fails closed on a withheld claim whose ruling is unknown', async () => {
    const narrative = wireNarrative({
      found: true,
      published: true,
      withheld: [{ section: 'impact', text: 't', ruling: 'invented', explanation: 'e', cited: [] }],
    });

    await expect(
      resolveNarrative(engineOf({ narrative }), PRINCIPAL, 'ep-soc-1'),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });

  it('asks the engine for its own ceiling and carries the incident id', async () => {
    // The Console must not impose a second, smaller, invisible bound of its own -- the engine's
    // refuse-not-truncate contract is what keeps the queue honest.
    const seen: unknown[] = [];
    await resolveIncidentQueue(engineOf({ seen }), PRINCIPAL);
    await resolveIncidentDetail(engineOf({ seen }), PRINCIPAL, 'ep-soc-1');

    expect((seen[0] as { limit: number }).limit).toBe(200);
    expect((seen[1] as { incident: string }).incident).toBe('ep-soc-1');
    // Each read carries its own correlation id.
    expect((seen[0] as { request_id: number }).request_id).not.toBe(
      (seen[1] as { request_id: number }).request_id,
    );
  });
});
