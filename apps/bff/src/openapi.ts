// apps/bff/src/openapi.ts -- the BFF OpenAPI surface skeleton (F0.3).
//
// The BFF is contract-first: its HTTP surface is described by an OpenAPI document, from which the SPA API
// client is generated (F0.4 wires the drift check). F0.3 lands the skeleton -- the operational endpoints
// that exist today (health/readiness) -- as a real OpenAPI 3.1 document served at /openapi.json. The
// engine-brokered operation paths are added as their bindings land (never fabricated ahead of the op).

/** A described operation: its summary and its responses by status. */
type Operation = { summary: string; responses: Record<string, { description: string }> };

const TIER_403 = {
  description: 'The engine refused: the operator tier is below the one required.',
};
const UNAUTH_401 = { description: 'No valid operator session.' };
const BAD_400 = { description: 'Malformed input, refused before any engine call.' };
const ENGINE_5XX = {
  '502': { description: 'The engine call failed.' },
  '503': { description: 'The engine is unavailable.' },
};

function op(
  summary: string,
  ok: string,
  extra: Record<string, { description: string }> = {},
): Operation {
  return {
    summary,
    responses: { '200': { description: ok }, '401': UNAUTH_401, ...extra, ...ENGINE_5XX },
  };
}

/**
 * The Settings surface's routes (IP-CONSOLE-11), each over a real engine operation (crdb
 * IP-CONSOLE-SETTINGS-WIRE and IP-AISOC-STEP1 C.9c). Exported so a test proves the server and this
 * document never drift apart.
 */
export const SETTINGS_PATHS: Record<string, Record<string, Operation>> = {
  '/api/settings': {
    get: op(
      'The governed settings read (SETTINGS_READ): every registry setting with the engine rendering',
      'SettingsView.',
      { '400': BAD_400, '403': TIER_403 },
    ),
    post: op(
      'Commit knob edits and / or section patches (SETTINGS_COMMIT)',
      'SettingsReceipt (committed or refused with the causes).',
      {
        '400': BAD_400,
        '403': TIER_403,
      },
    ),
  },
  '/api/settings/soc': {
    get: op('The SOC settings (SOC_SETTINGS_READ)', 'SocSettings.', { '403': TIER_403 }),
    post: op('Commit a SOC settings patch (SOC_SETTINGS_COMMIT)', 'SocSettingsReceipt.', {
      '400': BAD_400,
      '403': TIER_403,
    }),
  },
  '/api/settings/console-rbac': {
    get: op(
      'The Console role map (installer configuration), global admins only',
      'ConsoleRbacView.',
      {
        '403': { description: 'The operator is not a global admin.' },
      },
    ),
  },
  '/api/settings/reports': {
    get: op('The admin plane status reports by name (SETTINGS_REPORTS)', 'SettingsReportsView.', {
      '400': BAD_400,
      '403': TIER_403,
    }),
  },
  '/api/settings/security-session': {
    get: op(
      "The key exchange this request's admin TLS session negotiated (the sidecar's record)",
      'AdminSessionKx: negotiated, not-tunnelled, or unconfigured.',
    ),
  },
  '/api/settings/propose': {
    post: op(
      'Propose a settings change for a second Admin (SETTINGS_PROPOSE)',
      'SettingsProposalReceipt.',
      {
        '400': BAD_400,
        '403': TIER_403,
      },
    ),
  },
  '/api/settings/approvals': {
    get: op(
      'The pending config proposals from either plane (SETTINGS_APPROVALS)',
      '{ proposals: PendingProposal[] }.',
      {
        '403': TIER_403,
      },
    ),
  },
  '/api/settings/approvals/{proposal}/approve': {
    post: op(
      'Approve a pending proposal as a distinct Admin (SETTINGS_APPROVE)',
      'SettingsReceipt (committed, or approvalRefused).',
      {
        '400': BAD_400,
        '403': TIER_403,
      },
    ),
  },
  '/api/settings/history': {
    get: op(
      'The committed configuration versions, newest first (SETTINGS_HISTORY)',
      'SettingsHistoryView.',
      {
        '400': BAD_400,
        '403': TIER_403,
      },
    ),
  },
  '/api/settings/rollback': {
    post: op(
      'Restore a configuration version (SETTINGS_ROLLBACK); a proposal under dual control',
      'SettingsReceipt.',
      {
        '400': BAD_400,
        '403': TIER_403,
      },
    ),
  },
};

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
      ...SETTINGS_PATHS,
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
