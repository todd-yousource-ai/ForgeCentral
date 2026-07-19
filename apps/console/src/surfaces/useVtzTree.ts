// apps/console/src/surfaces/useVtzTree.ts -- the Virtual Trust Zones read hooks (IP-CONSOLE-02 V2.4).
//
// Reads the tenant's zone tree and one zone's configuration from the BFF (GET /api/vtz/tree,
// GET /api/vtz/detail), which brokers them to the crdb VTZ system of record (VTZ_TREE / VTZ_DETAIL over
// :7878). The engine owns the zones, their own + effective postures, and the sub-zone counts; the BFF
// projects and fails closed on an unknown tag; these hooks only carry the result, so nothing on the
// surface is fabricated (INV-CONSOLE-VTZ-REAL). Same-origin with the session cookie; the SPA never holds a
// token. TanStack Query owns caching + the loading/error states.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OverviewSankey, VtzDetailView, VtzTree } from '@forge/contracts';

import { fetchOverview } from './useOverview.js';

// TUNE(IP-CONSOLE-02 V2.4): the zone-tree request bound. The BFF clamps to its own ceiling and the engine
// clamps further per tenant, flagging `truncated` when its scan hit the ceiling -- so this is a request,
// never an assumption about how many zones exist.
export const VTZ_TREE_LIMIT = 500;

/** Fetch the tenant's zone tree. Throws on a non-2xx so the surface shows a load error. */
export async function fetchVtzTree(limit: number): Promise<VtzTree> {
  const res = await fetch(`/api/vtz/tree?limit=${String(limit)}`, { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`vtz tree failed: ${String(res.status)}`);
  }
  return (await res.json()) as VtzTree;
}

/** Fetch one zone + its effective-posture ancestors. Throws on a non-2xx. */
export async function fetchVtzDetail(id: string): Promise<VtzDetailView> {
  const res = await fetch(`/api/vtz/detail?id=${encodeURIComponent(id)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`vtz detail failed: ${String(res.status)}`);
  }
  return (await res.json()) as VtzDetailView;
}

/** The shared cache key for one zone's detail, so an imperative fetch and the hook agree on the slot. */
export function vtzDetailQueryKey(id: string): readonly [string, string] {
  return ['vtzDetail', id];
}

/**
 * The tenant's zone tree. Flat: the hierarchy is carried in the dotted names + `parent`, so the grid needs
 * exactly one read. Not polled -- zone authoring is an operator action, not a telemetry stream, so the
 * tree refetches when a mutation invalidates it (V2.5) rather than on a timer.
 */
export function useVtzTree(limit: number = VTZ_TREE_LIMIT): UseQueryResult<VtzTree> {
  return useQuery({
    queryKey: ['vtzTree', limit],
    queryFn: () => fetchVtzTree(limit),
  });
}

/**
 * One zone's configuration + the ancestors that contributed to its effective posture. Disabled until a
 * zone is selected. A zone id that names nothing is NOT an error: the engine returns an absent zone and
 * the view renders `zone: null` as the honest not-found.
 */
export function useVtzDetail(id: string | null): UseQueryResult<VtzDetailView> {
  return useQuery({
    queryKey: id === null ? ['vtzDetail', null] : vtzDetailQueryKey(id),
    queryFn: () => {
      if (id === null) throw new Error('no zone id');
      return fetchVtzDetail(id);
    },
    enabled: id !== null,
  });
}

// TUNE(IP-CONSOLE-02 V2.4): the bound for the risk-band join read (the engine clamps per tenant).
const RISK_JOIN_LIMIT = 10_000;

/**
 * The connectivity graph, read ONLY for its per-VTZ risk bands (`vtz.riskBand`): the grid joins them to
 * its zones by id, which is what replaced the removed trust score. This deliberately does not reuse
 * `useOverview` -- that hook layers the Overview graphic's progressive first paint and its live poll on
 * top, neither of which the grid wants (a zone's posture is not a telemetry stream). One read, one key.
 */
export function useVtzRiskBands(): UseQueryResult<OverviewSankey> {
  return useQuery({
    queryKey: ['vtzRiskBands', RISK_JOIN_LIMIT],
    queryFn: () => fetchOverview({ limit: RISK_JOIN_LIMIT }),
  });
}
