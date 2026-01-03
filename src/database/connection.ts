import pg from "pg";
import type { DatabaseConfig } from "../types/index.js";

const { Pool } = pg;

/**
 * Connection pool cache to reuse connections
 */
const poolCache = new Map<string, pg.Pool>();

/**
 * Creates or retrieves a PostgreSQL connection pool
 */
export function getPool(config: DatabaseConfig): pg.Pool {
  const cacheKey = config.connection;

  if (poolCache.has(cacheKey)) {
    return poolCache.get(cacheKey)!;
  }

  const pool = new Pool({
    connectionString: config.connection,
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection not established
  });

  // Handle pool errors
  pool.on("error", (err) => {
    console.error("Unexpected error on idle client", err);
  });

  poolCache.set(cacheKey, pool);
  return pool;
}

/**
 * Executes a read-only query with timeout
 */
export async function executeQuery<T extends Record<string, unknown>>(
  pool: pg.Pool,
  sql: string,
  params: unknown[] = [],
  timeoutMs: number = 30000
): Promise<{ rows: T[]; executionTime: number }> {
  const startTime = performance.now();

  const client = await pool.connect();

  try {
    // Set statement timeout
    await client.query(`SET statement_timeout = ${timeoutMs}`);

    // Execute in read-only transaction
    await client.query("BEGIN READ ONLY");

    const result = await client.query<T>(sql, params);

    await client.query("COMMIT");

    const executionTime = performance.now() - startTime;

    return {
      rows: result.rows,
      executionTime,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Closes a specific connection pool
 */
export async function closePool(connectionString: string): Promise<void> {
  const pool = poolCache.get(connectionString);
  if (pool) {
    await pool.end();
    poolCache.delete(connectionString);
  }
}

/**
 * Closes all connection pools
 */
export async function closeAllPools(): Promise<void> {
  const closePromises = Array.from(poolCache.values()).map((pool) =>
    pool.end()
  );
  await Promise.all(closePromises);
  poolCache.clear();
}

/**
 * Tests database connection
 */
export async function testConnection(config: DatabaseConfig): Promise<boolean> {
  const pool = getPool(config);

  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch (error) {
    return false;
  }
}
