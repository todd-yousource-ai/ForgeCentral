// apps/bff/src/auth/provider.ts -- the OIDC provider seam (F0.5a-2).
//
// The auth router depends on the IdP only through this narrow interface, so it is unit-testable over a
// scripted provider (no network) while the real adapter binds the device-flow functions in oidc.ts to a
// concrete `OidcConfig`. `verifyLogin` folds the two trust steps -- verify the id_token against the JWKS,
// then derive the operator identity from its verified claims -- into one call the router cannot misuse.

import type { OidcConfig, DeviceCode, PollResult } from './oidc.js';
import { requestDeviceCode, pollToken, verifyIdToken, operatorFromClaims } from './oidc.js';
import type { OperatorIdentity } from './session.js';

/** The IdP operations the auth router needs. */
export interface OidcProvider {
  /** Start a device authorization: returns the code + the operator-facing verification URI. */
  requestDeviceCode(): Promise<DeviceCode>;
  /** Poll the token endpoint once for a device code. */
  pollToken(deviceCode: string): Promise<PollResult>;
  /** Verify an id_token and derive the operator identity (throws if the token is not valid). */
  verifyLogin(idToken: string): Promise<OperatorIdentity>;
}

/** Build the real provider over an `OidcConfig` (binds the oidc.ts device-flow functions). */
export function createOidcProvider(config: OidcConfig): OidcProvider {
  return {
    requestDeviceCode: () => requestDeviceCode(config),
    pollToken: (deviceCode) => pollToken(config, deviceCode),
    verifyLogin: async (idToken) => {
      const claims = await verifyIdToken(config, idToken);
      return operatorFromClaims(claims, config.roleClaim);
    },
  };
}
