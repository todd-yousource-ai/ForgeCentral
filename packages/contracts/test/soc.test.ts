// packages/contracts/test/soc.test.ts -- IP-CONSOLE-03 S3.1 tier-1 tests for the SOC Ops contract.
//
// Proves the S3.1 slice of INV-SOC-NO-FABRICATED-NUMBER and INV-SOC-EDGE-STATE-HONEST: every SOC view
// model is a projection of the live crdb wire DTOs (a drifted engine field is a compile error in these
// fixtures), every enum narrowing is CLOSED, a refused read never renders as an empty-but-fine answer,
// and the three narrative states stay distinguishable.
//
// The vocabularies asserted here are the tokens crdb pins in `LineageLane::tag` / `EdgeState::tag` /
// `AuthorityState::as_str` / `posture_tag` / `ConfidenceTier::tag`. They are asserted literally on
// purpose: these fixtures are the Console's half of that contract, and a silent change on either side
// should fail here rather than blank a panel at runtime.

import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_STATES,
  EDGE_STATES,
  isWaitingOnAHuman,
  toIncidentDetail,
  toIncidentQueue,
  toIncidentRow,
  toPlanEffect,
  toResponseStep,
  toVerdictNarrative,
  toWirePlanSteps,
} from '../src/index.js';
import type {
  WireIncidentRow,
  WireSocIncidentDetail,
  WireSocIncidentList,
  WireSocNarrative,
  WireSocPlanEffect,
} from '../src/index.js';

function wireRow(overrides: Partial<WireIncidentRow> = {}): WireIncidentRow {
  return {
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
  };
}

function wireDetail(overrides: Partial<WireSocIncidentDetail> = {}): WireSocIncidentDetail {
  return {
    row: wireRow(),
    nodes: [
      {
        id: 'subject',
        lane: 'attack_path',
        kind: 'subject',
        label: 'codex-helper',
        sublabel: 'T1071',
      },
      {
        id: 'leg-0',
        lane: 'attack_path',
        kind: 'network',
        label: 'leg:net:198.51.100.7',
        sublabel: '',
      },
      {
        id: 'ev-0',
        lane: 'evidence',
        kind: 'evidence',
        label: 'leg:net:198.51.100.7',
        sublabel: 'LR-C2-001',
      },
      {
        id: 'decision',
        lane: 'decision',
        kind: 'decision',
        label: 'Repeated outbound contact',
        sublabel: 'Candidate',
      },
    ],
    edges: [
      { from: 'subject', to: 'leg-0', state: 'observed' },
      { from: 'leg-0', to: 'ev-0', state: 'observed' },
      { from: 'subject', to: 'decision', state: 'inferred' },
    ],
    evidence: ['leg:net:198.51.100.7', 'leg:proc:codex-helper:pid:4242'],
    plan: [],
    plan_revision: 0,
    plan_approved: false,
    refused: false,
    ...overrides,
  };
}

