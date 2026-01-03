import { describe, it, expect } from "vitest";
import { checkAmbiguity } from "../src/agents/ambiguity-handler.js";
import type { Schema } from "../src/types/index.js";

// Mock schema for testing
const mockSchema: Schema = {
  tables: [
    {
      name: "users",
      columns: [
        {
          name: "id",
          dataType: "integer",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
        {
          name: "email",
          dataType: "varchar",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
        {
          name: "created_at",
          dataType: "timestamp",
          isNullable: false,
          defaultValue: "now()",
          isPrimaryKey: false,
        },
        {
          name: "status",
          dataType: "varchar",
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
        },
      ],
      primaryKeys: ["id"],
    },
    {
      name: "orders",
      columns: [
        {
          name: "id",
          dataType: "integer",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
        {
          name: "user_id",
          dataType: "integer",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
        {
          name: "total_amount",
          dataType: "numeric",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
        {
          name: "status",
          dataType: "varchar",
          isNullable: true,
          defaultValue: null,
          isPrimaryKey: false,
        },
      ],
      primaryKeys: ["id"],
    },
    {
      name: "subscriptions",
      columns: [
        {
          name: "id",
          dataType: "integer",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: true,
        },
        {
          name: "user_id",
          dataType: "integer",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
        {
          name: "mrr",
          dataType: "numeric",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
        {
          name: "plan",
          dataType: "varchar",
          isNullable: false,
          defaultValue: null,
          isPrimaryKey: false,
        },
      ],
      primaryKeys: ["id"],
    },
  ],
  relationships: [
    {
      sourceTable: "orders",
      sourceColumn: "user_id",
      targetTable: "users",
      targetColumn: "id",
    },
    {
      sourceTable: "subscriptions",
      sourceColumn: "user_id",
      targetTable: "users",
      targetColumn: "id",
    },
  ],
  indexes: [],
  introspectedAt: new Date(),
};

describe("Ambiguity Handler", () => {
  describe("checkAmbiguity", () => {
    it("detects revenue query ambiguity with multiple sources", () => {
      const result = checkAmbiguity("Show me revenue", mockSchema);
      expect(result.isAmbiguous).toBe(true);
      expect(result.ambiguityTypes).toContain("revenue");
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it("detects time-related ambiguity", () => {
      const result = checkAmbiguity("Show me recent signups", mockSchema);
      expect(result.isAmbiguous).toBe(true);
      expect(result.ambiguityTypes).toContain("time");
    });

    it('detects ambiguity with "last" without specifics', () => {
      const result = checkAmbiguity("Show me last users", mockSchema);
      expect(result.isAmbiguous).toBe(true);
      expect(result.ambiguityTypes).toContain("time");
    });

    it("does not flag specific queries as ambiguous", () => {
      const result = checkAmbiguity(
        "Show me users who signed up in the last 7 days with Pro plan",
        mockSchema
      );
      // This is specific enough that it shouldn't have many questions
      expect(result.questions.length).toBeLessThanOrEqual(2);
    });

    it("detects column ambiguity for status across tables", () => {
      const result = checkAmbiguity("Filter by status", mockSchema);
      expect(result.ambiguityTypes).toContain("column");
      expect(result.questions.some((q) => q.includes("status"))).toBe(true);
    });

    it("handles clear queries without ambiguity", () => {
      const result = checkAmbiguity(
        "SELECT all users where email contains gmail with limit 10",
        mockSchema
      );
      // Should have minimal ambiguity
      expect(result.questions.length).toBeLessThanOrEqual(1);
    });
  });
});
