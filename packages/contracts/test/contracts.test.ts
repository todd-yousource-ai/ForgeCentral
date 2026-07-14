// packages/contracts/test/contracts.test.ts -- F0.1 tier-1 tests for @forge/contracts.
//
// Proves INV-CONSOLE-CONTRACTS-SINGLE-SOURCE: the engine DTO types have exactly one source (the vendored
// schema, via the generator), enforced by a codegen round-trip drift gate; the branded ids are nominally
// distinct; and the hand-authored surfaces (errors/bindings) compose the generated types rather than
// re-declaring them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderWireDtoTypes } from '../scripts/generate.mjs';
import {
  WIRE_DTO_SCHEMA_ID,
  bindingId,
  decisionId,
  isPending,
  principalId,
  requestId,
  tenantId,
  toOverviewGraph,
  toRiskLevel,
} from '../src/index.js';
import type {
  Binding,
  ConsoleError,
  DecisionId,
  OverviewGraph,
  ReadBinding,
  TenantId,
  WireConnectivityGraph,
  WireReply,
  WireStreamEvent,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'schema', 'wire-dto.schema.json');
const generatedPath = join(here, '..', 'src', 'generated', 'wire-dto.ts');

describe('wire DTO codegen (drift gate)', () => {
  it('the committed generated file equals the emitter output', () => {
    const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
    const committed = readFileSync(generatedPath, 'utf8');
    // If a wire DTO changes without regenerating, this fails -- the same drift discipline crdb applies.
    expect(renderWireDtoTypes(schema)).toBe(committed);
  });

  it('the vendored schema carries exactly the pinned contract version', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { $id?: string };
    expect(schema.$id).toBe(WIRE_DTO_SCHEMA_ID);
  });
});

describe('generated engine types are usable', () => {
  it('a decision delta event conforms to the generated shape', () => {
    const event: WireStreamEvent = {
      watermark: 40167,
      delta: {
        Decision: {
          decision_id: 'sha512:ab',
          rule_id: 'LR-C2-001',
          anchor: 'T1071',
          tactics: ['TA0011'],
          finding: 'Application Layer Protocol',
          source_subjects: ['host-1:pid:42'],
          confidence: 'Candidate',
          recommended_action: 'Observe',
          scope: 'tenant',
        },
      },
    };
    expect('Decision' in event.delta).toBe(true);
  });

  it('an externally-tagged reply narrows by its single key', () => {
    const reply: WireReply = { QueryRows: { rows: [], redacted_fields: [], cursor: null } };
    // Exhaustive narrowing on the tagged union (a compile + runtime check).
    const affected = 'QueryRows' in reply ? reply.QueryRows.rows.length : -1;
    expect(affected).toBe(0);
  });

  it('a unit-variant reply is the bare string literal', () => {
    const reply: WireReply = 'CursorClosed';
    expect(reply).toBe('CursorClosed');
  });
});

describe('branded ids are nominally distinct', () => {
  it('tag helpers round-trip the raw string at runtime', () => {
    expect(principalId('p-1')).toBe('p-1');
    expect(tenantId('t-1')).toBe('t-1');
    expect(decisionId('d-1')).toBe('d-1');
  });

  it('a PrincipalId is not assignable to a TenantId (compile-time)', () => {
    const p = principalId('p-1');
    // @ts-expect-error PrincipalId and TenantId are distinct brands; cross-assignment is refused.
    const t: TenantId = p;
    expect(t).toBe('p-1');
  });

  it('a raw string is not assignable to a branded id (compile-time)', () => {
    // @ts-expect-error a bare string cannot stand in for a DecisionId without the tag constructor.
    const d: DecisionId = 'not-tagged';
    expect(d).toBe('not-tagged');
  });
});

describe('error taxonomy composes the generated wire class', () => {
  it('a ConsoleError carries the engine code, wire class, retry, and correlation', () => {
    const err: ConsoleError = {
      code: 'PolicyError',
      wireClass: 'Denied',
      retry: 'Never',
      message: 'access denied',
      requestId: requestId('req-9'),
    };
    expect(err.code).toBe('PolicyError');
    expect(err.wireClass).toBe('Denied');
  });
});

describe('binding manifest shape', () => {
  it('a live read binding is not pending', () => {
    const b: ReadBinding = {
      id: bindingId('overview.graph.read'),
      kind: 'read',
      surface: 'cruciblql',
      op: 'overview_graph_v1',
      viewModel: 'OverviewGraph',
      status: { kind: 'live' },
    };
    expect(isPending(b)).toBe(false);
  });

  it('a pending binding names its gating engine task and reads as pending', () => {
    const b: Binding = {
      id: bindingId('vtz.isolate.command'),
      kind: 'command',
      surface: 'torch',
      op: 'vtz_isolate',
      authz: 'admin:contain',
      audited: true,
      status: {
        kind: 'pending',
        owningRepo: 'torch',
        gatingTask: 'CONSOLE-02 VTZ isolate command',
      },
    };
    expect(isPending(b)).toBe(true);
  });
});

describe('IP-CONSOLE-01 O1.1: the Overview graph view model projects the connectivity DTO', () => {
  it('projects a WireConnectivityGraph to the camelCase OverviewGraph (the cross-module guard)', () => {
    // A drifted wire field would fail this projection at COMPILE time (the DTO is the generated type).
    const wire: WireConnectivityGraph = {
      sources: [
        { class: 'devices', count: 3 },
        { class: 'agents', count: 1 },
      ],
      destinations: [
        { class: 'network', count: 2 },
        { class: 'saas', count: 1 },
      ],
      edges: [{ source_class: 'devices', dest_class: 'network', weight: 2 }],
      risk: { level: 'yellow', escalate: 0, candidate: 1, observe: 4 },
    };
    const view: OverviewGraph | null = toOverviewGraph(wire);
    expect(view).not.toBeNull();
    expect(view?.sources).toEqual([
      { class: 'devices', count: 3 },
      { class: 'agents', count: 1 },
    ]);
    expect(view?.edges).toEqual([{ sourceClass: 'devices', destClass: 'network', weight: 2 }]);
    expect(view?.risk).toEqual({ level: 'yellow', escalate: 0, candidate: 1, observe: 4 });
  });

  it('renders an empty tenant as an empty, green graph (INV-CONSOLE-NO-STUB: no fabricated node)', () => {
    const empty: WireConnectivityGraph = {
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
    };
    const view = toOverviewGraph(empty);
    expect(view).toEqual({
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'green', escalate: 0, candidate: 0, observe: 0 },
    });
  });

  it('narrows the engine risk-level tag and fails closed on an unknown tag', () => {
    expect(toRiskLevel('red')).toBe('red');
    expect(toRiskLevel('green')).toBe('green');
    expect(toRiskLevel('chartreuse')).toBeNull();
    // An unknown level fails the whole projection closed (the resolver maps null to the unavailable state).
    const bad: WireConnectivityGraph = {
      sources: [],
      destinations: [],
      edges: [],
      risk: { level: 'chartreuse', escalate: 0, candidate: 0, observe: 0 },
    };
    expect(toOverviewGraph(bad)).toBeNull();
  });
});