describe('the SOC Ops contract (S3.1)', () => {
  it('projects a queue row without inventing a score', () => {
    const row = toIncidentRow(wireRow());

    expect(row).not.toBeNull();
    expect(row?.incidentId).toBe('ep-soc-1');
    expect(row?.authority).toBe('review_required');
    expect(row?.posture).toBe('candidate');
    expect(row?.confidence).toBe('HIGH');
    // The prototype's 94.1 and dollar exposure have no engine source, so the view model has no field
    // to put them in. This assertion is the guard against someone helpfully adding one.
    expect(row).not.toHaveProperty('score');
    expect(row).not.toHaveProperty('exposure');
  });

  it('refuses a row whose authority the Console does not know', () => {
    // A guessed authority would put an incident in the wrong place in the queue AND miscount the
    // Decision Waiting KPI, which reads the same field.
    expect(toIncidentRow(wireRow({ authority: 'auto_contained_probably' }))).toBeNull();
  });

  it('refuses a row whose posture or confidence it does not know', () => {
    expect(toIncidentRow(wireRow({ posture: 'Escalate' }))).toBeNull();
    expect(toIncidentRow(wireRow({ confidence: 'High' }))).toBeNull();
  });

  it('pins the shared vocabularies the engine emits', () => {
    // These are the exact tokens crdb pins. Asserted literally so a change on either side of the
    // contract fails here instead of blanking a panel at runtime -- the engine emitted `attackpath`
    // for `AttackPath` until the vocabulary was pinned, which would have refused every lane below.
    expect(toIncidentRow(wireRow({ posture: 'observe-only' }))?.posture).toBe('observe-only');
    expect(toIncidentRow(wireRow({ posture: 'escalate' }))?.posture).toBe('escalate');
    for (const authority of AUTHORITY_STATES) {
      expect(toIncidentRow(wireRow({ authority }))?.authority).toBe(authority);
    }
    const detail = toIncidentDetail(wireDetail());
    expect(detail?.nodes.map((n) => n.lane)).toEqual([
      'attack_path',
      'attack_path',
      'evidence',
      'decision',
    ]);
  });

  it('preserves the engine ordering of the queue', () => {
    // The engine ranks by what blocks a human first. The Console renders that order and does not
    // re-sort: the same field drives the Decision Waiting count, so a client sort would make two
    // panels disagree about what is blocking a person.
    const list: WireSocIncidentList = {
      rows: [
        wireRow({
          incident_id: 'ep-waiting',
          authority: 'approval_required',
          posture: 'candidate',
        }),
        wireRow({ incident_id: 'ep-contained', authority: 'contained', posture: 'escalate' }),
      ],
      refused: false,
    };

    const queue = toIncidentQueue(list);

    expect(queue?.map((r) => r.incidentId)).toEqual(['ep-waiting', 'ep-contained']);
  });

  it('renders a refused queue as a refusal, never as an empty queue', () => {
    // Refuse-not-truncate has to survive the projection. An empty array here would render as "no
    // open incidents" -- a calmer environment than the one the analyst is standing in.
    const refused: WireSocIncidentList = {
      rows: [],
      refused: true,
      explanation: 'queue exceeds its ceiling',
    };

    expect(toIncidentQueue(refused)).toBeNull();
    expect(toIncidentQueue({ rows: [], refused: false })).toEqual([]);
  });

  it('collapses the whole queue when one row is malformed', () => {
    const list: WireSocIncidentList = {
      rows: [wireRow(), wireRow({ incident_id: 'ep-2', authority: 'nonsense' })],
      refused: false,
    };

    expect(toIncidentQueue(list)).toBeNull();
  });

  it('carries every edge state distinctly and never upgrades one', () => {
    const detail = toIncidentDetail(wireDetail());

    expect(detail?.edges.map((e) => e.state)).toEqual(['observed', 'observed', 'inferred']);
    // Nothing is verified with enforcement OFF; the projection must not manufacture one.
    expect(detail?.edges.some((e) => e.state === 'verified')).toBe(false);
  });

  it('refuses a lineage graph containing an edge state it cannot narrow', () => {
    // A partially-drawn graph is worse than none: every hop that IS drawn looks equally certain, and
    // the operator cannot tell which one is missing.
    const detail = wireDetail({
      edges: [
        { from: 'subject', to: 'leg-0', state: 'observed' },
        { from: 'leg-0', to: 'ev-0', state: 'probably' },
      ],
    });

    expect(toIncidentDetail(detail)).toBeNull();
  });

  it('refuses a lineage graph containing an unknown lane or node kind', () => {
    expect(
      toIncidentDetail(
        wireDetail({
          nodes: [{ id: 'x', lane: 'attackpath', kind: 'subject', label: 'x', sublabel: '' }],
        }),
      ),
    ).toBeNull();
    expect(
      toIncidentDetail(
        wireDetail({
          nodes: [{ id: 'x', lane: 'attack_path', kind: 'daemon', label: 'x', sublabel: '' }],
        }),
      ),
    ).toBeNull();
  });

  it('renders a refused detail as absent, indistinguishably from unknown', () => {
    // Unknown, another tenant's, and above-clearance are ONE refusal by design. The projection must
    // not reconstruct a difference the engine deliberately removed.
    const refused = wireDetail({ refused: true });

    expect(toIncidentDetail(refused)).toBeNull();
  });

  it('projects an empty plan honestly rather than inventing steps', () => {
    // crdb has no production plan proposer yet, so this is what a live box returns. The surface
    // renders the emptiness; it must never compose a plan client-side (INV-SOC-PLAN-DURABLE).
    const detail = toIncidentDetail(wireDetail());

    expect(detail?.plan).toEqual([]);
    expect(detail?.planApproved).toBe(false);
    expect(detail?.planRevision).toBe(0);
  });

  it('treats an empty step action as investigative, not as a failed projection', () => {
    // An investigative step is a real part of a coordinated response: it changes no state, so it
    // needs no enforcement to complete. Absence is meaningful here, not unknown.
    const step = toResponseStep({
      ordinal: 1,
      title: 'Inspect adjacent workspaces',
      authority: 'review_required',
      state: 'approved',
    });

    expect(step?.action).toBeNull();
    expect(step?.state).toBe('approved');
  });

  it('refuses a step whose action it cannot narrow', () => {
    // Rendering an unknown action as investigative would turn "quarantine the agent" into "look at
    // the agent" on the operator's screen.
    expect(
      toResponseStep({
        ordinal: 0,
        title: 'Obliterate it',
        action: 'obliterate',
        authority: 'approval_required',
        state: 'proposed',
      }),
    ).toBeNull();
  });

  it('carries a refused containment step with its reason and never claims enforcement', () => {
    const effect: WireSocPlanEffect = {
      incident: 'ep-soc-1',
      revision: 1,
      approved: true,
      enforcement_active: false,
      steps: [
        {
          ordinal: 0,
          title: 'Quarantine codex-helper',
          action: 'Quarantine',
          authority: 'approval_required',
          state: 'refused',
          explanation: 'enforcement is off on this deployment; no containment was carried out',
        },
      ],
    };

    const projected = toPlanEffect(effect);

    expect(projected?.approved).toBe(true);
    expect(projected?.enforcementActive).toBe(false);
    expect(projected?.steps[0]?.state).toBe('refused');
    expect(projected?.steps[0]?.action).toBe('quarantine');
    expect(projected?.steps[0]?.explanation).toContain('enforcement is off');
  });

  it('submits only what a step does, never its authority or state', () => {
    // The engine assigns authority and state. A Console that submitted them could hand over a step
    // claiming to be already executed.
    const wire = toWirePlanSteps([
      { title: 'Quarantine codex-helper', action: 'quarantine' },
      { title: 'Inspect adjacent workspaces', action: null },
    ]);

    expect(wire).toEqual([
      { title: 'Quarantine codex-helper', action: 'quarantine' },
      { title: 'Inspect adjacent workspaces', action: '' },
    ]);
    expect(wire[0]).not.toHaveProperty('state');
    expect(wire[0]).not.toHaveProperty('authority');
  });

  it('keeps the three narrative states distinguishable', () => {
    // "Nobody has looked" and "the pipeline looked and would not stand behind it" are different
    // answers, and an operator deciding from this screen needs to tell them apart.
    const absent: WireSocNarrative = {
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
    };
    const refused: WireSocNarrative = {
      ...absent,
      found: true,
      refusal: 'the grounding set did not support the headline',
    };
    const published: WireSocNarrative = {
      ...absent,
      found: true,
      published: true,
      headline: 'Sustained C2 beaconing from codex-helper',
      narrative: ['The agent contacted a rare destination on a regular cadence.'],
      cited_evidence: ['leg:net:198.51.100.7'],
      model_ref: 'gemma4',
      input_hash: 'sha512:abc',
    };

    expect(toVerdictNarrative(absent)?.found).toBe(false);
    const refusedView = toVerdictNarrative(refused);
    expect(refusedView?.found).toBe(true);
    expect(refusedView?.published).toBe(false);
    expect(refusedView?.refusal).toContain('did not support');
    const publishedView = toVerdictNarrative(published);
    expect(publishedView?.published).toBe(true);
    expect(publishedView?.refusal).toBeNull();
    expect(publishedView?.headline).toContain('C2 beaconing');
  });

  it('carries a withheld claim with its ruling, reason, and citations', () => {
    // The Model Reasoning pane shows what the model was given and what was thrown away, so the
    // analyst can check the rejection rather than take the pipeline's word for it.
    const narrative: WireSocNarrative = {
      found: true,
      published: true,
      headline: 'h',
      narrative: [],
      impact: [],
      response: [],
      cited_evidence: [],
      needs_human_review: true,
      model_ref: 'gemma4',
      input_hash: 'sha512:abc',
      withheld: [
        {
          section: 'impact',
          text: 'The attacker exfiltrated the customer database.',
          ruling: 'unsupported',
          explanation: 'no evidence leg shows a bulk transfer',
          cited: ['leg:net:198.51.100.7'],
        },
      ],
    };

    const view = toVerdictNarrative(narrative);

    expect(view?.withheld[0]?.ruling).toBe('unsupported');
    expect(view?.withheld[0]?.section).toBe('impact');
    expect(view?.withheld[0]?.cited).toEqual(['leg:net:198.51.100.7']);
    expect(view?.needsHumanReview).toBe(true);
  });

  it('refuses a narrative whose withheld ruling it cannot narrow', () => {
    // `supported` is a real engine ruling, but a supported claim is PUBLISHED, not withheld -- its
    // appearance here would be an engine bug, and rendering it would show the analyst a rejection
    // the pipeline never made.
    const narrative: WireSocNarrative = {
      found: true,
      published: true,
      headline: 'h',
      narrative: [],
      impact: [],
      response: [],
      cited_evidence: [],
      needs_human_review: false,
      model_ref: 'gemma4',
      input_hash: 'sha512:abc',
      withheld: [
        { section: 'impact', text: 't', ruling: 'supported', explanation: 'e', cited: [] },
      ],
    };

    expect(toVerdictNarrative(narrative)).toBeNull();
  });

  it('counts exactly the two states that block a person', () => {
    // The Decision Waiting KPI. `contained` is handled and `automatic` asks nothing of anyone; both
    // must stay out of the count or the tile overstates the queue.
    expect(isWaitingOnAHuman('approval_required')).toBe(true);
    expect(isWaitingOnAHuman('review_required')).toBe(true);
    expect(isWaitingOnAHuman('contained')).toBe(false);
    expect(isWaitingOnAHuman('automatic')).toBe(false);
  });

  it('declares every edge state the engine can emit', () => {
    // If crdb adds a fifth state, this fails and the surface's legend gets updated with it -- rather
    // than the new state silently collapsing every graph that contains one.
    expect([...EDGE_STATES]).toEqual(['observed', 'inferred', 'verified', 'pending']);
  });
});

