// apps/console/src/surfaces/useSettings.ts -- the Settings tab's SOC reads + commit (IP-CONSOLE-11
// S3.18 over crdb IP-AISOC-STEP1 C.9c, INV-SOC-SETTINGS-GOVERNED).
//
// The engine gates both by tier (Admin / SecurityAudit read; Admin commit) and validates a commit by
// the same rules its admin plane applies; the BFF projects and fails closed. A commit's reply is a
// RECEIPT: a validation or dual-control refusal carries the engine's own violations, and the form
// shows them verbatim. Nothing is cached, so a read after a commit shows what was committed.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toConsoleRbacView } from '@forge/contracts';
import type {
  AdminSessionKx,
  ConsoleRbacView,
  PendingProposal,
  SettingsHistoryView,
  SettingsProposalReceipt,
  SettingsCommitRequest,
  SettingsReportName,
  SettingsReportsView,
  SettingsReceipt,
  SettingsView,
  SocSettings,
  SocSettingsPatch,
  SocSettingsReceipt,
} from '@forge/contracts';

/** A 403 is the engine's tier refusal and resolves to `null`; the surface says what tier is needed. */
export async function fetchSocSettings(): Promise<SocSettings | null> {
  const res = await fetch('/api/settings/soc', { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`soc settings failed: ${String(res.status)}`);
  }
  return (await res.json()) as SocSettings;
}

export function useSocSettings(): UseQueryResult<SocSettings | null> {
  return useQuery({ queryKey: ['settings', 'soc'], queryFn: fetchSocSettings, staleTime: 0 });
}

/** POST the patch; a non-2xx is an error, a 200 is the engine's receipt (accepted OR refused). */
export async function postSocSettings(patch: SocSettingsPatch): Promise<SocSettingsReceipt> {
  const res = await fetch('/api/settings/soc', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`soc settings commit failed: ${String(res.status)}`);
  }
  return (await res.json()) as SocSettingsReceipt;
}

export function useCommitSocSettings(): UseMutationResult<
  SocSettingsReceipt,
  Error,
  SocSettingsPatch
> {
  const client = useQueryClient();
  return useMutation<SocSettingsReceipt, Error, SocSettingsPatch>({
    mutationFn: postSocSettings,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settings', 'soc'] });
    },
  });
}

/**
 * Fetch the governed settings (crdb SET.1, `SETTINGS_READ`; IP-CONSOLE-11 ST.1): every setting of the
 * node with the engine's own rendering of its committed value. A 403 is the engine's tier refusal.
 */
export async function fetchGovernedSettings(): Promise<SettingsView | null> {
  const res = await fetch('/api/settings', { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`settings failed: ${String(res.status)}`);
  }
  return (await res.json()) as SettingsView;
}

/** The Configuration tab's read; only fetched while the tab is open. */
export function useGovernedSettings(enabled: boolean): UseQueryResult<SettingsView | null> {
  return useQuery({
    queryKey: ['settings', 'governed'],
    queryFn: fetchGovernedSettings,
    staleTime: 0,
    enabled,
  });
}

/** POST a batch of knob edits; a 200 is the engine's receipt (committed OR refused with causes). */
export async function postGovernedSettings(
  request: SettingsCommitRequest,
): Promise<SettingsReceipt> {
  const res = await fetch('/api/settings', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`settings commit failed: ${String(res.status)}`);
  }
  return (await res.json()) as SettingsReceipt;
}

/** The Configuration tab's commit; a success re-reads the governed settings. */
export function useCommitGovernedSettings(): UseMutationResult<
  SettingsReceipt,
  Error,
  SettingsCommitRequest
> {
  const client = useQueryClient();
  return useMutation<SettingsReceipt, Error, SettingsCommitRequest>({
    mutationFn: postGovernedSettings,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settings', 'governed'] });
    },
  });
}

/**
 * The Console's own role map (IP-CONSOLE-11 ST.3, `GET /api/settings/console-rbac`). A 403 means the
 * operator is not a global admin and resolves to `null`; a body this build cannot narrow is an error.
 */
export async function fetchConsoleRbac(): Promise<ConsoleRbacView | null> {
  const res = await fetch('/api/settings/console-rbac', { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`console rbac failed: ${String(res.status)}`);
  }
  const view = toConsoleRbacView(await res.json());
  if (view === null) {
    throw new Error('console rbac: unrecognized shape');
  }
  return view;
}

export function useConsoleRbac(): UseQueryResult<ConsoleRbacView | null> {
  return useQuery({
    queryKey: ['settings', 'console-rbac'],
    queryFn: fetchConsoleRbac,
    staleTime: 0,
  });
}

