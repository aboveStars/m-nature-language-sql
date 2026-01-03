import type { ValidationResult } from "../types/index.js";

/**
 * List of dangerous SQL keywords that modify data
 */
const DANGEROUS_KEYWORDS = [
  "DROP",
  "DELETE",
  "UPDATE",
  "INSERT",
  "TRUNCATE",
  "ALTER",
  "CREATE",
  "GRANT",
  "REVOKE",
  "EXECUTE",
  "EXEC",
  "INTO", // For SELECT INTO
  "COPY",
];

/**
 * Validates SQL query for safety
 * Only allows SELECT queries, rejects any data modification
 */
export function validateQuery(sql: string): ValidationResult {
  const warnings: string[] = [];

  // Normalize SQL - remove comments and extra whitespace
  const normalizedSql = normalizeSQL(sql);

  // Check for empty query
  if (!normalizedSql.trim()) {
    return {
      valid: false,
      error: "Empty query",
    };
  }

  // Check for multiple statements (potential SQL injection)
  if (hasMultipleStatements(normalizedSql)) {
    return {
      valid: false,
      error: "Multiple SQL statements are not allowed",
    };
  }

  // Check if query starts with SELECT
  if (!isSelectQuery(normalizedSql)) {
    return {
      valid: false,
      error: "Only SELECT queries are allowed",
    };
  }

  // Check for dangerous keywords
  const dangerousKeyword = findDangerousKeyword(normalizedSql);
  if (dangerousKeyword) {
    return {
      valid: false,
      error: `Forbidden operation: ${dangerousKeyword}`,
    };
  }

  // Check for SELECT INTO (creates tables)
  if (hasSelectInto(normalizedSql)) {
    return {
      valid: false,
      error: "SELECT INTO is not allowed",
    };
  }

  // Warn about missing LIMIT
  if (!hasLimit(normalizedSql)) {
    warnings.push(
      "Query does not have a LIMIT clause. Consider adding one to prevent returning too many rows."
    );
  }

  // Warn about SELECT *
  if (hasSelectStar(normalizedSql)) {
    warnings.push(
      "Using SELECT * may return more columns than needed. Consider specifying columns explicitly."
    );
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Removes SQL comments and normalizes whitespace
 */
function normalizeSQL(sql: string): string {
  return (
    sql
      // Remove single-line comments
      .replace(/--.*$/gm, "")
      // Remove multi-line comments
      .replace(/\/\*[\s\S]*?\*\//g, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Checks if query contains multiple statements
 */
function hasMultipleStatements(sql: string): boolean {
  // Remove semicolons inside strings
  const withoutStrings = sql.replace(/'[^']*'/g, "").replace(/"[^"]*"/g, "");

  // Count semicolons (allow one at the end)
  const semicolonCount = (withoutStrings.match(/;/g) || []).length;

  // More than one semicolon, or semicolon not at end
  if (semicolonCount > 1) return true;
  if (semicolonCount === 1 && !withoutStrings.trim().endsWith(";")) return true;

  return false;
}

/**
 * Checks if query starts with SELECT
 */
function isSelectQuery(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();

  // Allow WITH (CTE) followed by SELECT
  if (trimmed.startsWith("WITH")) {
    // Check that the final statement is SELECT
    const afterCTE = trimmed.replace(/WITH\s+[\s\S]+?\)\s*/, "");
    return afterCTE.startsWith("SELECT");
  }

  return trimmed.startsWith("SELECT");
}

/**
 * Finds dangerous keywords in SQL
 */
function findDangerousKeyword(sql: string): string | null {
  const upper = sql.toUpperCase();

  for (const keyword of DANGEROUS_KEYWORDS) {
    // Use word boundary to avoid false positives
    const regex = new RegExp(`\\b${keyword}\\b`, "i");
    if (regex.test(upper)) {
      // Special handling for INTO - only dangerous in certain contexts
      if (keyword === "INTO") {
        continue; // Handled separately by hasSelectInto
      }
      return keyword;
    }
  }

  return null;
}

/**
 * Checks for SELECT INTO syntax
 */
function hasSelectInto(sql: string): boolean {
  const upper = sql.toUpperCase();
  // SELECT ... INTO table_name
  return /\bSELECT\b[\s\S]+?\bINTO\b\s+(?!TEMP|TEMPORARY)/i.test(upper);
}

/**
 * Checks if query has a LIMIT clause
 */
function hasLimit(sql: string): boolean {
  return /\bLIMIT\s+\d+/i.test(sql);
}

/**
 * Checks if query uses SELECT *
 */
function hasSelectStar(sql: string): boolean {
  return /\bSELECT\s+\*/i.test(sql);
}

/**
 * Sanitizes a query by adding safety measures
 */
export function sanitizeQuery(sql: string, maxRows: number = 1000): string {
  let sanitized = sql.trim();

  // Remove trailing semicolon
  if (sanitized.endsWith(";")) {
    sanitized = sanitized.slice(0, -1);
  }

  // Add LIMIT if not present
  if (!hasLimit(sanitized)) {
    sanitized = `${sanitized} LIMIT ${maxRows}`;
  }

  return sanitized;
}
