// apps/bff/test/entity-detail.test.ts -- IP-CONSOLE-12 DR.3 the live drawer-detail resolver.

import type {
  EntityRef,
  WireAgentList,
  WireConnectionList,
  WireDecisionList,
  WireQueryRows,
} from '@forge/contracts';
import { principalId } from '@forge/contracts';
import { describe, expect, it } from 'vitest';

import { resolveEntityDetail } from '../src/engine/entity-detail.js';
import type { OperatorEngine } from '../src/engine/operator-engine.js';
import type { OperatorPrincipal } from '../src/engine/principal.js';

const principal: OperatorPrincipal = {
  subject: 'auth0|op',
  tier: 'Admin',
  principalId: 'principal-op',
  tenant: 'tenant-op',
};

/** A mock OperatorEngine returning scripted read results; the reads not exercised here reject. */
function engineWith(parts: {
  agents?: WireAgentList;
  decisions?: WireDecisionList;
  capabilities?: WireQueryRows;
  construction?: WireQueryRows;
  failDirectory?: boolean;
  failCapabilities?: boolean;
}): OperatorEngine {
  const unused = () => Promise.reject(new Error('unused'));
  const noRows: WireQueryRows = { rows: [], cursor: null, redacted_fields: [] };
  return {
    // Route by the read: `construction_report` (CR.4) vs `agent_capabilities` (VR.3).
    querySubmit: (_principal, request) =>
      request.text.includes('construction_report')
        ? Promise.resolve(parts.construction ?? noRows)
        : parts.failCapabilities
          ? Promise.reject(new Error('capabilities down'))
          : Promise.resolve(parts.capabilities ?? noRows),
    cursorFetch: unused,
    cursorClose: unused,
    policyListByZone: unused,
    policyDetail: unused,
    policyEffective: unused,
    socIncidentList: unused,
    detectSummary: unused,
    socPlanApprove: unused,
    socPlanModify: unused,
    socIncidentDetail: unused,
    socNarrative: unused,
    policyCreate: unused,
    policyEdit: unused,
    policyPublish: unused,
    policyDelete: unused,
    // UY.5: the LUG principal directory joined the drawer fan-out; an empty resolve models
    // "reachable, entity not there" (a rejection would honestly degrade header/info to error).
    listPrincipals: () => Promise.resolve({ principals: [] }),
    groupCreate: unused,
    groupEdit: unused,
    groupSetMembers: unused,
    principalCreate: unused,
    principalEdit: unused,
    principalSetStatus: unused,
    listGroups: unused,
    objectList: unused,
    idamConnectors: unused,
    idamSync: unused,
    idamConnect: unused,
    idamConfigure: unused,
    objectCreate: unused,
    objectEdit: unused,
    objectDelete: unused,
    objectDetail: unused,
    listAgents: () =>
      parts.failDirectory
        ? Promise.reject(new Error('engine down'))
        : Promise.resolve(parts.agents ?? { agents: [] }),
    entityDecisions: () => Promise.resolve(parts.decisions ?? { decisions: [] }),
    entityConnections: (): Promise<WireConnectionList> => Promise.resolve({ connections: [] }),
    connectivityGraph: unused,
    connectivityMembers: unused,
    contain: unused,
    logQuery: unused,
    logExplain: unused,
    logExport: unused,
    vtzTree: unused,
    vtzDetail: unused,
    vtzCreate: unused,
    bundleCommit: unused,
    bundleConvergence: unused,
    vtzEdit: unused,
    vtzRescope: unused,
    vtzDelete: unused,
  };
}

/** A `WireQueryRows` from `(relation, target)` pairs, as the `agent_capabilities` relation returns. */
function capabilityRows(pairs: ReadonlyArray<readonly [string, string]>): WireQueryRows {
  return {
    rows: pairs.map(([relation, target]) => [
      ['relation', { Text: relation }],
      ['target', { Text: target }],
    ]),
    cursor: null,
    redacted_fields: [],
  };
}

/** A `WireQueryRows` from `(surface, entry)` pairs, as the `construction_report` relation returns (CR.4). */
function constructionRows(pairs: ReadonlyArray<readonly [string, string]>): WireQueryRows {
  return {
    rows: pairs.map(([surface, entry]) => [
      ['surface', { Text: surface }],
      ['entry', { Text: entry }],
    ]),
    cursor: null,
    redacted_fields: [],
  };
}

const ref: EntityRef = { kind: 'principal', id: principalId('aig:agent:a') };

