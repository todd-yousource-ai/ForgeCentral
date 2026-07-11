import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { serveSpa } from '../src/static.js';

/** A minimal ServerResponse capturing the status/headers/body a handler wrote. */
interface CapturedResponse {
  status?: number;
  headers?: Record<string, string | number>;
  body?: Buffer;
}
function mockRes(captured: CapturedResponse): ServerResponse {
  return {
    writeHead(status: number, headers: Record<string, string | number>) {
      captured.status = status;
      captured.headers = headers;
      return this;
    },
    end(body?: Buffer) {
      if (body !== undefined) captured.body = body;
      return this;
    },
  } as unknown as ServerResponse;
}

describe('serveSpa (the admin-plane UI enabler)', () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'fc-spa-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Console</title>');
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'assets', 'app.js'), 'export const x = 1;');
  });
  afterAll(async () => {
    // Best-effort temp cleanup is not required for correctness; the OS reclaims tmpdir.
  });

  it('serves a concrete asset with its content type', async () => {
    const captured: CapturedResponse = {};
    const handled = await serveSpa(dir, '/assets/app.js', mockRes(captured));
    expect(handled).toBe(true);
    expect(captured.status).toBe(200);
    expect(captured.headers?.['content-type']).toBe('text/javascript; charset=utf-8');
    expect(captured.body?.toString()).toBe('export const x = 1;');
  });

  it('falls back to index.html for a client-side route (no extension)', async () => {
    const captured: CapturedResponse = {};
    const handled = await serveSpa(dir, '/overview', mockRes(captured));
    expect(handled).toBe(true);
    expect(captured.status).toBe(200);
    expect(captured.headers?.['content-type']).toBe('text/html; charset=utf-8');
    expect(captured.body?.toString()).toContain('<title>Console</title>');
  });

  it('serves index.html at the root', async () => {
    const captured: CapturedResponse = {};
    const handled = await serveSpa(dir, '/', mockRes(captured));
    expect(handled).toBe(true);
    expect(captured.body?.toString()).toContain('Console');
  });

  it('does NOT fall back for a missing asset (caller 404s)', async () => {
    const captured: CapturedResponse = {};
    const handled = await serveSpa(dir, '/assets/missing.js', mockRes(captured));
    expect(handled).toBe(false);
    expect(captured.status).toBeUndefined();
  });

  it('refuses path traversal (403)', async () => {
    const captured: CapturedResponse = {};
    const handled = await serveSpa(dir, '/../../etc/passwd', mockRes(captured));
    expect(handled).toBe(true);
    expect(captured.status).toBe(403);
  });
});
