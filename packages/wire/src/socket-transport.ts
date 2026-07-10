// packages/wire/src/socket-transport.ts -- the stream/mTLS frame transport (F0.3b-3b).
//
// `StreamFrameTransport` carries wire frames over any Node duplex byte stream (a `net.Socket` or an
// in-memory duplex in tests). It buffers inbound bytes and reassembles whole frames across chunk
// boundaries (a 16-byte header then `payloadLen` bytes), and serializes outbound frames. `connectLoopback`
// dials the AWS-LC crypto sidecar's egress over a plaintext LOOPBACK socket and returns a ready transport;
// the sidecar originates the mTLS to the engine (IP-CONSOLE-00-CRYPTO-SIDECAR). Node performs no TLS
// (INV-CONSOLE-CRYPTO-AWSLC). This is the concrete `FrameTransport` behind the handshake and dispatch.

import { connect as netConnect } from 'node:net';
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

/** Loopback dial options for the AWS-LC sidecar's egress port. */
export interface WireLoopbackOptions {
  /** The loopback host of the sidecar egress (`127.0.0.1`/`::1`). */
  readonly host: string;
  /** The sidecar egress port. */
  readonly port: number;
}

/**
 * Dial the crypto sidecar's egress over a plaintext loopback socket and return a ready
 * `StreamFrameTransport`. The sidecar originates the mTLS to the engine on `:7878` (the Console performs no
 * TLS in Node; INV-CONSOLE-CRYPTO-AWSLC). The hop is loopback only, never a routable interface, so no
 * plaintext wire traffic leaves the host.
 */
export function connectLoopback(options: WireLoopbackOptions): Promise<StreamFrameTransport> {
  return new Promise((resolve, reject) => {
    const socket = netConnect({ host: options.host, port: options.port }, () => {
      resolve(new StreamFrameTransport(socket));
    });
    socket.once('error', reject);
  });
}