describe('resolveEntityDetail', () => {
  it('projects the matching agent record into the header + info, and decisions newest-first', async () => {
    const engine = engineWith({
      agents: {
        agents: [
          {
            agent_id: 'aig:agent:a',
            status: 'active',
            enrolled_at: 1_720_600_000,
            attributes: [
              ['role', 'operator'],
              ['clearance', 'secret'],
              ['runtime', 'python'],
            ],
          },
        ],
      },
      decisions: {
        decisions: [
          {
            decision_id: 'sha512:d1',
            rule_id: 'LR-DB-002',
            finding: 'External DB Access',
            tactics: ['TA0002'],
            technique: 'T1071',
            evidence: ['dc:network_connection'],
            confidence: 'high',
            recommended_action: 'deny',
            created_at: 1_720_600_000,
          },
        ],
      },
      capabilities: capabilityRows([
        ['USES_TOOL', 'tool:search'],
        ['DELEGATES_TO', 'agent:sub'],
      ]),
    });

    const detail = await resolveEntityDetail(engine, principal, ref);

    expect(detail.header).toEqual({
      status: 'ok',
      data: { displayName: 'aig:agent:a', kindLabel: 'Agent', status: 'active' },
    });
    expect(detail.info).toEqual({
      status: 'ok',
      data: {
        role: 'operator',
        clearance: 'secret',
        enrolledAt: 1_720_600_000,
        tags: ['runtime=python'],
      },
    });
    // The decision projects newest (created_at seconds -> millis) with a semantic status from its action.
    expect(detail.recentDecisions.status).toBe('ok');
    if (detail.recentDecisions.status === 'ok') {
      const row = detail.recentDecisions.data.decisions[0];
      expect(row?.summary).toBe('External DB Access');
      expect(row?.status).toBe('denied');
      expect(row?.at).toBe(1_720_600_000_000);
    }
    // Capabilities project the AIG edges into the drawer view, labelled by their source + surface.
    expect(detail.capabilities.status).toBe('ok');
    if (detail.capabilities.status === 'ok') {
      expect(detail.capabilities.data).toEqual({
        kind: 'capabilities',
        source: 'aig-graph',
        capabilities: [
          { name: 'tool:search', surface: 'tools' },
          { name: 'agent:sub', surface: 'delegation' },
        ],
      });
    }
    // The remaining cross-repo sections are honest pending, never fabricated.
    expect(detail.zones.status).toBe('pending');
    expect(detail.effectivePolicies.status).toBe('pending');
  });

  it('is empty when the entity is not in the directory, and for no decisions', async () => {
    const detail = await resolveEntityDetail(engineWith({}), principal, ref);
    expect(detail.header.status).toBe('empty');
    expect(detail.info.status).toBe('empty');
    expect(detail.recentDecisions.status).toBe('empty');
    // Capabilities apply only to an agent: a non-directory entity is not-applicable, never empty rows.
    expect(detail.capabilities.status).toBe('not-applicable');
  });

  it('degrades the directory-backed sections to error when LIST_AGENTS fails, not the drawer', async () => {
    const detail = await resolveEntityDetail(engineWith({ failDirectory: true }), principal, ref);
    expect(detail.header.status).toBe('error');
    expect(detail.info.status).toBe('error');
    // The other sections still resolve (tolerant fan-out); capabilities cannot gate without the directory.
    expect(detail.recentDecisions.status).toBe('empty');
    expect(detail.capabilities.status).toBe('error');
  });

  it('empties the capabilities section for an agent that holds no capability edges', async () => {
    const detail = await resolveEntityDetail(
      engineWith({
        agents: {
          agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
        },
      }),
      principal,
      ref,
    );
    expect(detail.capabilities.status).toBe('empty');
  });

  it('degrades capabilities to error when the read fails, without failing the drawer', async () => {
    const detail = await resolveEntityDetail(
      engineWith({
        agents: {
          agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
        },
        failCapabilities: true,
      }),
      principal,
      ref,
    );
    expect(detail.header.status).toBe('ok');
    expect(detail.capabilities.status).toBe('error');
  });

  it('prefers the signed Construction Report surfaces over the AIG edges (CR.4)', async () => {
    const detail = await resolveEntityDetail(
      engineWith({
        agents: {
          agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
        },
        // The AIG edges are present, but the shipped report is the richer source and wins.
        capabilities: capabilityRows([['USES_TOOL', 'tool:search']]),
        construction: constructionRows([
          ['tools', 'read_file'],
          ['models', 'anthropic/claude-opus-4-8'],
          // An Unknown surface carries an empty entry; it is dropped, never rendered as a row.
          ['persistence', ''],
        ]),
      }),
      principal,
      ref,
    );
    expect(detail.capabilities.status).toBe('ok');
    if (detail.capabilities.status === 'ok') {
      expect(detail.capabilities.data).toEqual({
        kind: 'capabilities',
        source: 'construction-report',
        capabilities: [
          { name: 'read_file', surface: 'tools' },
          { name: 'anthropic/claude-opus-4-8', surface: 'models' },
        ],
      });
    }
  });

  it('falls back to the AIG edges when no Construction Report has been shipped (CR.4)', async () => {
    const detail = await resolveEntityDetail(
      engineWith({
        agents: {
          agents: [{ agent_id: 'aig:agent:a', status: 'active', enrolled_at: 1, attributes: [] }],
        },
        capabilities: capabilityRows([['USES_TOOL', 'tool:search']]),
        // construction omitted -> the relation returns no rows -> the AIG source is used, not fabricated.
      }),
      principal,
      ref,
    );
    expect(detail.capabilities.status).toBe('ok');
    if (detail.capabilities.status === 'ok' && detail.capabilities.data.kind === 'capabilities') {
      expect(detail.capabilities.data.source).toBe('aig-graph');
    }
  });
});
