// packages/contracts/test/logs.test.ts -- IP-CONSOLE-09 LG.1 tier-1 tests for the Logs contract.
//
// Proves INV-CONSOLE-LOGS-CONTRACT at the type level: a LogRow is a well-typed PROJECTION of a
// `WireDecisionRow` and a LogDetailView of a `WireDecisionDetail`, the query filter maps to the
// `WireLogQuery` fields, and the row omits the not-emitted columns (entity/category/VTZ) rather than
// fabricating them. LG.1 ships the contract only; the DTO -> view-model mapping is the LG.2 resolver.

import { describe, expect, it } from 'vitest';

import { decisionId, principalId } from '../src/index.js';
import type {
  LogDetailView,
  LogPage,
  LogQueryFilter,
  LogRow,
  WireDecisionDetail,
  WireDecisionRow,
  WireLogQuery,
} from '../src/index.js';

describe('a LogRow is a projection of a WireDecisionRow', () => {
  it('builds from the engine DTO with the real row fields only', () => {
    // The row comes from the engine LOG_QUERY read; the LG.2 resolver does this mapping (scaling
    // created_at seconds -> millis, deriving the badge status from the outcome). Here it proves the
    // projection is well-typed against the generated DTO.
    const dto: WireDecisionRow = {
      decision_id: 'sha512:ab',
      rule_id: 'LR-EX-001',
      finding: 'Suspicious command',
      tactics: ['TA0002'],
      technique: 'T1059',
      evidence: ['dc:process_creation'],
      confidence: 'HIGH',
      recommended_action: 'escalate',
      created_at: 1_700_000_000,
    };
    const row: LogRow = {
      decisionId: decisionId(dto.decision_id),
      at: dto.created_at * 1000,
      ruleId: dto.rule_id,
      summary: dto.finding,
      outcome: dto.recommended_action,
      status: 'flagged',
      technique: dto.technique,
      tactics: dto.tactics,
      confidence: dto.confidence,
      evidenceCount: dto.evidence.length,
    };
    expect(row.at).toBe(1_700_000_000_000);
    expect(row.evidenceCount).toBe(1);
    expect(row.technique).toBe('T1059');
  });

  it('renders a not-emitted confidence as empty rather than fabricating a value', () => {
    // A decision whose detector emitted no confidence tier: the cell is empty, never a made-up tier.
    const dto: WireDecisionRow = {
      decision_id: 'sha512:cd',
      rule_id: 'LR-NET-002',
      finding: 'Beaconing',
      tactics: [],
      technique: 'T1071',
      evidence: [],
      confidence: '',
      recommended_action: 'observe-only',
      created_at: 1_700_000_100,
    };
    const row: LogRow = {
      decisionId: decisionId(dto.decision_id),
      at: dto.created_at * 1000,
      ruleId: dto.rule_id,
      summary: dto.finding,
      outcome: dto.recommended_action,
      status: 'pass',
      technique: dto.technique,
      tactics: dto.tactics,
      confidence: dto.confidence,
      evidenceCount: dto.evidence.length,
    };
    expect(row.confidence).toBe('');
    expect(row.evidenceCount).toBe(0);
  });
});

describe('a LogDetailView is a projection of a WireDecisionDetail', () => {
  it('carries the full record and derives the acting entity from a source subject', () => {
    const dto: WireDecisionDetail = {
      decision_id: 'sha512:ab',
      rule_id: 'LR-EX-001',
      finding: 'Suspicious command',
      technique: 'T1059',
      tactics: ['TA0002'],
      evidence: ['dc:process_creation'],
      confidence: 'HIGH',
      recommended_action: 'escalate',
      scope: 'host-7',
      source_hosts: ['host-7'],
      source_subjects: ['host-7:pid:1234'],
      source_context: [],
      source_observations: [],
      correlation_id: 'corr-1',
      replay_as_of: 42,
      watermark_seconds: 100,
      window_seconds: 60,
      replay_digest: 'sha512:rd',
      created_at: 1_700_000_000,
    };
    const detail: LogDetailView = {
      decisionId: decisionId(dto.decision_id),
      at: dto.created_at * 1000,
      ruleId: dto.rule_id,
      finding: dto.finding,
      technique: dto.technique,
      tactics: dto.tactics,
      evidence: dto.evidence,
      confidence: dto.confidence,
      outcome: dto.recommended_action,
      scope: dto.scope,
      sourceHosts: dto.source_hosts,
      sourceSubjects: dto.source_subjects,
      sourceContext: dto.source_context,
      sourceObservations: dto.source_observations,
      correlationId: dto.correlation_id,
      replayAsOf: dto.replay_as_of,
      watermarkSeconds: dto.watermark_seconds,
      windowSeconds: dto.window_seconds,
      replayDigest: dto.replay_digest,
      // The LG.5 drill-in target: a process subject resolves to a principal entity ref.
      actingEntity: { kind: 'principal', id: principalId(dto.source_subjects[0] ?? '') },
    };
    expect(detail.actingEntity).toEqual({ kind: 'principal', id: 'host-7:pid:1234' });
    expect(detail.sourceHosts).toEqual(['host-7']);
    expect(detail.replayAsOf).toBe(42);
  });

  it('has a null acting entity when the decision names no source entity', () => {
    const detail: Pick<LogDetailView, 'decisionId' | 'actingEntity'> = {
      decisionId: decisionId('sha512:none'),
      actingEntity: null,
    };
    // A null acting entity disables the row -> drawer drill-in rather than opening an empty drawer.
    expect(detail.actingEntity).toBeNull();
  });
});

describe('a LogQueryFilter maps to the WireLogQuery fields', () => {
  it('every filter is optional and AND-combined; the engine applies them', () => {
    const filter: LogQueryFilter = {
      since: 1_700_000_000_000,
      until: 1_700_000_100_000,
      technique: 'T1059',
      confidence: 'HIGH',
      limit: 50,
    };
    // The LG.2 resolver converts millis -> seconds and fills the WireLogQuery; here it proves the shape.
    const wire: WireLogQuery = {
      request_id: 1,
      since: Math.floor((filter.since ?? 0) / 1000),
      until: Math.floor((filter.until ?? 0) / 1000),
      technique: filter.technique ?? null,
      confidence: filter.confidence ?? null,
      limit: filter.limit,
    };
    expect(wire.since).toBe(1_700_000_000);
    expect(wire.technique).toBe('T1059');
  });

  it('a LogPage carries newest-first rows', () => {
    const page: LogPage = { rows: [] };
    expect(page.rows).toHaveLength(0);
  });
});
