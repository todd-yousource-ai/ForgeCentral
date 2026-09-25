# IP-CONSOLE-11-defect-remediation -- landing ledger

Plan: `IP-CONSOLE-11-defect-remediation.md`. Created WITH the plan (2026-09-25) per the ledger
discipline: a row is updated (status, repo and merge hash) in the same session its fix PR merges, the
census row (`IP-CONSOLE-11-guide-CENSUS.md`) flips to FIXED with the same hash, and Resume-here is
rewritten at every merge. Engine (crucible) and endpoint (torch) fixes land in those repos; their merge
hashes are recorded here with the repo named.

## Resume here (rewrite at every merge)

- **State (2026-09-25):** plan authored; 54 open rows re-verified against FC `17650f1`, crucible
  `c5590958`, torch `d8f03ca`. Nothing scheduled yet. Operator decisions D1 to D7 open (plan Section 2).
- **Suggested first PR:** RM.1 CD-01 (FC: refuse a non-admin secret write, audit line), then RM.2 CD-65
  (seen live) and CD-12.

## Roster

| ID | Sev | Owner | Stream | Status | Repo / merge | Notes |
|----|-----|-------|--------|--------|--------------|-------|
| CD-01 | S1 | FC | RM.1 | OPEN | | Any signed-in role can overwrite the Auth0 connector secret; no audit |
| CD-02 | S1 | torch | RM.1 | Open (latent) | | Applying a bundle attaches an egress ruleset in torchd's own (host) namespace |
| CD-03 | S1 | crdb+FC | RM.1 | Open, deferred (D1) | | No per-operator role check outside Settings; peer clearance dropped |
| CD-04 | S1 | FC | RM.1 | OPEN | | Sidecar loopback services trust any local process; no timeouts, caps or logs |
| CD-05 | S2 | FC+torch | RM.3 | OPEN | | Lease stamped in ms, checked in ns: every Console bundle refused StaleLease |
| CD-06 | S2 | FC+crdb | RM.3 | OPEN | | Convergence read carries no delegation; reads the service tenant |
| CD-07 | S2 | FC | RM.3 | OPEN | | No first distribution; Applied To ignored |
| CD-08 | S2 | torch | RM.3 | OPEN | | Installer never provisions the policy lane; rewrites torchd.env |
| CD-09 | S2 | torch | RM.3 | OPEN | | Only allow_ordinary_internet has a host effect; rules never read |
| CD-10 | S2 | FC | RM.4 | OPEN | | Moving or renaming a zone always fails |
| CD-11 | S2 | FC+crdb | RM.2 | OPEN | | Policy ids minted from a request counter that restarts |
| CD-12 | S2 | FC+crdb | RM.2 | OPEN | | Mutations retried after a transport failure or timeout |
| CD-14 | S2 | FC | RM.7 | Partial | | Export sends the 100-row page limit, not the filtered set |
| CD-15 | S2 | crdb+FC | RM.6 | OPEN | | IdAM configure/connect/sync in memory only, unaudited, untiered |
| CD-16 | S2 | crdb+FC | RM.5 | OPEN | | Settings commits are last-writer-wins; no base version |
| CD-17 | S2 | crdb+FC | RM.5 | OPEN | | SOC settings cannot be proposed under dual control; proposals memory-only |
| CD-19 | S2 | crdb | RM.7 | OPEN | | Overview zone grouping is a hard-coded demo |
| CD-20 | S2 | crdb | RM.7 | OPEN | | DETECT_SUMMARY aggregates every tenant |
| CD-21 | S2 | crdb | RM.3 | OPEN | | Floor enforced for zones only, not policies |
| CD-22 | S2 | crdb | RM.3 | OPEN | | No cascades on zone/policy delete, zone rename, object edit |
| CD-23 | S2 | FC | RM.4 | OPEN | | Policy edit traps (zone change, 409 cause, window dropped, rules dropped) |
| CD-24 | S2 | FC | RM.4 | OPEN | | Object/user traps (attributes cleared, draft only, 1970 date, revoked re-activation) |
| CD-25 | S2 | crdb | RM.7 | OPEN | | CONTAIN: all failures Denied; replay returns original; no release verb |
| CD-26 | S2 | FC | RM.9 | OPEN | | Installer [4b] pins a peer the control plane does not read, restarts cdb |
| CD-27 | S2 | FC | RM.9 | OPEN | | Installer re-run rewrites RBAC, OIDC, ports and sidecar config |
| CD-28 | S2 | crdb | RM.9 | OPEN | | SIEM write-back needs a hand-authored boot secret_ref |
| CD-29 | S3 | crdb | RM.5 | Open (D3) | | Turning query_surface.enabled off locks the Console out |
| CD-30 | S3 | FC | RM.7 | OPEN | | No confirm on Modify plan, Generate, Export, Save connector |
| CD-31 | S3 | FC | RM.4 | Partial | | Silent delete/status failures; zone refusal copy misleading |
| CD-32 | S3 | FC | RM.7 | OPEN | | Verdict panels do not refresh after Generate |
| CD-34 | S3 | FC | RM.7 | Partial (D5) | | Isolate offered on every drawer; posture fixed |
| CD-35 | S3 | FC | RM.8 | Open (D2) | | No tenant selector; /auth/me lacks role and tenant; memory-only sessions |
| CD-36 | S3 | FC | RM.8 | OPEN | | Retry after a failed commit clears instead of resending |
| CD-37 | S3 | crdb | RM.5 | OPEN | | Server report shows the boot cadence; embedder row empty |
| CD-38 | S3 | crdb | RM.5 | OPEN | | History has keys only; no diff; 7-day horizon; calibration invisible |
| CD-39 | S3 | torch | RM.9 | Open (D6) | | Endpoint installer hazards (comments, arm64, no renewal, root agents) |
| CD-40 | S3 | FC | RM.9 | OPEN | | Sidecar admin cert has no renewal; uninstall deletes the signing seed |
| CD-42 | S4 | FC | RM.10 | OPEN | | Console docs drift |
| CD-43 | S4 | crdb | RM.10 | OPEN | | Engine Configuration Guide drift, count-gated only |
| CD-44 | S4 | FC | RM.10 | Partial | | Ledger drift (TRDs fixed by the guide work) |
| CD-45 | S3 | FC | RM.8 | OPEN | | Operator copy exposes internal names and plan ids |
| CD-47 | S3 | crdb+FC | RM.5 | OPEN | | Settings version shows the store's latest version, not the config's |
| CD-48 | S3 | crdb | RM.7 | OPEN | | Four object kinds never resolve members |
| CD-49 | S3 | FC | RM.4 | OPEN | | Policy pickers key objects by selector value |
| CD-50 | S4 | FC | RM.8 | OPEN | | Pending drawer sections show internal plan ids |
| CD-53 | S3 | FC | RM.4 | OPEN | | Pickers offer object kinds the engine refuses in that role |
| CD-54 | S3 | crdb | RM.3 | OPEN | | Convergence "Applied" does not mean "in force" |
| CD-57 | S2 | crdb | RM.6 | OPEN | | UI-onboarded connector syncs into the nil tenant |
| CD-58 | S4 | FC | RM.6 | OPEN | | Onboard Auth0 empty state unreachable |
| CD-59 | S3 | FC | RM.7 | OPEN | | Enforcement pill, badge and copy are constants |
| CD-61 | S3 | crdb | RM.7 | OPEN | | LOG_EXPORT and LOG_QUERY read different pools in episode mode |
| CD-62 | S3 | FC | RM.7 | OPEN | | Logs time range has no end bound; `since` goes stale |
| CD-63 | S2 | FC+crdb | RM.7 | OPEN | | Drawer Recent decisions always empty |
| CD-65 | S2 | FC | RM.2 | Open (seen live) | | One slow engine read fails every read queued behind it |

## Decisions

Recorded here as the operator decides them (plan Section 2, D1 to D7).
