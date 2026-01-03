import { describe, it, expect } from "vitest";
import { validateQuery, sanitizeQuery } from "../src/agents/validator.js";

describe("Query Validator", () => {
  describe("validateQuery", () => {
    // Valid queries
    it("accepts valid SELECT query", () => {
      const result = validateQuery("SELECT * FROM users");
      expect(result.valid).toBe(true);
    });

    it("accepts SELECT with JOIN", () => {
      const sql = `
        SELECT u.id, u.email, s.plan
        FROM users u
        JOIN subscriptions s ON u.id = s.user_id
        WHERE s.plan = 'pro'
      `;
      const result = validateQuery(sql);
      expect(result.valid).toBe(true);
    });

    it("accepts SELECT with CTE (WITH clause)", () => {
      const sql = `
        WITH active_users AS (
          SELECT * FROM users WHERE status = 'active'
        )
        SELECT * FROM active_users
      `;
      const result = validateQuery(sql);
      expect(result.valid).toBe(true);
    });

    it("accepts SELECT with subquery", () => {
      const sql = `
        SELECT u.*
        FROM users u
        WHERE u.id IN (SELECT user_id FROM orders WHERE total > 100)
      `;
      const result = validateQuery(sql);
      expect(result.valid).toBe(true);
    });

    // Dangerous queries - should be rejected
    it("rejects DROP TABLE", () => {
      const result = validateQuery("DROP TABLE users");
      expect(result.valid).toBe(false);
    });

    it("rejects DELETE", () => {
      const result = validateQuery("DELETE FROM users WHERE id = 1");
      expect(result.valid).toBe(false);
    });

    it("rejects UPDATE", () => {
      const result = validateQuery("UPDATE users SET name = 'test'");
      expect(result.valid).toBe(false);
    });

    it("rejects INSERT", () => {
      const result = validateQuery("INSERT INTO users (name) VALUES ('test')");
      expect(result.valid).toBe(false);
    });

    it("rejects TRUNCATE", () => {
      const result = validateQuery("TRUNCATE TABLE users");
      expect(result.valid).toBe(false);
    });

    it("rejects ALTER TABLE", () => {
      const result = validateQuery(
        "ALTER TABLE users ADD COLUMN test VARCHAR(50)"
      );
      expect(result.valid).toBe(false);
    });

    it("rejects CREATE TABLE", () => {
      const result = validateQuery("CREATE TABLE test (id INT)");
      expect(result.valid).toBe(false);
    });

    it("rejects multiple statements", () => {
      const sql = "SELECT * FROM users; DROP TABLE users;";
      const result = validateQuery(sql);
      expect(result.valid).toBe(false);
    });

    it("rejects non-SELECT query", () => {
      const result = validateQuery("EXPLAIN SELECT * FROM users");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Only SELECT");
    });

    it("rejects SELECT INTO", () => {
      const result = validateQuery("SELECT * INTO new_table FROM users");
      expect(result.valid).toBe(false);
      expect(result.error).toContain("INTO");
    });

    // Edge cases
    it("handles SQL comments", () => {
      const sql = `
        -- This is a comment
        SELECT * FROM users /* inline comment */ WHERE id = 1
      `;
      const result = validateQuery(sql);
      expect(result.valid).toBe(true);
    });

    it("rejects dangerous query hidden in comment", () => {
      // Even with comments, the actual query might contain dangerous keywords
      const sql = `
        /* 
          DROP TABLE users 
        */
        DROP TABLE users;
      `;
      const result = validateQuery(sql);
      expect(result.valid).toBe(false);
    });

    it("returns warning for missing LIMIT", () => {
      const result = validateQuery("SELECT * FROM users");
      expect(result.valid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("LIMIT"))).toBe(true);
    });

    it("no warning when LIMIT is present", () => {
      const result = validateQuery("SELECT * FROM users LIMIT 10");
      expect(result.valid).toBe(true);
      expect(result.warnings?.some((w) => w.includes("LIMIT"))).toBeFalsy();
    });

    it("returns warning for SELECT *", () => {
      const result = validateQuery("SELECT * FROM users LIMIT 10");
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some((w) => w.includes("SELECT *"))).toBe(true);
    });
  });

  describe("sanitizeQuery", () => {
    it("adds LIMIT when missing", () => {
      const result = sanitizeQuery("SELECT * FROM users");
      expect(result).toContain("LIMIT");
    });

    it("preserves existing LIMIT", () => {
      const sql = "SELECT * FROM users LIMIT 50";
      const result = sanitizeQuery(sql);
      expect(result).toBe("SELECT * FROM users LIMIT 50");
    });

    it("removes trailing semicolon", () => {
      const sql = "SELECT * FROM users;";
      const result = sanitizeQuery(sql);
      expect(result).not.toContain(";");
    });

    it("uses custom max rows", () => {
      const result = sanitizeQuery("SELECT * FROM users", 500);
      expect(result).toContain("LIMIT 500");
    });
  });
});
