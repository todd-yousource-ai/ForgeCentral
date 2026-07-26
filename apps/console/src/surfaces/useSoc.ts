// apps/console/src/surfaces/useSoc.ts -- the SOC Ops read hooks (IP-CONSOLE-03 S3.3).
//
// Reads the SOC surface's data from the BFF, which brokers DETECT_SUMMARY (crdb FV.6),
// SOC_INCIDENT_LIST and SOC_INCIDENT_DETAIL (SS.4b) and SOC_NARRATIVE (VN.7b) over :7878. The engine
// owns every number; the BFF projects and fails closed on an unknown tag; these hooks only carry the
// result, so nothing on the surface is fabricated (INV-SOC-NO-FABRICATED-NUMBER). Same-origin with
// the session cookie; the SPA never holds a token. TanStack Query owns caching + loading/error.
//
// A 503 from these routes means "the engine answered and the Console will not render it honestly"
// (a refused queue, an unnarrowable tag). It is surfaced as a load ERROR, never as empty data --
// which is the whole point of the fail-closed chain behind it.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { SocIncidentRow, SocKpis } from '@forge/contracts';

/** Fetch the five KPI tiles. Throws on a non-2xx so the strip shows a load error, never blanks. */
export async function fetchSocKpis(): Promise<SocKpis> {
  const res = await fetch('/api/soc/kpis', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`soc kpis failed: ${String(res.status)}`);
  }
  return (await res.json()) as SocKpis;
}

/** Fetch the ranked decision queue, in the engine's order. */
export async function fetchSocIncidents(): Promise<readonly SocIncidentRow[]> {
  const res = await fetch('/api/soc/incidents', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`soc incidents failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly SocIncidentRow[];
}

/** The five KPI tiles (`DETECT_SUMMARY` + SS.3 counters + the queue's authority field). */
export function useSocKpis(): UseQueryResult<SocKpis> {
  return useQuery({ queryKey: ['soc', 'kpis'], queryFn: fetchSocKpis });
}

/** The ranked decision queue. Rendered in the ENGINE's order; the surface never re-sorts. */
export function useSocIncidents(): UseQueryResult<readonly SocIncidentRow[]> {
  return useQuery({ queryKey: ['soc', 'incidents'], queryFn: fetchSocIncidents });
}
