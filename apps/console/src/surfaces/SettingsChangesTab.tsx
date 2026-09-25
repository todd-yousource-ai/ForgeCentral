// apps/console/src/surfaces/SettingsChangesTab.tsx -- the Settings Changes tab (IP-CONSOLE-11 ST.9 over
// crdb IP-CONSOLE-SETTINGS-WIRE SET.3 / SET.5; INV-SETTINGS-DUAL-CONTROL-HONOURED).
//
// Pending approvals: every config proposal from the Console OR the engine's admin plane (one store),
// with what it changes. Approve is a real engine act, confirm-gated; the engine refuses a
// self-approval, and a proposal the configuration has moved past is refused as stale and discarded.
// The surface shows those refusals as the engine states them and never fakes an approval.
//
// History: the committed versions, newest first, each with who committed it and the keys it changed.
// Rollback restores a version through the engine's governed commit (validation + live apply); under
// dual control the engine records it as a proposal instead, which then appears above.

import { useState, type ReactElement } from 'react';
import { Badge, ConfirmDialog, DataTable, GlassPanel } from '@forge/design';
import {
  approvalRefusalLabel,
  type PendingProposal,
  type SettingsReceipt,
  type SettingsVersionRow,
} from '@forge/contracts';

import { ErrorState, LoadingState } from '../states/States.js';
import { GovernedReceipt } from './SettingsSectionForms.js';
import {
  useApproveProposal,
  useRollback,
  useSettingsApprovals,
  useSettingsHistory,
} from './useSettings.js';
import { TierRequired } from './TierRequired.js';

