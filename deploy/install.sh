#!/usr/bin/env bash
# deploy/install.sh -- the end-to-end YouSource Console install (IP-CONSOLE-00-DEPLOY D.4).
#
# Lays the whole two-process Console down on a node and delivers its engine identity, then self-checks. It
# ties together D.1 (the BFF unit), D.2 (the sidecar config + admin cert), and the control-plane engine
# identity: install the binaries + units, provision the sidecar, deliver the permanent SOFTWARE Console-CA
# leaf the node installer minted (IP-CONSOLE-CONTROL-PLANE D2 -- no MFA, no ZTP, no TPM), enable both units,
# and validate. Fail-closed and idempotent where the underlying steps are.
#
# Config is env. Required unless noted.
#   CONSOLE_NODE_IP            the node's own IP (the sidecar admin bind + the validate target)
#   CONSOLE_BIN_DIR           dir holding the built binary: console-crypto-sidecar
#   CONSOLE_BFF_DIST          dir holding the built BFF (dist/ + node_modules)
#   CONSOLE_CONTROL_SRC       [4] optional, default `/etc/cdb/control`: where the node installer's software
#                             Console-CA leaf (ca.pem/client.pem/client.key) lives
#   CONSOLE_SKIP_ENROLL=1     optional: skip the engine-identity leaf delivery (e.g. re-run after delivery)
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
# The built BFF dir (dist/ + node_modules). Optional: when unset, the installer BUILDS a self-contained
# BFF from the repo (pnpm), so a rebuild is a single command with no pre-staged artifact.
BFF_DIST="${CONSOLE_BFF_DIST:-}"
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
# Build a self-contained BFF from the repo when no prebuilt dir is supplied (the rebuild is part of the
# installer, per the deployment contract). pnpm's `deploy --prod` flattens the workspace deps + the
# built package into one directory the service runs from -- no dev deps, no workspace symlinks.
if [ -z "$BFF_DIST" ]; then
  command -v pnpm >/dev/null 2>&1 || die "pnpm required to build the BFF (or set CONSOLE_BFF_DIST to a prebuilt dir)"
  log "  building the self-contained BFF from $repo_root (pnpm build + deploy)"
  ( cd "$repo_root" \
      && pnpm install --frozen-lockfile \
      && pnpm -r --if-present run build \
      && rm -rf "$repo_root/.bff-deploy" \
      && pnpm --filter @forge/bff --prod deploy "$repo_root/.bff-deploy" ) \
    || die "BFF build failed"
  BFF_DIST="$repo_root/.bff-deploy"
  log "  built self-contained BFF at $BFF_DIST"
fi
install -d -m 0755 "$BFF_LIB"
cp -a "$BFF_DIST/." "$BFF_LIB/"

# ---- [3] provision the sidecar (D.2): admin P-384 leaf + config.json -----------------------------
log "[3] sidecar provisioning (admin cert + config)"
install -d -m 0750 "$SIDECAR_ETC"
# The engine identity paths [4] delivers and the sidecar presents (the :7879 control-plane software leaf).
ENGINE_CA="$SIDECAR_ETC/engine-ca.pem"
ENGINE_CERT="$SIDECAR_ETC/engine-client.pem"
ENGINE_KEY="$SIDECAR_ETC/engine-client.key"
OUT_DIR="$SIDECAR_ETC" NODE_IP="$NODE_IP" \
  ENGINE_CA="$ENGINE_CA" ENGINE_CERT="$ENGINE_CERT" ENGINE_KEY="$ENGINE_KEY" \
  bash "$repo_root/sidecar/deploy/provision-sidecar.sh"

# ---- [4] deliver the engine identity (IP-CONSOLE-CONTROL-PLANE F2): copy the node installer's software
# Console-CA leaf into the sidecar's cert dir. No operator MFA, no ZTP -- the leaf is a PERMANENT pinned
# identity on the dedicated :7879 control plane; the node installer (crdb 50-config, which generates the
# Console-CA under CONTROL_SRC) produced it. This retires the console-enroll ZTP engine path for the
# control plane. The sidecar presents this software key (config.json engine_key), no TPM.
CONTROL_SRC="${CONSOLE_CONTROL_SRC:-/etc/cdb/control}"
if [ "${CONSOLE_SKIP_ENROLL:-0}" = "1" ]; then
  log "[4] engine identity delivery SKIPPED (CONSOLE_SKIP_ENROLL=1)"
elif [ -s "$ENGINE_CERT" ] && [ -s "$ENGINE_KEY" ]; then
  log "[4] engine identity already present ($ENGINE_CERT); keeping it (remove it to re-copy)"
else
  [ -r "$CONTROL_SRC/client.pem" ] || die "control-plane leaf not found at $CONTROL_SRC/client.pem -- run the node installer (crdb 50-config generates the Console-CA) first, or set CONSOLE_CONTROL_SRC"
  log "[4] delivering the software Console-CA leaf from $CONTROL_SRC (permanent :7879 control-plane identity)"
  install -m 0644 "$CONTROL_SRC/ca.pem" "$ENGINE_CA"
  install -m 0644 "$CONTROL_SRC/client.pem" "$ENGINE_CERT"
  install -m 0640 "$CONTROL_SRC/client.key" "$ENGINE_KEY"
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
# Pin the operator's read tenant to the SAME fixed constant the crdb installer hardcodes as the node's
# wire/enrollment tenant (df46dcb7). The Console's CONNECTIVITY_GRAPH read scans session.tenant, so the
# operator MUST read the tenant torch ships to; a per-install random tenant is why the Overview kept
# coming up empty. Deterministic across rebuilds; overridable via CONSOLE_OPERATOR_TENANT. Idempotent:
# replace any existing (commented or live) FC_RBAC_CONFIG line -- the operator is a global-admin on this
# single tenant, groupRoles/localRbac stay empty for the single-node console.
OPERATOR_TENANT="${CONSOLE_OPERATOR_TENANT:-df46dcb7-2e91-448c-a406-42e492b85e36}"
sed -i -E '/^[[:space:]]*#?[[:space:]]*FC_RBAC_CONFIG=/d' "$BFF_ETC/config.env"
printf 'FC_RBAC_CONFIG={"groupRoles":{},"localRbac":{},"defaultTenant":"%s"}\n' "$OPERATOR_TENANT" >>"$BFF_ETC/config.env"
log "  operator read tenant pinned to $OPERATOR_TENANT (FC_RBAC_CONFIG.defaultTenant)"
chown -R console-bff:console-bff "$BFF_ETC"
install -m 0644 "$repo_root/sidecar/deploy/console-crypto-sidecar.service" /etc/systemd/system/
install -m 0644 "$repo_root/apps/bff/deploy/console-bff.service"           /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now console-crypto-sidecar console-bff

# ---- [6] validate (the CS.N proofs) --------------------------------------------------------------
log "[6] validate"
CONSOLE_NODE_IP="$NODE_IP" bash "$repo_root/deploy/validate.sh"

log "Console install complete."