// -- the evidence-depth narrowers (S3.8c; crdb ED.2-ED.5 + the runner) -------------------------------

import {
  toAuditTrail,
  toBusinessImpact,
  toCognitionRunState,
  toIncidentTelemetry,
} from '../src/index.js';

describe('the evidence-depth narrowers (S3.8c)', () => {
  it('narrows every telemetry vocabulary and preserves unresolvable references', () => {
    const telemetry = toIncidentTelemetry({
      anchor: 'window_unavailable',
      cited_evidence: [
        { entry: 'Network Traffic Content', kind: 'data_component' },
        { entry: 'leg:obs-1', kind: 'leg' },
      ],
      observations: [{ observation_id: 'obs-2', outcome: 'aged_out', observed_at: 0, fields: [] }],
      refused: false,
    });
    expect(telemetry?.anchor).toBe('window_unavailable');
    expect(telemetry?.citedEvidence.map((cited) => cited.kind)).toEqual(['data_component', 'leg']);
    expect(telemetry?.observations[0]?.outcome).toBe('aged_out');
  });

  it('refuses a telemetry payload carrying an unknown kind, outcome, or anchor', () => {
    const base = {
      anchor: 'anchored',
      cited_evidence: [],
      observations: [],
      refused: false,
    };
    expect(
      toIncidentTelemetry({
        ...base,
        cited_evidence: [{ entry: 'x', kind: 'hunch' }],
      }),
    ).toBeNull();
    expect(
      toIncidentTelemetry({
        ...base,
        observations: [{ observation_id: 'o', outcome: 'vanished', observed_at: 0, fields: [] }],
      }),
    ).toBeNull();
    expect(toIncidentTelemetry({ ...base, anchor: 'floating' })).toBeNull();
  });

  it('narrows the audit trail closed on the four recorded acts', () => {
    const trail = toAuditTrail({
      acts: [
        { act: 'contained', principal: 'p-1', at_seconds: 1, detail: 'quarantine aig:agent:x' },
      ],
      refused: false,
    });
    expect(trail?.[0]?.act).toBe('contained');
    expect(
      toAuditTrail({ acts: [{ act: 'observed', principal: 'p', at_seconds: 0 }], refused: false }),
    ).toBeNull();
  });

  it('refuses a published impact sentence with no words in it', () => {
    // The state and the words must agree: "published" with empty text would render an assessment
    // that says nothing while claiming the model stands behind it.
    expect(
      toBusinessImpact({
        band: 'Medium',
        total_milli: 640,
        factors: [],
        sentence_state: 'published',
        sentence: '',
        refused: false,
      }),
    ).toBeNull();
  });

  it('narrows the run acknowledgement closed', () => {
    expect(toCognitionRunState({ state: 'recorded', detail: '' })).toEqual({
      state: 'recorded',
      detail: null,
    });
    expect(toCognitionRunState({ state: 'detonated', detail: '' })).toBeNull();
  });
});
