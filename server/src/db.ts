import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// node-postgres hands back NUMERIC as a string to avoid silent float precision loss.
// Every NUMERIC in this schema is a bounded confidence score, so a float is exact enough
// and saves every caller from parsing.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number.parseFloat(value));

export type Database = pg.Pool;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    // Hosted Postgres (Neon, Render, Fly) terminates TLS with certificates that are not
    // in Node's trust store. Local development uses no TLS at all.
    ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (error) => {
    console.error('Unexpected error on idle Postgres client', error);
  });

  return pool;
}

export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: pg.Pool | pg.PoolClient = getPool(),
): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
  client: pg.Pool | pg.PoolClient = getPool(),
): Promise<T | null> {
  const rows = await query<T>(text, params, client);
  return rows[0] ?? null;
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
