// The engine build identity as the Settings reports carry it (crdb IP-AISOC-DETECT-EVOLVE A.1 / A.1b).
import { describe, expect, it } from 'vitest';

import { parseEngineBuild, toSettingsReportsView } from '../src/settings.js';
import type { WireSettingsReports } from '../src/generated/wire-dto.js';

const SHA1 = '3bd23114e0af4aff60f52f15fdbef3ad7b052053';
const SHA256 = 'a'.repeat(64);

describe('parseEngineBuild (the ServerReport.version contract, crdb cdb-build-id)', () => {
  it('reads a bare commit id as a clean build', () => {
    expect(parseEngineBuild(SHA1)).toEqual({ kind: 'commit', commit: SHA1, dirty: false });
  });

  it('reads the -dirty suffix as a build with uncommitted changes', () => {
    expect(parseEngineBuild(`${SHA1}-dirty`)).toEqual({
      kind: 'commit',
      commit: SHA1,
      dirty: true,
    });
  });

  it('accepts a SHA-256 object-format commit id', () => {
    expect(parseEngineBuild(SHA256)).toEqual({ kind: 'commit', commit: SHA256, dirty: false });
  });

  it.each([
    ['0.0.0', 'a pre-A.1 engine reports its package version'],
    ['unknown', 'a build outside a git checkout'],
    ['unknown-dirty', 'the same, with the dirty suffix'],
    [SHA1.slice(0, 12), 'a short id is not a full commit'],
    [SHA1.toUpperCase(), 'git emits lowercase hex only'],
    [`${SHA1}-modified`, 'an unknown suffix'],
    ['', 'an empty version'],
  ])('reads %j as unstamped (%s), never as a commit', (version) => {
    expect(parseEngineBuild(version)).toEqual({ kind: 'unstamped', reported: version });
  });
});

const reports = (server: WireSettingsReports['server']): WireSettingsReports => ({
  admin_plane: true,
  refused: false,
  ...(server === undefined ? {} : { server }),
});

const SERVER = {
  shards: 1,
  serving: true,
  durable: true,
  maintenance_enabled: true,
  maintenance_cadence_secs: 60,
  max_payload: 65_536,
  version: `${SHA1}-dirty`,
};

describe('toSettingsReportsView server build (A.1b)', () => {
  it('carries the parsed build and the engine build time', () => {
    const view = toSettingsReportsView(reports({ ...SERVER, build_time_unix: 1_790_393_113 }));
    expect(view?.server?.version).toBe(`${SHA1}-dirty`);
    expect(view?.server?.build).toEqual({ kind: 'commit', commit: SHA1, dirty: true });
    expect(view?.server?.builtAtUnix).toBe(1_790_393_113);
  });

  it('reads an engine that sends no build time (pre-A.1) as null, not the epoch', () => {
    const view = toSettingsReportsView(reports({ ...SERVER, version: '0.0.0' }));
    expect(view?.server?.builtAtUnix).toBeNull();
    expect(view?.server?.build).toEqual({ kind: 'unstamped', reported: '0.0.0' });
  });
});
