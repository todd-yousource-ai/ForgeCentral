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
import type {
  SettingsCommitRequest,
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
