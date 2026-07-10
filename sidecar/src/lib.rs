//! The Console AWS-LC crypto sidecar (IP-CONSOLE-00-CRYPTO-SIDECAR).
//!
//! A standalone Console-owned process that terminates the admin-plane TLS and originates the engine mTLS
//! on the platform's AWS-LC module (`rustls` + `aws-lc-rs`), so the Node BFF performs no TLS
//! (INV-CONSOLE-CRYPTO-AWSLC). This crate is built incrementally:
//!
//! - CS.1 (here): the fail-closed configuration + the node-IP bind guard + the loopback-hop guard.
//! - CS.2: the inbound admin terminator (hybrid PQC X25519MLKEM768 + P-384 CNSA-1.0 floor, server-auth).
//! - CS.3: the outbound engine originator (the crdb `cdb-mtls` client profile).
//!
//! The Node BFF speaks plaintext loopback to this sidecar in both directions; nothing that leaves the host
//! is unencrypted.

pub mod bind;
pub mod config;
