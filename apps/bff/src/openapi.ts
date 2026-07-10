// apps/bff/src/openapi.ts -- the BFF OpenAPI surface skeleton (F0.3).
//
// The BFF is contract-first: its HTTP surface is described by an OpenAPI document, from which the SPA API
// client is generated (F0.4 wires the drift check). F0.3 lands the skeleton -- the operational endpoints
// that exist today (health/readiness) -- as a real OpenAPI 3.1 document served at /openapi.json. The
// engine-brokered operation paths are added as their bindings land (never fabricated ahead of the op).

/** The BFF OpenAPI 3.1 document (operational surface; engine-brokered paths added per binding). */
export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ForgeCentral BFF',
      version: '0.0.0',
      description:
        'The Console backend-for-frontend. Stateless gateway over the Crucible engine (mTLS :7878); owns no domain data.',
    },
    paths: {
      '/healthz': {
        get: {
          summary: 'Liveness probe',
          responses: { '200': { description: 'The service process is alive.' } },
        },
      },
      '/readyz': {
        get: {
          summary: 'Readiness probe (engine reachable under the enrolled session)',
          responses: {
            '200': { description: 'Ready: the engine is reachable.' },
            '503': {
              description: 'Not ready: the engine is unreachable or the transport is not wired.',
            },
          },
        },
      },
      '/openapi.json': {
        get: {
          summary: 'This OpenAPI document',
          responses: { '200': { description: 'The BFF OpenAPI 3.1 document.' } },
        },
      },
      '/auth/login': {
        post: {
          summary: 'Start an operator device login (RFC 8628)',
          responses: {
            '200': {
              description: 'Device code issued: { loginId, userCode, verificationUri... }.',
            },
            '502': { description: 'The identity provider is unavailable.' },
          },
        },
      },
      '/auth/login/poll': {
        post: {
          summary: 'Poll a device login for completion',
          responses: {
            '200': {
              description:
                'Either { status: "pending" } or { status: "complete", operator } + session cookie.',
            },
            '400': { description: 'Malformed request body.' },
            '401': { description: 'The login failed or the token could not be verified.' },
            '404': { description: 'Unknown or expired loginId.' },
          },
        },
      },
      '/auth/logout': {
        post: {
          summary: 'End the operator session',
          responses: { '200': { description: 'Session destroyed and cookie cleared.' } },
        },
      },
      '/auth/me': {
        get: {
          summary: 'The current operator identity',
          responses: {
            '200': { description: 'The authenticated operator { subject, email?, tier }.' },
            '401': { description: 'No valid session.' },
          },
        },
      },
    },
  };
}
