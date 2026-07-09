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
    },
  };
}
