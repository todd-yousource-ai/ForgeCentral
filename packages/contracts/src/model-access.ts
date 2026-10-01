// packages/contracts/src/model-access.ts -- the Console's model-access view (IP-FRONTIER-GATEWAY GW.10
// over crdb GW.10a, `MODEL_ACCESS_READ` / `AGENT_GRANT_SET`).
//
// One engine round trip carries the frontier catalog, the tenant's agent grants and its spend in a
// window; this module shapes it for the page. Spend charged through the agent door is recorded under
// the budget session `agent-door:<agent>:d<epoch-day>`, so it is grouped back per agent per day;
// every other session (a SOC run, a cognition connection) is listed as it stands. The narrowers fail
// closed: an unknown classification tag refuses the whole view rather than guessing a ceiling.
//
// Grant edits are made by the NODE (read-modify-write): the page sends the models and tools it wants
// together with the models and tools it saw, and a stale write comes back as a conflict carrying what
// is stored now.

import { CLASSIFICATION_TAGS, type ClassificationTag } from './soc.js';
import type {
  WireAgentGrant,
  WireAgentGrantReceipt,
  WireModelAccess,
} from './generated/wire-dto.js';

/** Token prices in micro-USD per million tokens (TRD-08 Amendment #1: integers, never floats). */
export interface ModelPrices {
  readonly uncachedInput: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly output: number;
}

/** One catalogued hosted model. */
export interface ModelRow {
  readonly id: string;
  readonly version: string;
  readonly vendorModel: string;
  readonly destination: string;
  readonly surface: string;
  readonly pin: string;
  readonly lifecycle: string;
  readonly ceiling: ClassificationTag;
  readonly region: string;
  readonly contextWindow: number;
  readonly maxOutputTokens: number;
  readonly prices: ModelPrices;
  readonly zdrEligible: boolean;
  readonly retentionDays: number;
}

/** A role the catalog binds to a model (e.g. `soc.researcher`). */
export interface ModelRoleRow {
  readonly role: string;
  readonly model: string;
  readonly version: string;
}

/** An agent's recorded grant. */
export interface AgentGrantRow {
  readonly models: readonly string[];
  readonly tools: readonly string[];
  readonly readScopes: readonly string[];
  readonly workspaces: readonly string[];
  readonly classification: ClassificationTag;
}

/** One agent's spend on one UTC day. */
export interface AgentDaySpend {
  /** Days since the unix epoch (UTC). */
  readonly day: number;
  /** The day as `YYYY-MM-DD`. */
  readonly date: string;
  readonly calls: number;
  readonly costMicroUsd: number;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
}

/** One agent on the page: its grant (null when none is recorded) and its spend, newest day first. */
export interface AgentAccess {
  readonly agent: string;
  readonly grant: AgentGrantRow | null;
  readonly spend: readonly AgentDaySpend[];
}

/** Spend charged under a session that is not an agent-door session (SOC run, cognition connection). */
export interface OtherSpendRow {
  readonly session: string;
  readonly principal: string;
  readonly model: string;
  readonly calls: number;
  readonly costMicroUsd: number;
}

/** The model-access page. */
export interface ModelAccessView {
  /** False when the node runs no admin plane: nothing exists to show (never read as "none"). */
  readonly adminPlane: boolean;
  readonly catalogConfigured: boolean;
  readonly catalogVersion: number;
  readonly models: readonly ModelRow[];
  readonly roles: readonly ModelRoleRow[];
  /** Every agent with a grant or with spend in the window, by name. */
  readonly agents: readonly AgentAccess[];
  readonly otherSpend: readonly OtherSpendRow[];
  readonly grantsTruncated: boolean;
  readonly spendTruncated: boolean;
}

const AGENT_DOOR_SESSION = /^agent-door:(.+):d(\d+)$/;

/** Read an agent-door budget session (`agent-door:<agent>:d<epoch-day>`); null for any other. */
export function parseAgentDoorSession(session: string): { agent: string; day: number } | null {
  const match = AGENT_DOOR_SESSION.exec(session);
  const agent = match?.[1];
  const day = match?.[2];
  if (agent === undefined || day === undefined) {
    return null;
  }
  return { agent, day: Number.parseInt(day, 10) };
}

const DAY_MS = 86_400_000;

/** An epoch day as `YYYY-MM-DD` (UTC). */
export function epochDayDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** A price in micro-USD per million tokens as `$x.xx/M` (sub-cent prices keep four places). */
export function formatPerMillion(microUsdPerMillion: number): string {
  const usd = microUsdPerMillion / 1_000_000;
  return `$${usd.toFixed(usd > 0 && usd < 0.01 ? 4 : 2)}/M`;
}

/** A cost in micro-USD as dollars (four places, so a single small call is not shown as $0.00). */
export function formatMicroUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

function classification(tag: string): ClassificationTag | null {
  return (CLASSIFICATION_TAGS as readonly string[]).includes(tag)
    ? (tag as ClassificationTag)
    : null;
}

/** Project one wire grant; null for an unknown classification tag (fail closed). */
export function toAgentGrantRow(wire: WireAgentGrant): AgentGrantRow | null {
  const tag = classification(wire.class);
  if (tag === null) {
    return null;
  }
  return {
    models: [...wire.models],
    tools: [...wire.tools],
    readScopes: [...wire.read_scopes],
    workspaces: [...wire.workspaces],
    classification: tag,
  };
}

