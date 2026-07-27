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
import type {
  BusinessImpact,
  IncidentActRow,
  IncidentTelemetry,
  SocIncidentDetail,
  SocIncidentRow,
  SocKpis,
  VerdictNarrative,
} from '@forge/contracts';

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

/**
 * Fetch ONE incident assembled: lineage, evidence, plan and the narrative reference together.
 *
 * A 404 is a real answer -- the incident does not exist, is another tenant's, or is above the
 * caller's clearance, all indistinguishable by design -- so it resolves to `null` rather than
 * throwing. Any other non-2xx throws, because a 503 means the engine answered and the Console will
 * not render it honestly.
 */
export async function fetchSocIncident(incidentId: string): Promise<SocIncidentDetail | null> {
  const res = await fetch(`/api/soc/incident?id=${encodeURIComponent(incidentId)}`, {
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`soc incident failed: ${String(res.status)}`);
  }
  return (await res.json()) as SocIncidentDetail;
}

/**
 * One incident, in ONE read (INV-SOC-ONE-PAYLOAD).
 *
 * The lineage graph, verdict panel and dock all render from this single result. Scoping to a node is
 * a filter over what this returned, never another request, so no two panels can show an operator
 * different moments in time.
 */
export function useSocIncident(
  incidentId: string | null,
): UseQueryResult<SocIncidentDetail | null> {
  return useQuery({
    queryKey: ['soc', 'incident', incidentId],
    queryFn: () => fetchSocIncident(incidentId as string),
    enabled: incidentId !== null,
  });
}

/**
 * Fetch one incident's recorded verdict narrative.
 *
 * A READ, never a trigger: opening an incident must not cause generation, so this never runs the
 * pipeline and two opens cannot pay for two model runs of the same evidence.
 */
export async function fetchSocNarrative(incidentId: string): Promise<VerdictNarrative> {
  const res = await fetch(`/api/soc/narrative?id=${encodeURIComponent(incidentId)}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(`soc narrative failed: ${String(res.status)}`);
  }
  return (await res.json()) as VerdictNarrative;
}

/**
 * One incident's verdict narrative.
 *
 * All three states (absent / refused / published) arrive as DATA, not as errors -- an operator must
 * be able to tell "nobody has looked" from "the pipeline looked and would not stand behind it".
 */
export function useSocNarrative(incidentId: string | null): UseQueryResult<VerdictNarrative> {
  return useQuery({
    queryKey: ['soc', 'narrative', incidentId],
    queryFn: () => fetchSocNarrative(incidentId as string),
    enabled: incidentId !== null,
  });
}

/**
 * Fetch the dock's Raw Telemetry pane (crdb ED.2): the incident's evidence resolved to the records
 * behind it. A 404 is the engine's one indistinguishable refusal and resolves to `null`.
 */
export async function fetchSocTelemetry(incidentId: string): Promise<IncidentTelemetry | null> {
  const res = await fetch(`/api/soc/telemetry?id=${encodeURIComponent(incidentId)}`, {
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`soc telemetry failed: ${String(res.status)}`);
  }
  return (await res.json()) as IncidentTelemetry;
}

/** The Raw Telemetry pane's read. Fetched only when the pane can render (an incident is open). */
export function useSocTelemetry(
  incidentId: string | null,
): UseQueryResult<IncidentTelemetry | null> {
  return useQuery({
    queryKey: ['soc', 'telemetry', incidentId],
    queryFn: () => fetchSocTelemetry(incidentId as string),
    enabled: incidentId !== null,
  });
}

/** Fetch the incident's audit trail (crdb ED.3): the recorded operator acts, oldest first. */
export async function fetchSocAuditTrail(
  incidentId: string,
): Promise<readonly IncidentActRow[] | null> {
  const res = await fetch(`/api/soc/audit?id=${encodeURIComponent(incidentId)}`, {
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`soc audit failed: ${String(res.status)}`);
  }
  return (await res.json()) as readonly IncidentActRow[];
}

/** The Audit Trail pane's read: an index into the hash-chained audit record, never a second log. */
export function useSocAuditTrail(
  incidentId: string | null,
): UseQueryResult<readonly IncidentActRow[] | null> {
  return useQuery({
    queryKey: ['soc', 'audit', incidentId],
    queryFn: () => fetchSocAuditTrail(incidentId as string),
    enabled: incidentId !== null,
  });
}

/**
 * Fetch the Business impact assessment (crdb ED.4 + ED.5).
 *
 * A READ, never a trigger: the band is deterministic Rust and always present; the sentence arrives
 * in its three honest states, and `not_assessed` is rendered, never filled.
 */
export async function fetchSocImpact(incidentId: string): Promise<BusinessImpact | null> {
  const res = await fetch(`/api/soc/impact?id=${encodeURIComponent(incidentId)}`, {
    credentials: 'include',
  });
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`soc impact failed: ${String(res.status)}`);
  }
  return (await res.json()) as BusinessImpact;
}

/** The Business impact panel's read. */
export function useSocImpact(incidentId: string | null): UseQueryResult<BusinessImpact | null> {
  return useQuery({
    queryKey: ['soc', 'impact', incidentId],
    queryFn: () => fetchSocImpact(incidentId as string),
    enabled: incidentId !== null,
  });
}
