// apps/console/src/surfaces/SettingsModelAccessTab.tsx -- the Settings Model access tab
// (IP-FRONTIER-GATEWAY GW.10 over crdb GW.10a, `MODEL_ACCESS_READ` / `AGENT_GRANT_SET`).
//
// One engine read shows the hosted models the platform routes (the frontier catalog, with prices and
// retention), the roles bound to them, every agent's grant as a matrix of models and the governed
// Crucible tools, and what each agent spent per day. Granting or revoking a model is one click on its
// matrix cell (Settings > Model access > the cell: three clicks). The engine does the change itself as
// a read-modify-write of the grant it holds; if the grant changed since this page read it, the engine
// refuses and the page shows what is stored now, so a second operator's change is never overwritten.

import { useState, type ReactElement } from 'react';
import { Badge, DataTable, GlassPanel } from '@forge/design';
import {
  formatMicroUsd,
  formatPerMillion,
  toggleEntry,
  type AgentAccess,
  type AgentGrantOutcome,
  type AgentGrantRow,
  type ModelRow,
} from '@forge/contracts';

import { EmptyState, ErrorState, LoadingState } from '../states/States.js';
import { useAgentGrantChange, useModelAccess } from './useModelAccess.js';

/** The tool grant that opens the governed Crucible tools (GW.R2 / GW.R3) to an agent. */
const CRUCIBLE_TOOLS = 'crucible/*';

/** The spend windows offered, in days. */
const WINDOWS = [7, 30] as const;

const EMPTY_GRANT: AgentGrantRow = {
  models: [],
  tools: [],
  readScopes: [],
  workspaces: [],
  classification: 'internal',
};

function Catalog({ models }: { readonly models: readonly ModelRow[] }): ReactElement {
  return (
    <DataTable<ModelRow>
      caption="Hosted models the platform routes (the frontier catalog)"
      rowKey={(m) => `${m.id}@${m.version}`}
      rows={models}
      empty={<span>The catalog lists no models.</span>}
      columns={[
        { id: 'id', header: 'Model', cell: (m) => <code>{m.id}</code> },
        { id: 'vendor', header: 'Vendor model', cell: (m) => <code>{m.vendorModel}</code> },
        { id: 'dest', header: 'Provider', cell: (m) => m.destination },
        { id: 'surface', header: 'API', cell: (m) => m.surface },
        { id: 'ceiling', header: 'Ceiling', cell: (m) => m.ceiling },
        {
          id: 'state',
          header: 'Version',
          cell: (m) => (
            <>
              {m.pin === 'rolling' ? (
                <Badge variant="caution">Rolling</Badge>
              ) : (
                <Badge>Pinned</Badge>
              )}{' '}
              {m.lifecycle === 'active' ? null : <Badge variant="critical">{m.lifecycle}</Badge>}
            </>
          ),
        },
        {
          id: 'input',
          header: 'Input / cached',
          align: 'end',
          cell: (m) =>
            `${formatPerMillion(m.prices.uncachedInput)} / ${formatPerMillion(m.prices.cacheRead)}`,
        },
        {
          id: 'output',
          header: 'Output',
          align: 'end',
          cell: (m) => formatPerMillion(m.prices.output),
        },
        {
          id: 'retention',
          header: 'Vendor retention',
          cell: (m) =>
            m.zdrEligible
              ? `ZDR eligible (${String(m.retentionDays)} d)`
              : `${String(m.retentionDays)} d`,
        },
      ]}
    />
  );
}

interface MatrixProps {
  readonly agents: readonly AgentAccess[];
  readonly models: readonly ModelRow[];
  readonly onToggle: (agent: string, grant: AgentGrantRow, model: string | null) => void;
  readonly busy: boolean;
}

