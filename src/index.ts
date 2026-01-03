import "dotenv/config";
import type { QueryRequest, AgentResponse } from "./types/index.js";
import {
  processQuery,
  processQueryWithClarification,
  validateConnection,
  getSchemaInfo,
  isErrorResponse,
  isClarificationResponse,
  isQueryResponse,
} from "./orchestrator/query-orchestrator.js";
import { closeAllPools } from "./database/connection.js";
import { clearAllSchemaCache } from "./cache/schema-cache.js";

/**
 * Natural Language SQL Agent
 *
 * Converts natural language queries into SQL and executes them against PostgreSQL databases.
 *
 * @example
 * ```typescript
 * import { queryDatabase } from 'natural-language-sql';
 *
 * const result = await queryDatabase({
 *   database: {
 *     connection: 'postgres://user:pass@localhost:5432/mydb',
 *     allowedTables: ['users', 'orders']
 *   },
 *   query: 'Show me users who signed up last week'
 * });
 * ```
 */

/**
 * Main entry point - processes a natural language query
 */
export async function queryDatabase(
  request: QueryRequest
): Promise<AgentResponse> {
  return processQuery(request);
}

/**
 * Processes a query with additional clarification
 */
export async function queryWithClarification(
  request: QueryRequest,
  clarification: string
): Promise<AgentResponse> {
  return processQueryWithClarification(request, clarification);
}

/**
 * Validates database connection and returns schema info
 */
export async function validateDatabaseConnection(
  request: Pick<QueryRequest, "database">
): Promise<{ valid: boolean; error?: string }> {
  const result = await validateConnection(request);
  return {
    valid: result.valid,
    error: result.error,
  };
}

/**
 * Gets database schema information
 */
export async function getDatabaseSchema(
  request: Pick<QueryRequest, "database">
) {
  return getSchemaInfo(request);
}

/**
 * Cleanup function - closes all connections
 */
export async function cleanup(): Promise<void> {
  await closeAllPools();
  clearAllSchemaCache();
}

// Re-export type guards for convenience
export { isErrorResponse, isClarificationResponse, isQueryResponse };

// Re-export types
export type {
  QueryRequest,
  QueryResponse,
  ClarificationResponse,
  ErrorResponse,
  AgentResponse,
  DatabaseConfig,
  Schema,
} from "./types/index.js";

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const exampleRequest: QueryRequest = {
    database: {
      connection: process.env.DATABASE_URL || "postgres://localhost:5432/test",
    },
    query: process.argv[2] || "Show me all tables",
  };

  console.log("Processing query:", exampleRequest.query);

  queryDatabase(exampleRequest)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(console.error)
    .finally(cleanup);
}
