// apps/console/src/surfaces/useExportLogs.ts -- the audited LOG export mutation (IP-CONSOLE-09 LG.6).
//
// Brokers the operator "Export" action to the BFF (POST /api/logs/export), which runs crdb's audited
// LOG_EXPORT: the engine records a receipt on the audit chain and returns the exported rows. The Console
// then offers those rows (the AUDITED set, not a client-side read) as a file download and shows the
// receipt. Idempotent by commandId (a retried export returns the same receipt).

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { LogExportRequest, LogExportView } from '@forge/contracts';

/** A failed export with its HTTP status, so the surface can say what happened. */
export class LogExportError extends Error {
  constructor(readonly status: number) {
    super(`log export failed: ${String(status)}`);
    this.name = 'LogExportError';
  }
}

/** The operator-facing line for a failed export. A 502 can follow an engine commit, so it never promises
 *  that nothing was recorded. */
export function exportFailure(error: Error): string {
  if (!(error instanceof LogExportError)) return 'The export could not reach ForgeCentral.';
  switch (error.status) {
    case 401:
      return 'Your session has expired. Sign in again; nothing was exported.';
    case 403:
      return 'The engine refused the export. Nothing was recorded.';
    case 400:
      return 'The export request was not accepted as sent. Nothing was recorded.';
    case 503:
      return 'The engine is unavailable. Nothing was recorded.';
    default:
      return 'The engine could not complete the export; a receipt may still have been recorded.';
  }
}

/** POST the export to the BFF. Throws a `LogExportError` on a non-2xx. */
export async function postLogExport(request: LogExportRequest): Promise<LogExportView> {
  const res = await fetch('/api/logs/export', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new LogExportError(res.status);
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
