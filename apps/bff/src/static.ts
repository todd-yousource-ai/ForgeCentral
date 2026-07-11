// apps/bff/src/static.ts -- serve the built Console SPA behind the admin plane (P1.0 UI enabler).
//
// The operator browses the Console at the admin plane (node-IP:8443 -> crypto sidecar -> BFF admin http);
// the BFF serves the built SPA (apps/console/dist) for non-API GET requests. A concrete file is served
// when it exists; an extension-less path (a client-side route like /overview) falls back to index.html so
// the SPA's react-router owns it. Path traversal is refused (the resolved path must stay within the dist
// dir). Enabled only when FC_SPA_DIST is set; otherwise the BFF stays API-only.

import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function contentType(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** True for the file-missing / not-a-file errors that mean "try the fallback", not a real failure. */
function isMissing(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = err.code;
  return code === 'ENOENT' || code === 'EISDIR' || code === 'ENOTDIR';
}

/** Resolve `urlPath` under `root`, or `null` if it escapes the dir (path traversal). */
function safePath(root: string, urlPath: string): string | null {
  // The leading '.' anchors the join so an absolute-looking urlPath cannot escape `root`.
  const candidate = resolve(root, `.${urlPath}`);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  return candidate;
}

/** Write `path`'s bytes to `res` (200), or return false if the file is missing (caller falls back). */
async function tryServeFile(path: string, res: ServerResponse): Promise<boolean> {
  let body: Buffer;
  try {
    body = await readFile(path);
  } catch (err) {
    if (isMissing(err)) return false;
    throw err;
  }
  res.writeHead(200, {
    'content-type': contentType(path),
    'content-length': body.length,
  });
  res.end(body);
  return true;
}

/**
 * Serve the SPA from `dir` for `urlPath`. Returns true when it wrote a response (a file, an index.html
 * fallback for a route, or a 403 for traversal); false when the caller should 404 (a missing asset).
 *
 * @throws a filesystem error other than file-missing (surfaced so the outer handler 500s).
 */
export async function serveSpa(
  dir: string,
  urlPath: string,
  res: ServerResponse,
): Promise<boolean> {
  const root = resolve(dir);
  const target = safePath(root, urlPath);
  if (target === null) {
    const payload = JSON.stringify({ error: 'forbidden' });
    res.writeHead(403, { 'content-type': 'application/json', 'content-length': payload.length });
    res.end(payload);
    return true;
  }
  if (await tryServeFile(target, res)) return true;
  // Extension-less paths are client-side routes -> serve the SPA entrypoint; a missing asset 404s.
  if (extname(urlPath) === '') {
    return tryServeFile(resolve(root, 'index.html'), res);
  }
  return false;
}
