// apps/bff/test/no-second-db.test.ts -- F0.3 proof of INV-CONSOLE-NO-2ND-DB.
//
// The BFF persists no durable domain data: Crucible is the sole system of record. This is enforced
// structurally -- the BFF declares no database / ORM / external-store dependency, and ships no migrations.
// Its only state is the in-memory EphemeralCache (bounded, short-TTL, non-authoritative).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Durable stores / ORMs / migration tools a domain database would pull in.
const FORBIDDEN = [
  'pg',
  'mysql',
  'mysql2',
  'sqlite3',
  'better-sqlite3',
  'mongodb',
  'mongoose',
  'typeorm',
  'prisma',
  '@prisma/client',
  'sequelize',
  'knex',
  'drizzle-orm',
  'redis',
  'ioredis',
  'level',
  'lmdb',
];

describe('INV-CONSOLE-NO-2ND-DB', () => {
  const pkg = JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);

  it('declares no database / ORM / external-store dependency', () => {
    const offenders = FORBIDDEN.filter((name) => declared.has(name));
    expect(offenders).toEqual([]);
  });

  it('ships no migrations directory (no durable schema to migrate)', () => {
    expect(existsSync(join(appDir, 'migrations'))).toBe(false);
    expect(existsSync(join(appDir, 'src', 'migrations'))).toBe(false);
  });
});