/** Project the `MODEL_ACCESS_READ` reply; null for the engine's refusal or an unknown tag. */
export function toModelAccessView(wire: WireModelAccess): ModelAccessView | null {
  if (wire.refused) {
    return null;
  }
  const models: ModelRow[] = [];
  for (const m of wire.models) {
    const ceiling = classification(m.ceiling);
    if (ceiling === null) {
      return null;
    }
    models.push({
      id: m.id,
      version: m.version,
      vendorModel: m.vendor_model,
      destination: m.destination,
      surface: m.surface,
      pin: m.pin,
      lifecycle: m.lifecycle,
      ceiling,
      region: m.region,
      contextWindow: m.context_window,
      maxOutputTokens: m.max_output_tokens,
      prices: {
        uncachedInput: m.price_uncached_input,
        cacheRead: m.price_cache_read,
        cacheWrite: m.price_cache_write,
        output: m.price_output,
      },
      zdrEligible: m.zdr_eligible,
      retentionDays: m.retention_days,
    });
  }
  const grants = new Map<string, AgentGrantRow>();
  for (const g of wire.grants) {
    const row = toAgentGrantRow(g);
    if (row === null) {
      return null;
    }
    grants.set(g.agent, row);
  }
  const spend = new Map<string, Map<number, AgentDaySpend>>();
  const otherSpend: OtherSpendRow[] = [];
  for (const row of wire.spend) {
    const door = parseAgentDoorSession(row.session);
    if (door === null) {
      otherSpend.push({
        session: row.session,
        principal: row.principal,
        model: row.model,
        calls: row.calls,
        costMicroUsd: row.cost_micro_usd,
      });
      continue;
    }
    const days = spend.get(door.agent) ?? new Map<number, AgentDaySpend>();
    const prior = days.get(door.day);
    days.set(door.day, {
      day: door.day,
      date: epochDayDate(door.day),
      calls: (prior?.calls ?? 0) + row.calls,
      costMicroUsd: (prior?.costMicroUsd ?? 0) + row.cost_micro_usd,
      inputTokens: (prior?.inputTokens ?? 0) + row.uncached_input + row.cache_write,
      cacheReadTokens: (prior?.cacheReadTokens ?? 0) + row.cache_read,
      outputTokens: (prior?.outputTokens ?? 0) + row.output,
    });
    spend.set(door.agent, days);
  }
  const names = [...new Set([...grants.keys(), ...spend.keys()])].sort();
  return {
    adminPlane: wire.admin_plane,
    catalogConfigured: wire.catalog_configured,
    catalogVersion: wire.catalog_version,
    models,
    roles: wire.roles.map((r) => ({ role: r.role, model: r.model, version: r.version })),
    agents: names.map((agent) => ({
      agent,
      grant: grants.get(agent) ?? null,
      spend: [...(spend.get(agent)?.values() ?? [])].sort((a, b) => b.day - a.day),
    })),
    otherSpend,
    grantsTruncated: wire.grants_truncated,
    spendTruncated: wire.spend_truncated,
  };
}

/** The most entries a grant change may name per list (a page edits one toggle at a time). */
const MAX_GRANT_ENTRIES = 256;
/** The longest model, tool or agent name accepted. */
const MAX_NAME_LENGTH = 256;

/** A grant change the page asks for: what it wants, and what it saw (the node checks the latter). */
export interface AgentGrantChange {
  readonly agent: string;
  readonly models: readonly string[];
  readonly tools: readonly string[];
  readonly expectedModels: readonly string[];
  readonly expectedTools: readonly string[];
}

function names(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_GRANT_ENTRIES) {
    return null;
  }
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '' || item.length > MAX_NAME_LENGTH) {
      return null;
    }
    out.push(item);
  }
  return out;
}

/** Validate a grant-change request body; null (a 400) for any malformed field. */
export function toAgentGrantChange(body: unknown): AgentGrantChange | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  const agent = record['agent'];
  if (typeof agent !== 'string' || agent.trim() === '' || agent.length > MAX_NAME_LENGTH) {
    return null;
  }
  const models = names(record['models']);
  const tools = names(record['tools']);
  const expectedModels = names(record['expectedModels']);
  const expectedTools = names(record['expectedTools']);
  if (models === null || tools === null || expectedModels === null || expectedTools === null) {
    return null;
  }
  return { agent, models, tools, expectedModels, expectedTools };
}

/** `list` with `entry` added or removed, sorted (the node stores grants sorted). */
export function toggleEntry(list: readonly string[], entry: string): string[] {
  const next = list.includes(entry) ? list.filter((e) => e !== entry) : [...list, entry];
  return next.sort();
}

/** What a grant change did. */
export type AgentGrantOutcome =
  | { readonly kind: 'applied'; readonly grant: AgentGrantRow }
  | { readonly kind: 'conflict'; readonly current: AgentGrantRow | null };

/** Project the `AGENT_GRANT_SET` reply; null for the engine's refusal (or an unknown tag). */
export function toAgentGrantOutcome(wire: WireAgentGrantReceipt): AgentGrantOutcome | null {
  if (wire.refused) {
    return null;
  }
  if (wire.conflict) {
    if (wire.current === undefined) {
      return { kind: 'conflict', current: null };
    }
    const current = toAgentGrantRow(wire.current);
    return current === null ? null : { kind: 'conflict', current };
  }
  if (wire.grant === undefined) {
    return null;
  }
  const grant = toAgentGrantRow(wire.grant);
  return grant === null ? null : { kind: 'applied', grant };
}
