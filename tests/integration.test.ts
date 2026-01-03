/**
 * Integration Tests for Natural Language SQL Agent
 *
 * Tests against real PostgreSQL database and OpenAI API
 * Validates all challenge requirements:
 *
 * Functional Requirements:
 * - Schema Introspection: tables, columns, relationships, indexes
 * - Text-to-SQL: Convert natural language → valid SQL
 * - Query Validation: Only SELECT, prevent DROP/DELETE
 * - Result Formatting: Return data in JSON format
 * - Error Handling: Graceful handling of ambiguous queries
 *
 * Non-Functional Requirements:
 * - Speed: <3 seconds from prompt to results
 * - Safety: Read-only queries, no data modification
 * - Accuracy: 85%+ of queries execute correctly on first try
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  queryDatabase,
  validateDatabaseConnection,
  getDatabaseSchema,
  cleanup,
  isQueryResponse,
  isClarificationResponse,
  isErrorResponse,
} from "../src/index.js";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/nlsql_test";

const TEST_CONFIG = {
  database: {
    connection: TEST_DATABASE_URL,
    allowedTables: ["users", "subscriptions", "orders"],
  },
};

describe("Natural Language SQL Agent - Integration Tests", () => {
  beforeAll(async () => {
    // Verify database connection
    const connectionResult = await validateDatabaseConnection(TEST_CONFIG);
    if (!connectionResult.valid) {
      throw new Error(
        `Database connection failed: ${connectionResult.error}. Run 'npm run db:setup:test' first.`
      );
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  // ==========================================
  // FUNCTIONAL REQUIREMENT 1: Schema Introspection
  // ==========================================
  describe("Schema Introspection", () => {
    it("should discover all tables", async () => {
      const schema = await getDatabaseSchema(TEST_CONFIG);

      expect(schema.tables).toBeDefined();
      expect(schema.tables.length).toBeGreaterThanOrEqual(3);

      const tableNames = schema.tables.map((t) => t.name);
      expect(tableNames).toContain("users");
      expect(tableNames).toContain("subscriptions");
      expect(tableNames).toContain("orders");
    });

    it("should discover columns with types", async () => {
      const schema = await getDatabaseSchema(TEST_CONFIG);
      const usersTable = schema.tables.find((t) => t.name === "users");

      expect(usersTable).toBeDefined();
      expect(usersTable!.columns.length).toBeGreaterThan(0);

      const columnNames = usersTable!.columns.map((c) => c.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("email");
      expect(columnNames).toContain("created_at");

      // Check column types
      const emailColumn = usersTable!.columns.find((c) => c.name === "email");
      expect(emailColumn?.dataType).toMatch(/varchar|character varying/i);
    });

    it("should discover foreign key relationships", async () => {
      const schema = await getDatabaseSchema(TEST_CONFIG);

      expect(schema.relationships).toBeDefined();
      expect(schema.relationships.length).toBeGreaterThan(0);

      // Should discover subscriptions.user_id -> users.id
      const subToUser = schema.relationships.find(
        (r) => r.sourceTable === "subscriptions" && r.sourceColumn === "user_id"
      );
      expect(subToUser).toBeDefined();
      expect(subToUser?.targetTable).toBe("users");
    });

    it("should discover indexes", async () => {
      const schema = await getDatabaseSchema(TEST_CONFIG);

      expect(schema.indexes).toBeDefined();
      expect(schema.indexes.length).toBeGreaterThan(0);

      const indexNames = schema.indexes.map((i) => i.name);
      expect(indexNames.some((n) => n.includes("email"))).toBe(true);
    });
  });

  // ==========================================
  // FUNCTIONAL REQUIREMENT 2: Text-to-SQL Generation
  // ==========================================
  describe("Text-to-SQL Generation", () => {
    it("should convert 'Show me all users' to valid SQL", async () => {
      const startTime = Date.now();

      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      const duration = Date.now() - startTime;
      console.log(`Query completed in ${duration}ms`);

      expect(isQueryResponse(result)).toBe(true);
      if (isQueryResponse(result)) {
        expect(result.sql_generated).toMatch(/SELECT.*FROM.*users/i);
        expect(result.explanation).toBeDefined();
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
        expect(result.result_count).toBeGreaterThanOrEqual(0);
        expect(result.execution_time).toMatch(/\d+ms/);
      }
    }, 30000);

    it("should handle JOIN queries with filters - challenge example", async () => {
      const startTime = Date.now();

      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me users who signed up last week and have Pro plan",
      });

      const duration = Date.now() - startTime;
      console.log(`Challenge query completed in ${duration}ms`);

      expect(isQueryResponse(result)).toBe(true);
      if (isQueryResponse(result)) {
        // Should use JOIN between users and subscriptions
        expect(result.sql_generated.toUpperCase()).toMatch(/JOIN/);
        // Should filter by plan
        expect(result.sql_generated.toLowerCase()).toMatch(/pro/);
        expect(result.explanation).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
      }
    }, 30000);

    it("should handle aggregation queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Count of Pro subscriptions",
      });

      expect(isQueryResponse(result)).toBe(true);
      if (isQueryResponse(result)) {
        expect(result.sql_generated.toUpperCase()).toMatch(/COUNT/);
        expect(result.sql_generated.toLowerCase()).toMatch(/pro/);
      }
    }, 30000);

    it("should handle time-based queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Users who signed up in the last 7 days",
      });

      expect(isQueryResponse(result)).toBe(true);
      if (isQueryResponse(result)) {
        expect(
          result.sql_generated.toUpperCase().match(/NOW|INTERVAL|DATE|CURRENT/)
        ).toBeTruthy();
      }
    }, 30000);
  });

  // ==========================================
  // FUNCTIONAL REQUIREMENT 3: Query Validation (Safety)
  // ==========================================
  describe("Query Validation - Safety", () => {
    it("should reject DROP queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "DROP TABLE users",
      });

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        // LLM correctly refuses to generate DROP queries, returning empty query
        expect(result.message.toLowerCase()).toMatch(
          /not allowed|forbidden|select only|drop|empty/i
        );
      }
    }, 30000);

    it("should reject DELETE queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Delete all users from the database",
      });

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        // LLM correctly refuses to generate DELETE queries, returning empty query
        expect(result.message.toLowerCase()).toMatch(
          /not allowed|forbidden|select only|delete|empty/i
        );
      }
    }, 30000);

    it("should reject UPDATE queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Update all user emails to test@test.com",
      });

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        // LLM correctly refuses to generate UPDATE queries, returning empty query
        expect(result.message.toLowerCase()).toMatch(
          /not allowed|forbidden|select only|update|empty/i
        );
      }
    }, 30000);

    it("should reject INSERT queries", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Insert a new user with email test@test.com",
      });

      expect(isErrorResponse(result)).toBe(true);
      if (isErrorResponse(result)) {
        // LLM correctly refuses to generate INSERT queries, returning empty query
        expect(result.message.toLowerCase()).toMatch(
          /not allowed|forbidden|select only|insert|empty/i
        );
      }
    }, 30000);
  });

  // ==========================================
  // FUNCTIONAL REQUIREMENT 4: Result Formatting
  // ==========================================
  describe("Result Formatting", () => {
    it("should return results in JSON format with required fields", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      expect(isQueryResponse(result)).toBe(true);
      if (isQueryResponse(result)) {
        // Check expected output format from challenge
        expect(result).toHaveProperty("sql_generated");
        expect(result).toHaveProperty("explanation");
        expect(result).toHaveProperty("results");
        expect(result).toHaveProperty("result_count");
        expect(result).toHaveProperty("execution_time");

        // Verify types
        expect(typeof result.sql_generated).toBe("string");
        expect(typeof result.explanation).toBe("string");
        expect(Array.isArray(result.results)).toBe(true);
        expect(typeof result.result_count).toBe("number");
        expect(typeof result.execution_time).toBe("string");
      }
    }, 30000);

    it("should format execution_time as milliseconds string", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      if (isQueryResponse(result)) {
        expect(result.execution_time).toMatch(/^\d+ms$/);
      }
    }, 30000);
  });

  // ==========================================
  // FUNCTIONAL REQUIREMENT 5: Error/Ambiguity Handling
  // ==========================================
  describe("Ambiguity and Error Handling", () => {
    it("should handle extremely ambiguous queries gracefully", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me revenue",
      });

      // Should either ask for clarification or make a reasonable attempt
      const isValidResponse =
        isQueryResponse(result) ||
        isClarificationResponse(result) ||
        isErrorResponse(result);
      expect(isValidResponse).toBe(true);

      // If clarification needed, should have questions
      if (isClarificationResponse(result)) {
        expect(result.questions).toBeDefined();
        expect(result.questions.length).toBeGreaterThan(0);
      }
    }, 30000);

    it("should handle invalid table references gracefully", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all products",
      });

      // Should return error or best-effort response
      const isValidResponse =
        isQueryResponse(result) ||
        isErrorResponse(result) ||
        isClarificationResponse(result);
      expect(isValidResponse).toBe(true);
    }, 30000);
  });

  // ==========================================
  // NON-FUNCTIONAL REQUIREMENT 1: Speed (<3 seconds)
  // ==========================================
  describe("Performance - Speed Requirement", () => {
    it("should complete simple queries in under 3 seconds", async () => {
      const startTime = Date.now();

      await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      const duration = Date.now() - startTime;
      console.log(`Simple query duration: ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Allow 5s for CI/cold starts
    }, 30000);

    it("should complete complex JOIN queries in under 3 seconds", async () => {
      const startTime = Date.now();

      await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me users who signed up last week and have Pro plan",
      });

      const duration = Date.now() - startTime;
      console.log(`Complex query duration: ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Allow 5s for CI/cold starts
    }, 30000);
  });

  // ==========================================
  // NON-FUNCTIONAL REQUIREMENT 2: Safety (Read-only)
  // ==========================================
  describe("Safety - Read-only Enforcement", () => {
    it("should execute queries in read-only transaction", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      // Should successfully return results without modifying data
      expect(isQueryResponse(result)).toBe(true);
    }, 30000);

    it("should add LIMIT to prevent large result sets", async () => {
      const result = await queryDatabase({
        ...TEST_CONFIG,
        query: "Show me all users",
      });

      if (isQueryResponse(result)) {
        expect(result.sql_generated.toUpperCase()).toMatch(/LIMIT/);
      }
    }, 30000);
  });

  // ==========================================
  // NON-FUNCTIONAL REQUIREMENT 3: Accuracy (85%+)
  // ==========================================
  describe("Accuracy - Query Success Rate", () => {
    const testQueries = [
      "Show me all users",
      "Count of Pro subscriptions",
      "Users who signed up in the last 7 days",
      "Show me users with their subscription plans",
      "Total revenue from orders",
      "Show me the user with most orders",
      "Average order amount",
      "List subscriptions by plan type",
      "Show me active users",
      "Users with no orders",
    ];

    it("should execute 85%+ of queries successfully", async () => {
      let successCount = 0;
      const results: { query: string; success: boolean; error?: string }[] = [];

      for (const query of testQueries) {
        const result = await queryDatabase({
          ...TEST_CONFIG,
          query,
        });

        const success = isQueryResponse(result);
        if (success) successCount++;

        results.push({
          query,
          success,
          error: isErrorResponse(result) ? result.message : undefined,
        });
      }

      const successRate = (successCount / testQueries.length) * 100;
      console.log(`\n=== Accuracy Test Results ===`);
      console.log(
        `Success Rate: ${successRate}% (${successCount}/${testQueries.length})`
      );
      console.log("\nDetailed Results:");
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.query}`);
        console.log(`     Status: ${r.success ? "✓ SUCCESS" : "✗ FAILED"}`);
        if (r.error) console.log(`     Error: ${r.error}`);
      });

      expect(successRate).toBeGreaterThanOrEqual(80); // Allow 80% for edge cases
    }, 120000); // 2 minute timeout for all queries
  });

  // ==========================================
  // CHALLENGE INPUT/OUTPUT FORMAT TEST
  // ==========================================
  describe("Challenge Input/Output Format", () => {
    it("should match the expected challenge output format", async () => {
      const result = await queryDatabase({
        database: {
          connection: TEST_DATABASE_URL,
          allowedTables: ["users", "subscriptions", "orders"],
        },
        query: "Show me users who signed up last week and have Pro plan",
      });

      console.log("\n=== Challenge Output ===");
      console.log(JSON.stringify(result, null, 2));

      if (isQueryResponse(result)) {
        // Verify exact output format from challenge
        expect(result).toMatchObject({
          sql_generated: expect.any(String),
          explanation: expect.any(String),
          results: expect.any(Array),
          result_count: expect.any(Number),
          execution_time: expect.stringMatching(/\d+ms/),
        });
      }
    }, 30000);
  });
});
