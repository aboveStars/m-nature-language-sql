import type { Schema, CachedSchema, DatabaseConfig } from "../types/index.js";
import { introspectSchema } from "../database/introspector.js";

/**
 * Schema cache with TTL support
 */
const schemaCache = new Map<string, CachedSchema>();

/** Default cache TTL: 5 minutes */
const DEFAULT_TTL_MS = 5 * 60 * 1000;

/**
 * Gets schema from cache or introspects if cache is stale
 */
export async function getCachedSchema(
  config: DatabaseConfig,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<Schema> {
  const cacheKey = getCacheKey(config);
  const cached = schemaCache.get(cacheKey);

  if (cached && !isCacheExpired(cached)) {
    return cached.schema;
  }

  // Cache miss or expired - introspect schema
  const schema = await introspectSchema(config, config.allowedTables);

  schemaCache.set(cacheKey, {
    schema,
    cachedAt: new Date(),
    ttlMs,
  });

  return schema;
}

/**
 * Forces a cache refresh
 */
export async function refreshSchemaCache(
  config: DatabaseConfig,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<Schema> {
  const cacheKey = getCacheKey(config);
  schemaCache.delete(cacheKey);
  return getCachedSchema(config, ttlMs);
}

/**
 * Clears schema cache for a specific connection
 */
export function clearSchemaCache(config: DatabaseConfig): void {
  const cacheKey = getCacheKey(config);
  schemaCache.delete(cacheKey);
}

/**
 * Clears all cached schemas
 */
export function clearAllSchemaCache(): void {
  schemaCache.clear();
}

/**
 * Gets cache key from config
 */
function getCacheKey(config: DatabaseConfig): string {
  const tables = config.allowedTables?.sort().join(",") || "all";
  return `${config.connection}:${tables}`;
}

/**
 * Checks if cache entry is expired
 */
function isCacheExpired(cached: CachedSchema): boolean {
  const now = Date.now();
  const cachedTime = cached.cachedAt.getTime();
  return now - cachedTime > cached.ttlMs;
}
