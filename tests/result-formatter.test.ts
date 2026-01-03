import { describe, it, expect } from "vitest";
import { formatResults } from "../src/formatters/result-formatter.js";

describe("Result Formatter", () => {
  const sampleRows = [
    {
      id: 1,
      email: "alice@example.com",
      created_at: "2024-01-20",
      plan: "pro",
    },
    { id: 2, email: "bob@example.com", created_at: "2024-01-21", plan: "pro" },
  ];

  describe("JSON format", () => {
    it("formats results as pretty JSON", () => {
      const result = formatResults(sampleRows, "json");
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(sampleRows);
    });

    it("handles empty results", () => {
      const result = formatResults([], "json");
      expect(result).toBe("[]");
    });

    it("handles null values", () => {
      const rowsWithNull = [{ id: 1, email: null }];
      const result = formatResults(rowsWithNull, "json");
      const parsed = JSON.parse(result);
      expect(parsed[0].email).toBeNull();
    });
  });

  describe("CSV format", () => {
    it("formats results as CSV", () => {
      const result = formatResults(sampleRows, "csv");
      const lines = result.split("\n");
      expect(lines[0]).toBe("id,email,created_at,plan");
      expect(lines[1]).toBe("1,alice@example.com,2024-01-20,pro");
      expect(lines[2]).toBe("2,bob@example.com,2024-01-21,pro");
    });

    it("handles empty results", () => {
      const result = formatResults([], "csv");
      expect(result).toBe("");
    });

    it("escapes commas in values", () => {
      const rowsWithComma = [{ id: 1, description: "Hello, World" }];
      const result = formatResults(rowsWithComma, "csv");
      expect(result).toContain('"Hello, World"');
    });

    it("escapes quotes in values", () => {
      const rowsWithQuotes = [{ id: 1, description: 'Say "Hello"' }];
      const result = formatResults(rowsWithQuotes, "csv");
      expect(result).toContain('"Say ""Hello"""');
    });

    it("handles null values", () => {
      const rowsWithNull = [{ id: 1, email: null }];
      const result = formatResults(rowsWithNull, "csv");
      expect(result).toContain("NULL");
    });
  });

  describe("Table format", () => {
    it("formats results as ASCII table", () => {
      const result = formatResults(sampleRows, "table");
      expect(result).toContain("┌");
      expect(result).toContain("│");
      expect(result).toContain("└");
      expect(result).toContain("id");
      expect(result).toContain("email");
      expect(result).toContain("alice@example.com");
    });

    it("handles empty results", () => {
      const result = formatResults([], "table");
      expect(result).toBe("");
    });

    it("aligns columns properly", () => {
      const result = formatResults(sampleRows, "table");
      const lines = result.split("\n");
      // All data rows should have same length
      const dataLines = lines.filter((l) => l.startsWith("│"));
      const lengths = dataLines.map((l) => l.length);
      expect(new Set(lengths).size).toBe(1); // All same length
    });
  });

  describe("default format", () => {
    it("uses JSON as default", () => {
      const result = formatResults(sampleRows);
      const parsed = JSON.parse(result);
      expect(parsed).toEqual(sampleRows);
    });
  });
});