function when(ms: number | null): string {
  return ms === null ? 'not recorded' : new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

function keys(changed: readonly string[]): ReactElement {
  return changed.length === 0 ? (
    <span>no registry value changed</span>
  ) : (
    <span>
      {changed.map((k, i) => (
        <span key={k}>
          {i > 0 ? ', ' : ''}
          <code>{k}</code>
        </span>
      ))}
    </span>
  );
}

/** An approval's or a rollback's receipt: the approval refusal in words, a proposal, or the commit. */
function ActReceipt({ receipt }: { readonly receipt: SettingsReceipt }): ReactElement {
  if (receipt.approvalRefused !== null) {
    return (
      <div className="fcx-settings__receipt" data-testid="settings-changes-receipt">
        <Badge variant="caution">Refused</Badge> {approvalRefusalLabel(receipt.approvalRefused)}
      </div>
    );
  }
  if (receipt.proposal !== null) {
    return (
      <div className="fcx-settings__receipt" data-testid="settings-changes-receipt">
        <Badge variant="neutral">Proposed</Badge> Tenant-config is under dual control: the rollback
        is proposal {String(receipt.proposal)}, and a different Admin must approve it.
      </div>
    );
  }
  return <GovernedReceipt receipt={receipt} />;
}

function PendingApprovals(): ReactElement {
  const approvals = useSettingsApprovals();
  const approve = useApproveProposal();
  const [confirming, setConfirming] = useState<PendingProposal | null>(null);
  let body: ReactElement;
  if (approvals.isPending) {
    body = <LoadingState label="Reading the pending approvals" />;
  } else if (approvals.isError) {
    body = (
      <ErrorState
        title="The pending approvals could not be read"
        onRetry={() => void approvals.refetch()}
      />
    );
  } else if (approvals.data === null) {
    body = <TierRequired what="pending approvals" />;
  } else {
    body = (
      <DataTable<PendingProposal>
        caption="Configuration proposals awaiting a second Admin"
        columns={[
          { id: 'id', header: 'Proposal', cell: (p) => String(p.proposal) },
          { id: 'proposer', header: 'Proposed by', cell: (p) => <code>{p.proposer}</code> },
          { id: 'at', header: 'When (UTC)', cell: (p) => when(p.proposedAtMs) },
          { id: 'changes', header: 'Changes', cell: (p) => keys(p.changedKeys) },
          {
            id: 'act',
            header: 'Approve',
            cell: (p) =>
              p.stale ? (
                <Badge variant="caution">Stale: the configuration changed since</Badge>
              ) : (
                <button type="button" className="fcx-btn" onClick={() => setConfirming(p)}>
                  Approve {String(p.proposal)}
                </button>
              ),
          },
        ]}
        rows={approvals.data}
        rowKey={(p) => String(p.proposal)}
        empty={<span>No configuration change is awaiting approval.</span>}
      />
    );
  }
  return (
    <GlassPanel ariaLabel="Pending approvals" header={<span>Pending approvals</span>}>
      {body}
      {approve.isPending ? <LoadingState label="Approving" /> : null}
      {approve.isError ? (
        <ErrorState title="The approval could not be sent" onRetry={() => approve.reset()} />
      ) : null}
      {approve.isSuccess ? <ActReceipt receipt={approve.data} /> : null}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === null ? '' : `Approve proposal ${String(confirming.proposal)}?`}
        description={
          confirming === null
            ? ''
            : `Proposed by ${confirming.proposer}; it changes ${
                confirming.changedKeys.join(', ') || 'no registry value'
              }. The engine commits it under both principals. You cannot approve your own proposal.`
        }
        confirmLabel="Approve"
        tone="critical"
        onConfirm={() => {
          if (confirming !== null) approve.mutate(confirming.proposal);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </GlassPanel>
  );
}

function History(): ReactElement {
  const history = useSettingsHistory();
  const rollback = useRollback();
  const [confirming, setConfirming] = useState<SettingsVersionRow | null>(null);
  let body: ReactElement;
  if (history.isPending) {
    body = <LoadingState label="Reading the configuration history" />;
  } else if (history.isError) {
    body = (
      <ErrorState
        title="The configuration history could not be read"
        onRetry={() => void history.refetch()}
      />
    );
  } else if (history.data === null) {
    body = <TierRequired what="the configuration history" />;
  } else {
    const head = history.data.versions[0]?.version;
    body = (
      <>
        <DataTable<SettingsVersionRow>
          caption="Committed configuration versions, newest first"
          columns={[
            { id: 'version', header: 'Version', cell: (v) => String(v.version) },
            {
              id: 'by',
              header: 'Committed by',
              cell: (v) => (v.principal === null ? 'not recorded' : <code>{v.principal}</code>),
            },
            { id: 'at', header: 'When (UTC)', cell: (v) => when(v.atMs) },
            { id: 'changes', header: 'Changes', cell: (v) => keys(v.changedKeys) },
            {
              id: 'act',
              header: 'Rollback',
              cell: (v) =>
                v.version === head ? (
                  <span>current</span>
                ) : (
                  <button type="button" className="fcx-btn" onClick={() => setConfirming(v)}>
                    Roll back to {String(v.version)}
                  </button>
                ),
            },
          ]}
          rows={history.data.versions}
          rowKey={(v) => String(v.version)}
          empty={<span>No configuration has been committed.</span>}
        />
        {history.data.complete ? null : (
          <p className="fcx-settings__hint">
            Older versions exist beyond this page or were reclaimed by the retention window.
          </p>
        )}
      </>
    );
  }
  return (
    <GlassPanel ariaLabel="Configuration history" header={<span>Configuration history</span>}>
      {body}
      {rollback.isPending ? <LoadingState label="Rolling back" /> : null}
      {rollback.isError ? (
        <ErrorState title="The rollback could not be sent" onRetry={() => rollback.reset()} />
      ) : null}
      {rollback.isSuccess ? <ActReceipt receipt={rollback.data} /> : null}
      <ConfirmDialog
        open={confirming !== null}
        title={confirming === null ? '' : `Roll back to version ${String(confirming.version)}?`}
        description="The engine restores that version's whole configuration through its governed commit: it is validated and applied live, and recorded as a rollback under your principal. Under dual control it becomes a proposal a different Admin approves."
        confirmLabel="Roll back"
        tone="critical"
        onConfirm={() => {
          if (confirming !== null) rollback.mutate(confirming.version);
          setConfirming(null);
        }}
        onCancel={() => setConfirming(null)}
      />
    </GlassPanel>
  );
}

/** The Changes tab (ST.9): pending approvals and the configuration history. */
export function ChangesTab(): ReactElement {
  return (
    <>
      <PendingApprovals />
      <History />
    </>
  );
}