/** The grant matrix: one row per agent, one checkbox per model plus the Crucible tools. */
function GrantMatrix({ agents, models, onToggle, busy }: MatrixProps): ReactElement {
  const modelIds = [...new Set(models.map((m) => m.id))];
  return (
    <DataTable<AgentAccess>
      caption="Which models and tools each agent may use"
      rowKey={(a) => a.agent}
      rows={agents}
      empty={<span>No agent has a grant or spend yet. Add one below.</span>}
      columns={[
        { id: 'agent', header: 'Agent', cell: (a) => <code>{a.agent}</code> },
        ...modelIds.map((model) => ({
          id: `m:${model}`,
          header: <code>{model}</code>,
          cell: (a: AgentAccess) => {
            const grant = a.grant ?? EMPTY_GRANT;
            return (
              <input
                type="checkbox"
                aria-label={`${model} for ${a.agent}`}
                checked={grant.models.includes(model)}
                disabled={busy}
                onChange={() => onToggle(a.agent, grant, model)}
              />
            );
          },
        })),
        {
          id: 'tools',
          header: 'Engine tools',
          cell: (a: AgentAccess) => {
            const grant = a.grant ?? EMPTY_GRANT;
            return (
              <input
                type="checkbox"
                aria-label={`Engine tools for ${a.agent}`}
                checked={grant.tools.includes(CRUCIBLE_TOOLS)}
                disabled={busy}
                onChange={() => onToggle(a.agent, grant, null)}
              />
            );
          },
        },
      ]}
    />
  );
}

function OutcomeNote({
  outcome,
  agent,
}: {
  readonly outcome: AgentGrantOutcome | null;
  readonly agent: string;
}): ReactElement {
  if (outcome === null) {
    return <ErrorState title={`The engine refused the change for ${agent}`} />;
  }
  if (outcome.kind === 'applied') {
    return (
      <p role="status">
        <Badge variant="good">Saved</Badge> {agent} may now use{' '}
        {outcome.grant.models.length === 0 ? 'no model' : outcome.grant.models.join(', ')}.
      </p>
    );
  }
  return (
    <div role="alert">
      <Badge variant="caution">Changed by someone else</Badge> The grant for <code>{agent}</code>{' '}
      changed since this page read it, so nothing was saved. It now allows{' '}
      {outcome.current === null || outcome.current.models.length === 0
        ? 'no model'
        : outcome.current.models.join(', ')}
      . The matrix shows the current grant; make your change again if it still applies.
    </div>
  );
}

function Spend({ agents }: { readonly agents: readonly AgentAccess[] }): ReactElement {
  const rows = agents.flatMap((a) => a.spend.map((d) => ({ agent: a.agent, ...d })));
  return (
    <DataTable<(typeof rows)[number]>
      caption="Agent spend through the agent door, per UTC day"
      rowKey={(r) => `${r.agent}:${String(r.day)}`}
      rows={rows}
      empty={<span>No agent spent anything through the agent door in this window.</span>}
      columns={[
        { id: 'agent', header: 'Agent', cell: (r) => <code>{r.agent}</code> },
        { id: 'date', header: 'Day (UTC)', cell: (r) => r.date },
        { id: 'calls', header: 'Calls', align: 'end', cell: (r) => r.calls },
        { id: 'in', header: 'Input tokens', align: 'end', cell: (r) => r.inputTokens },
        { id: 'cached', header: 'Cached tokens', align: 'end', cell: (r) => r.cacheReadTokens },
        { id: 'out', header: 'Output tokens', align: 'end', cell: (r) => r.outputTokens },
        { id: 'cost', header: 'Cost', align: 'end', cell: (r) => formatMicroUsd(r.costMicroUsd) },
      ]}
    />
  );
}

