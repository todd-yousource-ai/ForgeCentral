// apps/bff/src/auth/cookie.ts -- session cookie parse + serialize (F0.5a-2).
//
// The operator session id (session.ts) travels as an opaque cookie value. The cookie is hardened:
// `HttpOnly` (never readable by page scripts, so an XSS cannot exfiltrate the session), `SameSite=Strict`
// (not sent on cross-site requests, a CSRF defense), `Path=/`, a bounded `Max-Age`, and `Secure` in
// production (only sent over TLS). These are the defaults a federal-customer deployment expects.

/** Options that shape the emitted `Set-Cookie` header. */
export interface CookieOptions {
  readonly name: string;
  readonly secure: boolean;
}

/** Parse a `Cookie` request header into a name->value map. Returns an empty map for a missing header. */
export function parseCookies(header: string | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (header === undefined || header.length === 0) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name.length > 0 && !out.has(name)) out.set(name, value);
  }
  return out;
}

/** Read one cookie value by name from a `Cookie` request header. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  return parseCookies(header).get(name);
}

const BASE_ATTRS = 'HttpOnly; SameSite=Strict; Path=/';

/** Serialize a `Set-Cookie` value that establishes the session for `maxAgeSecs`. */
export function serializeSessionCookie(
  value: string,
  maxAgeSecs: number,
  opts: CookieOptions,
): string {
  const attrs = [`${opts.name}=${value}`, BASE_ATTRS, `Max-Age=${String(Math.floor(maxAgeSecs))}`];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}

/** Serialize a `Set-Cookie` value that clears the session (logout): empty value, immediate expiry. */
export function clearSessionCookie(opts: CookieOptions): string {
  const attrs = [`${opts.name}=`, BASE_ATTRS, 'Max-Age=0'];
  if (opts.secure) attrs.push('Secure');
  return attrs.join('; ');
}
