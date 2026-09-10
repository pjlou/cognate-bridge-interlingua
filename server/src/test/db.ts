import path from 'node:path';
import { fileURLToPath } from 'node:url';
import runner from 'node-pg-migrate';
import { closePool, getPool } from '../db.js';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Integration tests need a real Postgres. Rather than fail the whole suite on a machine
 * that has none, they are skipped when TEST_DATABASE_URL is unset -- the unit tests for
 * the scheduler, the rule engine and the parsers still run everywhere.
 */
export const hasTestDatabase = Boolean(process.env.TEST_DATABASE_URL);

let migrated = false;

export async function migrateTestDatabase(): Promise<void> {
  if (migrated) return;
  // Driving the migrator in-process rather than shelling out to the CLI: spawning the
  // npx .cmd shim fails with EINVAL on Windows under current Node versions.
  await runner({
    databaseUrl: process.env.TEST_DATABASE_URL!,
    dir: path.join(serverRoot, 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
  migrated = true;
}

/** Empties every content and user table, leaving the schema in place. */
export async function truncateAll(): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> 'pgmigrations'`,
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"${row.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}

export async function teardown(): Promise<void> {
  await closePool();
}
