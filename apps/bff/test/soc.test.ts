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

// -- the evidence-depth resolvers (S3.8c; crdb ED.2-ED.5 + the runner) -------------------------------

import type {
  WireSocAudit,
  WireSocImpact,
  WireSocRunState,
  WireSocTelemetry,
} from '@forge/contracts';
import {
  resolveAuditTrail,
  resolveBusinessImpact,
  resolveCognitionRun,
  resolveIncidentTelemetry,
} from '../src/engine/soc.js';

function depthEngineOf(replies: {
  telemetry?: WireSocTelemetry;
  audit?: WireSocAudit;
  impact?: WireSocImpact;
  runState?: WireSocRunState;
  seen?: unknown[];
}): OperatorEngine {
  return {
    socTelemetry: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(
        replies.telemetry ?? {
          anchor: 'anchored',
          cited_evidence: [],
          observations: [],
          refused: false,
        },
      );
    },
    socAudit: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(replies.audit ?? { acts: [], refused: false });
    },
    socImpact: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(
        replies.impact ?? {
          band: 'Medium',
          total_milli: 640,
          factors: [],
          sentence_state: 'not_assessed',
          refused: false,
        },
      );
    },
    socCognitionRun: (_principal: OperatorPrincipal, request: unknown) => {
      replies.seen?.push(request);
      return Promise.resolve(replies.runState ?? { state: 'started', detail: '' });
    },
  } as unknown as OperatorEngine;
}

describe('the evidence-depth resolvers (S3.8c)', () => {
  it('projects resolved, aged-out, and restricted observations with their references', async () => {
    // The pane's whole value: an absence an analyst can act on. All three outcomes arrive as rows,
    // never as omissions.
    const telemetry = await resolveIncidentTelemetry(
      depthEngineOf({
        telemetry: {
          anchor: 'anchored',
          cited_evidence: [
            { entry: 'Network Traffic Content', kind: 'data_component' },
            { entry: 'leg:obs-1', kind: 'leg' },
          ],
          observations: [
            {
              observation_id: 'obs-1',
              outcome: 'resolved',
              observed_at: 1_700_000_000,
              category: 'network',
              fields: [['dst', '198.51.100.7']],
            },
            { observation_id: 'obs-2', outcome: 'aged_out', observed_at: 0, fields: [] },
            { observation_id: 'obs-3', outcome: 'restricted', observed_at: 0, fields: [] },
          ],
          refused: false,
        },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );

    expect(telemetry?.observations.map((row) => row.outcome)).toEqual([
      'resolved',
      'aged_out',
      'restricted',
    ]);
    expect(telemetry?.citedEvidence[0]?.kind).toBe('data_component');
  });

  it('fails closed on a telemetry outcome it cannot narrow', async () => {
    await expect(
      resolveIncidentTelemetry(
        depthEngineOf({
          telemetry: {
            anchor: 'anchored',
            cited_evidence: [],
            observations: [
              { observation_id: 'obs-1', outcome: 'vanished', observed_at: 0, fields: [] },
            ],
            refused: false,
          },
        }),
        PRINCIPAL,
        'ep-soc-1',
      ),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });

  it('returns absent for a refused telemetry read, whatever the reason was', async () => {
    const telemetry = await resolveIncidentTelemetry(
      depthEngineOf({
        telemetry: { anchor: '', cited_evidence: [], observations: [], refused: true },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(telemetry).toBeNull();
  });

  it('projects the audit trail and fails closed on an unknown act', async () => {
    const trail = await resolveAuditTrail(
      depthEngineOf({
        audit: {
          acts: [
            {
              act: 'plan_proposed',
              principal: 'p-1',
              at_seconds: 1_700_000_100,
              detail: '2 step(s)',
            },
            { act: 'plan_approved', principal: 'p-2', at_seconds: 1_700_000_200 },
          ],
          refused: false,
        },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(trail?.map((act) => act.act)).toEqual(['plan_proposed', 'plan_approved']);

    await expect(
      resolveAuditTrail(
        depthEngineOf({
          audit: {
            acts: [{ act: 'obliterated', principal: 'p-1', at_seconds: 0 }],
            refused: false,
          },
        }),
        PRINCIPAL,
        'ep-soc-1',
      ),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });

  it('keeps the three sentence states distinct and never blanks the band', async () => {
    // ED.5's whole point at this tier: a model that is unavailable costs the panel its SENTENCE and
    // never its number.
    const notAssessed = await resolveBusinessImpact(depthEngineOf({}), PRINCIPAL, 'ep-soc-1');
    expect(notAssessed?.band).toBe('Medium');
    expect(notAssessed?.sentenceState).toBe('not_assessed');
    expect(notAssessed?.sentence).toBeNull();

    const published = await resolveBusinessImpact(
      depthEngineOf({
        impact: {
          band: 'Medium',
          total_milli: 640,
          factors: [{ factor: 'confidence', weight_milli: 400, basis: 'corroborated' }],
          sentence_state: 'published',
          sentence: 'A moderate assessment.',
          refused: false,
        },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(published?.sentenceState).toBe('published');
    expect(published?.sentence).toBe('A moderate assessment.');

    const refused = await resolveBusinessImpact(
      depthEngineOf({
        impact: {
          band: 'Low',
          total_milli: 100,
          factors: [],
          sentence_state: 'refused',
          sentence: 'the sentence names `host-9`, which is not a fact of this incident',
          refused: false,
        },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(refused?.sentenceState).toBe('refused');
    expect(refused?.sentence).toContain('host-9');
  });

  it('fails closed on a band outside the severity ladder', async () => {
    await expect(
      resolveBusinessImpact(
        depthEngineOf({
          impact: {
            band: 'Apocalyptic',
            total_milli: 9_000,
            factors: [],
            sentence_state: 'not_assessed',
            refused: false,
          },
        }),
        PRINCIPAL,
        'ep-soc-1',
      ),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });

  it('carries the run acknowledgement, including an engine refusal with its reason', async () => {
    const started = await resolveCognitionRun(depthEngineOf({}), PRINCIPAL, 'ep-soc-1');
    expect(started).toEqual({ state: 'started', detail: null });

    const refused = await resolveCognitionRun(
      depthEngineOf({
        runState: { state: 'refused', detail: 'no SOC-narrative model is bound' },
      }),
      PRINCIPAL,
      'ep-soc-1',
    );
    expect(refused.state).toBe('refused');
    expect(refused.detail).toContain('model is bound');

    await expect(
      resolveCognitionRun(
        depthEngineOf({ runState: { state: 'exploded', detail: '' } }),
        PRINCIPAL,
        'ep-soc-1',
      ),
    ).rejects.toBeInstanceOf(SocUnavailableError);
  });
});
