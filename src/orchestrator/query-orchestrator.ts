import type {
  QueryRequest,
  QueryResponse,
  ClarificationResponse,
  ErrorResponse,
  AgentResponse,
  QueryMetrics,
  Schema,
} from "../types/index.js";
import { getPool, executeQuery } from "../database/connection.js";
import { getCachedSchema } from "../cache/schema-cache.js";
import { generateSQL } from "../agents/sql-generator.js";
import { validateQuery, sanitizeQuery } from "../agents/validator.js";
import {
  checkAmbiguity,
  buildClarificationResponse,
} from "../agents/ambiguity-handler.js";

/**
 * Main orchestrator for processing natural language queries
 */
export async function processQuery(
  request: QueryRequest
): Promise<AgentResponse> {
  const metrics: Partial<QueryMetrics> = {};
  const startTime = performance.now();

  try {
    // Step 1: Get cached schema
    const schemaStart = performance.now();
    const schema = await getCachedSchema(request.database);
    metrics.schemaIntrospectionMs = performance.now() - schemaStart;

    // Step 2: Check for ambiguity (optional - can be skipped by LLM handling)
    const ambiguityResult = checkAmbiguity(request.query, schema);

    // If highly ambiguous with multiple questions, ask for clarification
    if (ambiguityResult.isAmbiguous && ambiguityResult.questions.length > 2) {
      return buildClarificationResponse(ambiguityResult.questions);
    }

    // Step 3: Generate SQL using LLM
    const genStart = performance.now();
    const sqlResult = await generateSQL(request.query, schema);
    metrics.sqlGenerationMs = performance.now() - genStart;

    // If LLM reports ambiguity, return clarification request
    if (sqlResult.isAmbiguous && sqlResult.clarifyingQuestions?.length) {
      return buildClarificationResponse(sqlResult.clarifyingQuestions);
    }

    // Step 4: Validate the generated SQL
    const validateStart = performance.now();
    const validation = validateQuery(sqlResult.sql);
    metrics.validationMs = performance.now() - validateStart;

    if (!validation.valid) {
      return {
        error: true,
        message: validation.error || "Query validation failed",
        original_query: request.query,
      };
    }

    // Sanitize query (add LIMIT if missing)
    const safeSql = sanitizeQuery(sqlResult.sql);

    // Step 5: Execute query
    const execStart = performance.now();
    const pool = getPool(request.database);
    const { rows, executionTime } = await executeQuery<Record<string, unknown>>(
      pool,
      safeSql
    );
    metrics.executionMs = performance.now() - execStart;

    // Calculate total time
    metrics.totalMs = performance.now() - startTime;

    // Step 6: Build response (matching challenge output format)
    const response: QueryResponse = {
      sql_generated: safeSql,
      explanation: sqlResult.explanation,
      results: rows,
      result_count: rows.length,
      execution_time: `${Math.round(executionTime)}ms`,
    };

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      error: true,
      message: errorMessage,
      original_query: request.query,
    };
  }
}

/**
 * Processes a query with a clarification response
 */
export async function processQueryWithClarification(
  request: QueryRequest,
  clarification: string
): Promise<AgentResponse> {
  // Combine original query with clarification
  const enhancedQuery = `${request.query}. Additional context: ${clarification}`;

  return processQuery({
    ...request,
    query: enhancedQuery,
  });
}

/**
 * Validates a database connection
 */
export async function validateConnection(
  request: Pick<QueryRequest, "database">
): Promise<{ valid: boolean; error?: string; schema?: Schema }> {
  try {
    const schema = await getCachedSchema(request.database);

    if (schema.tables.length === 0) {
      return {
        valid: false,
        error: "No tables found in database",
      };
    }

    return {
      valid: true,
      schema,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

/**
 * Gets schema information for a database
 */
export async function getSchemaInfo(
  request: Pick<QueryRequest, "database">
): Promise<Schema> {
  return getCachedSchema(request.database);
}

/**
 * Helper to check if response is an error
 */
export function isErrorResponse(
  response: AgentResponse
): response is ErrorResponse {
  return "error" in response && response.error === true;
}

/**
 * Helper to check if response needs clarification
 */
export function isClarificationResponse(
  response: AgentResponse
): response is ClarificationResponse {
  return (
    "needs_clarification" in response && response.needs_clarification === true
  );
}

/**
 * Helper to check if response is successful
 */
export function isQueryResponse(
  response: AgentResponse
): response is QueryResponse {
  return "sql_generated" in response;
}