/**
 * Fetch the admin plane's status reports by name (crdb SET.4, `GET /api/settings/reports`). A 403 is
 * the engine's tier refusal and resolves to `null`.
 */
export async function fetchSettingsReports(
  names: readonly SettingsReportName[],
): Promise<SettingsReportsView | null> {
  const res = await fetch(`/api/settings/reports?names=${names.join(',')}`, {
    credentials: 'include',
  });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`settings reports failed: ${String(res.status)}`);
  }
  return (await res.json()) as SettingsReportsView;
}

/** One tab's reports; each tab asks only for what it shows (the security report verifies the chain). */
export function useSettingsReports(
  names: readonly SettingsReportName[],
): UseQueryResult<SettingsReportsView | null> {
  return useQuery({
    queryKey: ['settings', 'reports', names.join(',')],
    queryFn: () => fetchSettingsReports(names),
    staleTime: 0,
  });
}

/** The key exchange this operator's admin session negotiated (ST.5b, `GET /api/settings/security-session`). */
export async function fetchSecuritySession(): Promise<AdminSessionKx> {
  const res = await fetch('/api/settings/security-session', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`security session failed: ${String(res.status)}`);
  }
  return (await res.json()) as AdminSessionKx;
}

export function useSecuritySession(): UseQueryResult<AdminSessionKx> {
  return useQuery({
    queryKey: ['settings', 'security-session'],
    queryFn: fetchSecuritySession,
    staleTime: 0,
  });
}

/** POST a JSON body to a settings route; a non-2xx is an error, a 200 is the engine's receipt. */
async function postSettings<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

/** What a governed change produced: a commit receipt, or (under dual control) a proposal receipt. */
export type GovernedChangeResult =
  | { readonly kind: 'commit'; readonly receipt: SettingsReceipt }
  | { readonly kind: 'proposal'; readonly receipt: SettingsProposalReceipt };

/**
 * One change path for the Configuration tab (IP-CONSOLE-11 ST.9): a direct commit, or under dual
 * control a PROPOSAL a different Admin approves (crdb SET.3). Either re-reads what it touches.
 */
export function useGovernedChange(
  propose: boolean,
): UseMutationResult<GovernedChangeResult, Error, SettingsCommitRequest> {
  const client = useQueryClient();
  return useMutation<GovernedChangeResult, Error, SettingsCommitRequest>({
    mutationFn: async (request) =>
      propose
        ? {
            kind: 'proposal',
            receipt: await postSettings<SettingsProposalReceipt>('/api/settings/propose', request),
          }
        : { kind: 'commit', receipt: await postGovernedSettings(request) },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** The pending config proposals from either plane (crdb SET.3); a 403 is the tier refusal. */
export async function fetchApprovals(): Promise<readonly PendingProposal[] | null> {
  const res = await fetch('/api/settings/approvals', { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`approvals failed: ${String(res.status)}`);
  }
  return ((await res.json()) as { proposals: readonly PendingProposal[] }).proposals;
}

export function useSettingsApprovals(): UseQueryResult<readonly PendingProposal[] | null> {
  return useQuery({ queryKey: ['settings', 'approvals'], queryFn: fetchApprovals, staleTime: 0 });
}

/** Approve a proposal as the signed-in Admin; the receipt carries the engine's reason if refused. */
export function useApproveProposal(): UseMutationResult<SettingsReceipt, Error, number> {
  const client = useQueryClient();
  return useMutation<SettingsReceipt, Error, number>({
    mutationFn: (proposal) =>
      postSettings<SettingsReceipt>(`/api/settings/approvals/${String(proposal)}/approve`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

/** The configuration history, newest first (crdb SET.5); a 403 is the tier refusal. */
export async function fetchHistory(): Promise<SettingsHistoryView | null> {
  const res = await fetch('/api/settings/history?limit=50', { credentials: 'include' });
  if (res.status === 403) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`history failed: ${String(res.status)}`);
  }
  return (await res.json()) as SettingsHistoryView;
}

export function useSettingsHistory(): UseQueryResult<SettingsHistoryView | null> {
  return useQuery({ queryKey: ['settings', 'history'], queryFn: fetchHistory, staleTime: 0 });
}

/** Restore a configuration version (crdb SET.5); under dual control the receipt is a proposal. */
export function useRollback(): UseMutationResult<SettingsReceipt, Error, number> {
  const client = useQueryClient();
  return useMutation<SettingsReceipt, Error, number>({
    mutationFn: (to) => postSettings<SettingsReceipt>('/api/settings/rollback', { to }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