export function ModelAccessTab(): ReactElement {
  const [days, setDays] = useState<number>(7);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [draft, setDraft] = useState('');
  const [last, setLast] = useState<{ agent: string; outcome: AgentGrantOutcome | null } | null>(
    null,
  );
  const access = useModelAccess(days);
  const change = useAgentGrantChange();

  if (access.isPending) {
    return <LoadingState label="Reading model access" />;
  }
  if (access.isError) {
    return (
      <ErrorState title="Model access could not be read" onRetry={() => void access.refetch()} />
    );
  }
  const view = access.data;
  if (view === null) {
    return (
      <EmptyState
        title="Global administrator required"
        hint="Model access names every agent's grant and spend, so only a global administrator sees it."
      />
    );
  }
  if (!view.adminPlane) {
    return (
      <EmptyState
        title="The engine runs no administration endpoint"
        hint="Model access is read from the engine's administration plane, which this engine does not run."
      />
    );
  }

  const toggle = (agent: string, grant: AgentGrantRow, model: string | null): void => {
    const models = model === null ? grant.models : toggleEntry(grant.models, model);
    const tools = model === null ? toggleEntry(grant.tools, CRUCIBLE_TOOLS) : grant.tools;
    change.mutate(
      { agent, models, tools, expectedModels: grant.models, expectedTools: grant.tools },
      { onSuccess: (outcome) => setLast({ agent, outcome }) },
    );
  };
  const known = new Set(view.agents.map((a) => a.agent));
  const agents: AgentAccess[] = [
    ...view.agents,
    ...added.filter((a) => !known.has(a)).map((agent) => ({ agent, grant: null, spend: [] })),
  ].sort((a, b) => a.agent.localeCompare(b.agent));

  return (
    <GlassPanel ariaLabel="Model access" header={<span>Model access</span>}>
      <h3>Agent grants</h3>
      <GrantMatrix agents={agents} models={view.models} onToggle={toggle} busy={change.isPending} />
      {view.grantsTruncated ? (
        <p>
          <Badge variant="caution">Partial</Badge> More agents hold grants than one page shows.
        </p>
      ) : null}
      {change.isError ? (
        <ErrorState title="The change could not be sent" onRetry={() => change.reset()} />
      ) : null}
      {last === null ? null : <OutcomeNote outcome={last.outcome} agent={last.agent} />}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = draft.trim();
          if (name !== '') {
            setAdded([...added, name]);
            setDraft('');
          }
        }}
      >
        <label>
          Agent source id{' '}
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={256} />
        </label>{' '}
        <button type="submit" className="fcx-btn">
          Add agent row
        </button>
      </form>

      <h3>Hosted models</h3>
      {view.catalogConfigured ? (
        <Catalog models={view.models} />
      ) : (
        <EmptyState
          title="No frontier catalog is loaded"
          hint="The engine routes no hosted model; agents can be granted only once a catalog is installed."
        />
      )}
      {view.roles.length === 0 ? null : (
        <ul aria-label="SOC roles">
          {view.roles.map((r) => (
            <li key={r.role}>
              <code>{r.role}</code> uses <code>{`${r.model}@${r.version}`}</code>
            </li>
          ))}
        </ul>
      )}

      <h3>Spend</h3>
      <div role="group" aria-label="Spend window">
        {WINDOWS.map((w) => (
          <button
            key={w}
            type="button"
            className="fcx-btn"
            aria-pressed={days === w}
            onClick={() => setDays(w)}
          >
            Last {String(w)} days
          </button>
        ))}
      </div>
      <Spend agents={agents} />
      {view.otherSpend.length === 0 ? null : (
        <DataTable<(typeof view.otherSpend)[number]>
          caption="Other model spend (SOC runs, cognition connections)"
          rowKey={(r) => `${r.session}:${r.model}:${r.principal}`}
          rows={view.otherSpend}
          columns={[
            { id: 'session', header: 'Session', cell: (r) => <code>{r.session}</code> },
            { id: 'model', header: 'Model', cell: (r) => <code>{r.model}</code> },
            { id: 'calls', header: 'Calls', align: 'end', cell: (r) => r.calls },
            {
              id: 'cost',
              header: 'Cost',
              align: 'end',
              cell: (r) => formatMicroUsd(r.costMicroUsd),
            },
          ]}
        />
      )}
      {view.spendTruncated ? (
        <p>
          <Badge variant="caution">Partial</Badge> The window held more calls than one read counts;
          totals are a lower bound. Choose a shorter window.
        </p>
      ) : null}
    </GlassPanel>
  );
}
