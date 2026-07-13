// apps/console/src/surfaces/useExportLogs.ts -- the audited LOG export mutation (IP-CONSOLE-09 LG.6).
//
// Brokers the operator "Export" action to the BFF (POST /api/logs/export), which runs crdb's audited
// LOG_EXPORT: the engine records a receipt on the audit chain and returns the exported rows. The Console
// then offers those rows (the AUDITED set, not a client-side read) as a file download and shows the
// receipt. Idempotent by commandId (a retried export returns the same receipt).

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { LogExportRequest, LogExportView } from '@forge/contracts';

/** POST the export to the BFF. Throws on a non-2xx (the surface shows a sanitized error). */
export async function postLogExport(request: LogExportRequest): Promise<LogExportView> {
  const res = await fetch('/api/logs/export', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new Error(`log export failed: ${String(res.status)}`);
  }
  return (await res.json()) as LogExportView;
}

/** The audited-export mutation. The caller triggers the file download from the returned view. */
export function useExportLogs(): UseMutationResult<LogExportView, Error, LogExportRequest> {
  return useMutation<LogExportView, Error, LogExportRequest>({
    mutationFn: postLogExport,
  });
}

/**
 * Trigger a browser download of an audited export's rows as JSON. The rows come from the audited engine
 * op (its receipt is on the chain), so this is a download of the audited set, not a fabricated CSV.
 */
export function downloadExport(view: LogExportView): void {
  const blob = new Blob([JSON.stringify({ exportId: view.exportId, rows: view.rows }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `decision-log-${view.exportId.slice(0, 16)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
