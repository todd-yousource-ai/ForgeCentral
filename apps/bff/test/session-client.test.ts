// apps/bff/test/session-client.test.ts -- IP-CONSOLE-11 ST.5b the sidecar admin-session lookup.

import { connect, createServer, type Server, type Socket } from 'node:net';
import { createServer as createHttpServer } from 'node:http';

import { afterEach, describe, expect, it } from 'vitest';

import { SessionLookupError, lookupSessionGroup } from '../src/engine/session-client.js';

const servers: Server[] = [];
const sockets: Socket[] = [];

/** Track a server so teardown can close it and destroy every connection it accepted. */
function tracked(server: Server): Server {
  server.on('connection', (socket: Socket) => sockets.push(socket));
  servers.push(server);
  return server;
}

/** A fake sidecar lookup: answers every request line with `reply(port)`, recording the ports asked. */
async function fakeSidecar(reply: (port: number) => string, asked: number[] = []): Promise<number> {
  const server = tracked(
    createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const newline = buffer.indexOf('\n');
        if (newline < 0) return;
        const { port } = JSON.parse(buffer.slice(0, newline)) as { port: number };
        asked.push(port);
        socket.write(`${reply(port)}\n`);
      });
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no address');
  return address.port;
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
});

describe('the admin-session lookup client (ST.5b)', () => {
  it('asks by the given port and returns the group, or null for no live tunnel', async () => {
    const asked: number[] = [];
    const port = await fakeSidecar(
      (p) => (p === 50001 ? '{"group":"X25519MLKEM768"}' : '{"group":null}'),
      asked,
    );
    expect(await lookupSessionGroup('127.0.0.1', port, 50001, 1000)).toBe('X25519MLKEM768');
    expect(await lookupSessionGroup('127.0.0.1', port, 50002, 1000)).toBeNull();
    expect(asked).toEqual([50001, 50002]);
  });

  it('fails closed on a refusal, a garbled line, a closed socket and a timeout', async () => {
    const refusing = await fakeSidecar(() => '{"error":"malformed lookup"}');
    await expect(lookupSessionGroup('127.0.0.1', refusing, 1, 1000)).rejects.toBeInstanceOf(
      SessionLookupError,
    );
    const garbled = await fakeSidecar(() => 'not json');
    await expect(lookupSessionGroup('127.0.0.1', garbled, 1, 1000)).rejects.toBeInstanceOf(
      SessionLookupError,
    );
    const silent = tracked(createServer(() => undefined));
    await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
    const address = silent.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    await expect(lookupSessionGroup('127.0.0.1', address.port, 1, 50)).rejects.toThrow(/timeout/);
  });

  it("uses the HTTP request's own remote port (what the tunnel's source port is)", async () => {
    // The route passes `req.socket.remotePort`; prove that is the CLIENT's local port on loopback,
    // i.e. exactly the port the sidecar registered for its upstream connection.
    const seen: number[] = [];
    const http = createHttpServer((req, res) => {
      seen.push(req.socket.remotePort ?? -1);
      res.end('ok');
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const address = http.address();
    if (address === null || typeof address === 'string') throw new Error('no address');
    const socket = connect({ host: '127.0.0.1', port: address.port });
    socket.resume();
    await new Promise<void>((resolve) => socket.on('connect', resolve));
    const localPort = socket.localPort;
    socket.write('GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    await new Promise<void>((resolve) => socket.on('close', () => resolve()));
    await new Promise<void>((r) => http.close(() => r()));
    expect(seen).toEqual([localPort]);
  });
});
