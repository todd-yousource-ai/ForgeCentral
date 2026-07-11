#!/usr/bin/env bash
# deploy/install.sh -- the end-to-end YouSource Console install (IP-CONSOLE-00-DEPLOY D.4).
#
# Lays the whole two-process Console down on a node and enrolls its engine identity, then self-checks. It
# ties together D.1 (the BFF unit), D.2 (the sidecar config + admin cert), and D.3a-console (the ZTP
# enrollment): install the binaries + units, provision the sidecar, run `console-enroll` (the operator
# approves the MFA device code -- the one interactive step) to mint the engine cert/key the sidecar
# presents, enable both units, and validate. Fail-closed and idempotent where the underlying steps are.
#
# Config is env. Required unless noted; see deploy/console-enroll.env.example for the enrollment vars.
#   CONSOLE_NODE_IP            the node's own IP (the sidecar admin bind + the validate target)
#   CONSOLE_BIN_DIR           dir holding the built binaries: console-crypto-sidecar, console-enroll
#   CONSOLE_BFF_DIST          dir holding the built BFF (dist/ + node_modules)
#   CONSOLE_ENROLL_ENV        path to the console-enroll env file (the CONSOLE_ENROLL_* vars)
#   CONSOLE_SKIP_ENROLL=1     optional: skip the interactive enrollment (e.g. re-run after enrolling)
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
die() { echo "install: $*" >&2; exit 1; }
log() { echo "==> $*"; }

# ---- config -------------------------------------------------------------------------------------
NODE_IP="${CONSOLE_NODE_IP:?set CONSOLE_NODE_IP to the node IP}"
BIN_DIR="${CONSOLE_BIN_DIR:?set CONSOLE_BIN_DIR to the built-binaries dir}"
BFF_DIST="${CONSOLE_BFF_DIST:?set CONSOLE_BFF_DIST to the built BFF dir}"
ENROLL_ENV="${CONSOLE_ENROLL_ENV:-/etc/console-enroll/config.env}"
SIDECAR_ETC=/etc/console-sidecar
BFF_ETC=/etc/console-bff
BFF_LIB=/usr/local/lib/console-bff
BIN_PREFIX=/usr/local/bin

[ "$(id -u)" = "0" ] || die "run as root (installs users, units, and /etc material)"

# ---- [1] service users ---------------------------------------------------------------------------
log "[1] service users"
id console-sidecar >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin console-sidecar
id console-bff     >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin console-bff

# ---- [2] binaries + the built BFF ----------------------------------------------------------------
log "[2] binaries"
install -m 0755 "$BIN_DIR/console-crypto-sidecar" "$BIN_PREFIX/console-crypto-sidecar"
install -m 0755 "$BIN_DIR/console-enroll"         "$BIN_PREFIX/console-enroll"
install -d -m 0755 "$BFF_LIB"
cp -a "$BFF_DIST/." "$BFF_LIB/"

# ---- [3] provision the sidecar (D.2): admin P-384 leaf + config.json -----------------------------
log "[3] sidecar provisioning (admin cert + config)"
install -d -m 0750 "$SIDECAR_ETC"
# The engine identity paths the enrollment writes and the sidecar presents (kept aligned below).
ENGINE_CERT="$SIDECAR_ETC/engine-client.pem"
ENGINE_KEY="$SIDECAR_ETC/engine-client.key"
OUT_DIR="$SIDECAR_ETC" NODE_IP="$NODE_IP" \
  ENGINE_CERT="$ENGINE_CERT" ENGINE_KEY="$ENGINE_KEY" \
  bash "$repo_root/sidecar/deploy/provision-sidecar.sh"

# ---- [4] enroll the engine identity (D.3a-console): the interactive operator-MFA step -------------
if [ "${CONSOLE_SKIP_ENROLL:-0}" = "1" ]; then
  log "[4] enrollment SKIPPED (CONSOLE_SKIP_ENROLL=1)"
elif [ -s "$ENGINE_CERT" ] && [ -s "$ENGINE_KEY" ]; then
  log "[4] engine identity already present ($ENGINE_CERT); keeping it (set CONSOLE_SKIP_ENROLL=1 to force-skip, or remove it to re-enroll)"
else
  [ -s "$ENROLL_ENV" ] || die "enrollment env not found at $ENROLL_ENV (see deploy/console-enroll.env.example)"
  log "[4] enrolling the engine identity -- approve the printed device code (operator MFA)"
  # console-enroll writes the leaf cert + key where the sidecar config points; force those two.
  set -a; . "$ENROLL_ENV"; set +a
  CONSOLE_ENROLL_CERT_OUT="$ENGINE_CERT" CONSOLE_ENROLL_KEY_OUT="$ENGINE_KEY" \
    "$BIN_PREFIX/console-enroll" || die "enrollment failed (each device code is single-use; re-run install)"
  chown console-sidecar:console-sidecar "$ENGINE_CERT" "$ENGINE_KEY"
  chmod 0640 "$ENGINE_CERT"; chmod 0600 "$ENGINE_KEY"
fi
chown -R console-sidecar:console-sidecar "$SIDECAR_ETC"

# ---- [5] BFF config + both units -----------------------------------------------------------------
log "[5] BFF config + systemd units"
install -d -m 0750 "$BFF_ETC"
[ -f "$BFF_ETC/config.env" ] || install -m 0640 "$repo_root/apps/bff/deploy/config.example.env" "$BFF_ETC/config.env"
chown -R console-bff:console-bff "$BFF_ETC"
install -m 0644 "$repo_root/sidecar/deploy/console-crypto-sidecar.service" /etc/systemd/system/
install -m 0644 "$repo_root/apps/bff/deploy/console-bff.service"           /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now console-crypto-sidecar console-bff

# ---- [6] validate (the CS.N proofs) --------------------------------------------------------------
log "[6] validate"
CONSOLE_NODE_IP="$NODE_IP" bash "$repo_root/deploy/validate.sh"

log "Console install complete."
