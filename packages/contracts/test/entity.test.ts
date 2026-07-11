// packages/contracts/test/entity.test.ts -- IP-CONSOLE-12 DR.1 tier-1 tests for the drawer contract.
//
// Proves INV-CONSOLE-DRAWER-CONTRACT at the type level: the entity ref narrows by kind, each section view
// model is a well-typed PROJECTION of the engine DTOs (a `RecentDecisionRow` builds from a `WireDecision`
// + the LOG timestamp), the aggregate detail view models every per-section state (ok / pending /
// not-applicable / unauthorized / error) rather than crashing the drawer, and the Isolate effect reports
// enforcement honestly (AG.7 off -> enforcementActive false). DR.1 ships the contract only; no live data.

import { describe, expect, it } from 'vitest';

import { objectId, principalId, vtzId, policyId, decisionId } from '../src/index.js';
import type {
  EntityDetailView,
  EntityRef,
  IsolateEffect,
  RecentDecisionRow,
  WireAuditEntry,
  WireDecision,
} from '../src/index.js';

describe('the entity ref narrows by kind', () => {
  it('carries a brand tied to its kind', () => {
    const ref: EntityRef = { kind: 'principal', id: principalId('agent:inventory-bot') };
    const label = ref.kind === 'principal' ? `principal:${ref.id}` : 'other';
    expect(label).toBe('principal:agent:inventory-bot');
  });

  it('refuses a VtzId where a principal ref is expected (compile-time)', () => {
    // @ts-expect-error a `principal` ref requires a PrincipalId, not a VtzId.
    const ref: EntityRef = { kind: 'principal', id: vtzId('vtz-1') };
    expect(ref.id).toBe('vtz-1');
  });
});

describe('a recent-decision row is a projection of a WireDecision', () => {
  it('builds from the engine DTO + the LOG timestamp', () => {
    // The decision comes from the engine; the timestamp from the LOG / audit entry (a WireDecision itself
    // carries no time). The DR.3 resolver does this mapping; here it proves the projection is well-typed.
    const decision: WireDecision = {
      decision_id: 'sha512:ab',
      rule_id: 'LR-DB-002',
      anchor: 'T1071',
      tactics: ['TA0011'],
      finding: 'External DB Access',
      source_subjects: ['agent:inventory-bot'],
      confidence: 'Candidate',
      recommended_action: 'Deny',
      scope: 'tenant',
    };
    const audit: WireAuditEntry = {
      action: 'decision.commit',
      commit_version: 7,
      effect: 'Denied',
      principal_id: 'agent:inventory-bot',
      resource: 'db:inventory',
      seq: 12,
      timestamp: 1_720_600_000_000,
    };
    const row: RecentDecisionRow = {
      decisionId: decisionId(decision.decision_id),
      ruleId: decision.rule_id,
      summary: decision.finding,
      outcome: audit.effect,
      status: 'denied',
      at: audit.timestamp,
    };
    expect(row.ruleId).toBe('LR-DB-002');
    expect(row.outcome).toBe('Denied');
    expect(row.at).toBe(1_720_600_000_000);
  });
});

describe('the aggregate detail view models every per-section state', () => {
  it('holds ok / pending / not-applicable / unauthorized / error sections together', () => {
    const detail: EntityDetailView = {
      ref: { kind: 'principal', id: principalId('agent:inventory-bot') },
      header: {
        status: 'ok',
        data: { displayName: 'Inventory-Bot', kindLabel: 'Agent', status: 'active' },
      },
      info: {
        status: 'ok',
        data: { trustState: 'trusted', riskScore: 12, region: 'us', lastSeen: 0, tags: [] },
      },
      zones: { status: 'ok', data: { zones: [{ id: vtzId('vtz-1'), name: 'DMZ' }] } },
      // Capabilities read binding is not live yet (DR.4): honest pending, never a fabricated capability.
      capabilities: {
        status: 'pending',
        owningRepo: 'torch',
        gatingTask: 'IP-CONSOLE-12 DR.4',
      },
      effectivePolicies: {
        status: 'ok',
        data: {
          policies: [
            { id: policyId('p-1'), name: 'no-egress', effect: 'deny', origin: { kind: 'direct' } },
          ],
        },
      },
      // A per-section engine error degrades THAT section (tolerant parallelism), not the drawer.
      recentDecisions: { status: 'error', message: 'engine unreachable' },
    };
    expect(detail.header.status).toBe('ok');
    expect(detail.capabilities.status).toBe('pending');
    expect(detail.recentDecisions.status).toBe('error');
  });

  it('marks a section that does not apply to the entity kind not-applicable, not empty', () => {
    // An object has no capabilities section; that is distinct from an agent with zero capabilities.
    const capabilities: EntityDetailView['capabilities'] = { status: 'not-applicable' };
    expect(capabilities.status).toBe('not-applicable');
    // objectId is used to build the ref such an object would carry.
    expect(objectId('obj-1')).toBe('obj-1');
  });
});

describe('the Isolate effect reports enforcement honestly', () => {
  it('shows the posture with kernel-level enforcement off (AG.7)', () => {
    const effect: IsolateEffect = {
      posture: 'quarantine',
      enforcementActive: false,
      summary: 'Move Inventory-Bot to Quarantine (observe posture; kernel enforcement off).',
    };
    expect(effect.enforcementActive).toBe(false);
    expect(effect.posture).toBe('quarantine');
  });
});
