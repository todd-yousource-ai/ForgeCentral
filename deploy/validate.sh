#!/usr/bin/env bash
# deploy/validate.sh -- the Console post-install self-check (IP-CONSOLE-00-DEPLOY D.4).
#
# Reproduces the CS.N capstone as an install gate: both units are up, the engine leg is live (BFF /readyz
# green -> sidecar -> mTLS :7878, Node doing no TLS), and the admin plane enforces its floor on the node IP
# (classical P-384 admitted, sub-floor X25519/P-256 refused). Fails non-zero on any red leg so `install.sh`
# aborts. The hybrid PQC leg (X25519MLKEM768) is not offered by openssl 3.0 and is covered by the sidecar's
# in-process CS.2 test; this checks the classical floor + the fail-closed refusal live.
set -euo pipefail

NODE_IP="${CONSOLE_NODE_IP:?set CONSOLE_NODE_IP}"
BFF_HTTP_PORT="${CONSOLE_BFF_HTTP_PORT:-8787}"
ADMIN_PORT="${CONSOLE_ADMIN_PORT:-8443}"
fail() { echo "validate: FAIL -- $*" >&2; exit 1; }
ok() { echo "validate: ok -- $*"; }

echo "==> [1/4] units active"
systemctl is-active --quiet console-crypto-sidecar || fail "console-crypto-sidecar is not active"
systemctl is-active --quiet console-bff            || fail "console-bff is not active"
ok "both units active"

echo "==> [2/4] engine leg: BFF /readyz (BFF -> sidecar -> mTLS :7878, Node doing no TLS)"
ready=$(curl -fsS -m 15 "http://127.0.0.1:${BFF_HTTP_PORT}/readyz" 2>/dev/null || true)
echo "$ready" | grep -q '"ready":true' || fail "/readyz not green (got: ${ready:-<none>}) -- the sidecar could not reach the engine with the enrolled identity"
ok "engine leg green"

echo "==> [3/4] admin floor: classical P-384 handshake on ${NODE_IP}:${ADMIN_PORT}"
if printf 'GET /healthz HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n' \
    | openssl s_client -connect "${NODE_IP}:${ADMIN_PORT}" -groups secp384r1 -tls1_3 -quiet 2>/dev/null \
    | grep -q "200"; then
  ok "P-384 floor admitted + tunnels to the BFF"
else
  fail "the classical P-384 floor did not complete on ${NODE_IP}:${ADMIN_PORT}"
fi

echo "==> [4/4] admin floor: sub-floor (X25519, P-256) is refused"
if echo | openssl s_client -connect "${NODE_IP}:${ADMIN_PORT}" -groups X25519:prime256v1 -tls1_3 2>&1 \
    | grep -qiE "handshake failure|alert|no shared|sslv3 alert"; then
  ok "sub-floor refused (fail-closed)"
else
  fail "a sub-floor client was NOT refused on ${NODE_IP}:${ADMIN_PORT} -- the admin plane floor is not enforced"
fi

echo "==> ALL VALIDATION CHECKS PASSED"
