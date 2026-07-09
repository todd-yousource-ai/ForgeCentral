// packages/wire/src/socket-transport.ts -- the stream/mTLS frame transport (F0.3b-3b).
//
// `StreamFrameTransport` carries wire frames over any Node duplex byte stream (a `tls.TLSSocket`, a
// `net.Socket`, or an in-memory duplex in tests). It buffers inbound bytes and reassembles whole frames
// across chunk boundaries (a 16-byte header then `payloadLen` bytes), and serializes outbound frames.
// `connectTls` dials the engine over mutually-authenticated TLS and returns a ready transport. This is the
// concrete `FrameTransport` behind the handshake and the (F0.3b-3b-live) operation dispatch.

import { connect as tlsConnect } from 'node:tls';
import type { Duplex } from 'node:stream';

import { HEADER_LEN, decodeHeader, encodeFrame } from './frame.js';
import {
  type FrameTransport,
  type OutboundFrame,
  type WireFrame,
  WireProtocolError,
  outboundHeader,
} from './transport.js';

/** A frame transport over a Node duplex byte stream, reassembling frames across chunk boundaries. */
export class StreamFrameTransport implements FrameTransport {
  private buffer = new Uint8Array(0);
  private readonly ready: WireFrame[] = [];
  private readonly waiters: Array<{
    resolve: (frame: WireFrame) => void;
    reject: (error: Error) => void;
  }> = [];
  private failure: Error | null = null;

  constructor(private readonly stream: Duplex) {
    stream.on('data', (chunk: Buffer) => {
      this.append(chunk);
    });
    stream.on('error', (error: Error) => {
      this.fail(error);
    });
    stream.on('close', () => {
      this.fail(new WireProtocolError('wire stream closed'));
    });
    stream.on('end', () => {
      this.fail(new WireProtocolError('wire stream ended'));
    });
  }

  private append(chunk: Uint8Array): void {
    const combined = new Uint8Array(this.buffer.length + chunk.length);
    combined.set(this.buffer);
    combined.set(chunk, this.buffer.length);
    this.buffer = combined;
    this.parse();
  }

  private parse(): void {
    while (this.buffer.length >= HEADER_LEN) {
      const header = decodeHeader(this.buffer);
      const total = HEADER_LEN + header.payloadLen;
      if (this.buffer.length < total) break; // the payload has not fully arrived yet
      const payload = this.buffer.slice(HEADER_LEN, total);
      this.buffer = this.buffer.slice(total);
      const frame: WireFrame = { header, payload };
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(frame);
      else this.ready.push(frame);
    }
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    while (this.waiters.length > 0) this.waiters.shift()?.reject(error);
  }

  send(frame: OutboundFrame): Promise<void> {
    if (this.failure) return Promise.reject(this.failure);
    const bytes = encodeFrame(outboundHeader(frame), frame.payload);
    return new Promise((resolve, reject) => {
      this.stream.write(bytes, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  recv(): Promise<WireFrame> {
    const queued = this.ready.shift();
    if (queued) return Promise.resolve(queued);
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.stream.end(() => {
        resolve();
      });
    });
  }
}

/** mTLS dial options for the engine wire port. */
export interface WireTlsOptions {
  readonly host: string;
  readonly port: number;
  /** The CA that signs the engine's server certificate (the wire CA). */
  readonly ca: string | Buffer;
  /** The BFF's own enrolled client certificate (presented for mutual auth). */
  readonly cert: string | Buffer;
  /** The BFF client private key. */
  readonly key: string | Buffer;
  /** The name to verify in the server certificate (defaults to `host`). */
  readonly servername?: string;
}

/**
 * Dial the engine over mutually-authenticated TLS and return a ready `StreamFrameTransport`. The server
 * is verified against `ca` (never disabled); the client presents `cert`/`key` for mutual auth.
 */
export function connectTls(options: WireTlsOptions): Promise<StreamFrameTransport> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      {
        host: options.host,
        port: options.port,
        ca: options.ca,
        cert: options.cert,
        key: options.key,
        servername: options.servername ?? options.host,
        rejectUnauthorized: true,
      },
      () => {
        resolve(new StreamFrameTransport(socket));
      },
    );
    socket.once('error', reject);
  });
}
