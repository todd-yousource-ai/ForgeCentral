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
#   CONSOLE_PEER_TENANT       [4b] the node tenant UUID the console engine peer is attributed to (required
#                             once a cert is present; the tenant the BFF operates in)
#   CONSOLE_PEER_CLEARANCE    [4b] optional, default `secret`: the console peer's clearance
#   CONSOLE_PEER_PLANES       [4b] optional, default `data,agent,cognition,otlp,delegation` (Global-Admin):
#                             the wire planes the console service peer is granted
#   CONSOLE_NODE_CBOR         [4b] optional, default `/etc/cdb/node.cbor`: the node config to pin into
#   CONSOLE_CDB_MKCONFIG      [4b] optional, default `/usr/local/bin/cdb-mkconfig`: the pinning tool
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

# ---- [4] enroll the engine identity (IP-CONSOLE-00-SIDECAR-TPM): the interactive operator-MFA step -
# The identity key is TPM-resident and non-exportable, so enrollment writes ONLY the leaf cert; the
# sidecar re-derives the same TPM key at runtime and signs the engine-leg handshake in-device (the sidecar
# TPM wiring lands in the sidecar-TPM PR; until then the sidecar still expects a key file).
if [ "${CONSOLE_SKIP_ENROLL:-0}" = "1" ]; then
  log "[4] enrollment SKIPPED (CONSOLE_SKIP_ENROLL=1)"
elif [ -s "$ENGINE_CERT" ]; then
  log "[4] engine identity already present ($ENGINE_CERT); keeping it (set CONSOLE_SKIP_ENROLL=1 to force-skip, or remove it to re-enroll)"
else
  [ -s "$ENROLL_ENV" ] || die "enrollment env not found at $ENROLL_ENV (see deploy/console-enroll.env.example)"
  log "[4] enrolling the engine identity -- approve the printed device code (operator MFA)"
  # console-enroll writes only the leaf cert (no key file); force it to the sidecar's engine_cert path.
  set -a; . "$ENROLL_ENV"; set +a
  CONSOLE_ENROLL_CERT_OUT="$ENGINE_CERT" \
    "$BIN_PREFIX/console-enroll" || die "enrollment failed (each device code is single-use; re-run install)"
  chown console-sidecar:console-sidecar "$ENGINE_CERT"
  chmod 0640 "$ENGINE_CERT"
fi
chown -R console-sidecar:console-sidecar "$SIDECAR_ETC"

# ---- [4b] pin the Console engine peer (Global-Admin service identity) into the node config --------
# The Console's engine identity is a fixed SERVICE peer, not a human login: it holds a Global-Admin grant
# (all wire planes incl. Delegation) so the BFF can broker operator-delegated reads across the engine,
# decoupled from any MFA -- the human hop is gated at the BFF, not the engine seam. It is pinned by the
# SHA-512 leaf fingerprint of the freshly-enrolled cert, re-executably on every rebuild, via the crdb
# primitive `cdb-mkconfig --add-wire-peer` (a non-destructive read-modify-write; regenerating the whole
# node.cbor would rotate the node's mTLS material and other state -- which is exactly how a rebuild used to
# DROP this pin and break every operator read). Idempotent: re-running restarts cdb only if the pin changed.
if [ -s "$ENGINE_CERT" ]; then
  PEER_TENANT="${CONSOLE_PEER_TENANT:?set CONSOLE_PEER_TENANT to the node tenant UUID the console peer is attributed to}"
  PEER_CLEARANCE="${CONSOLE_PEER_CLEARANCE:-secret}"
  PEER_PLANES="${CONSOLE_PEER_PLANES:-data,agent,cognition,otlp,delegation}"
  NODE_CBOR="${CONSOLE_NODE_CBOR:-/etc/cdb/node.cbor}"
  CDB_MKCONFIG="${CONSOLE_CDB_MKCONFIG:-/usr/local/bin/cdb-mkconfig}"
  [ -x "$CDB_MKCONFIG" ] || die "cdb-mkconfig not found at $CDB_MKCONFIG (set CONSOLE_CDB_MKCONFIG); needs the --add-wire-peer support"
  [ -f "$NODE_CBOR" ] || die "node config not found at $NODE_CBOR (set CONSOLE_NODE_CBOR)"
  log "[4b] pinning the console engine peer (Global-Admin) into $NODE_CBOR"
  fp=$(openssl x509 -in "$ENGINE_CERT" -outform DER 2>/dev/null | openssl dgst -sha512 -hex | awk '{print $NF}')
  [ -n "$fp" ] || die "could not compute the console cert SHA-512 fingerprint from $ENGINE_CERT"
  before=$(sha256sum "$NODE_CBOR" | awk '{print $1}')
  "$CDB_MKCONFIG" --add-wire-peer "${fp}=${PEER_TENANT}=${PEER_CLEARANCE}=${PEER_PLANES}" "$NODE_CBOR" \
    || die "pinning the console peer failed (cdb-mkconfig --add-wire-peer)"
  after=$(sha256sum "$NODE_CBOR" | awk '{print $1}')
  if [ "$before" != "$after" ]; then
    log "  node config changed -> restarting cdb to load the pinned peer (wire.peers is boot-bound)"
    systemctl restart cdb
  else
    log "  console peer already pinned with this grant (no node restart needed)"
  fi
else
  log "[4b] no engine cert at $ENGINE_CERT -> skipping the console peer pin (enrollment was skipped)"
fi

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
