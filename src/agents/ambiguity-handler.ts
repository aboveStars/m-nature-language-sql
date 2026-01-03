import type { Schema } from "../types/index.js";

/**
 * Patterns that indicate ambiguous queries
 */
const AMBIGUOUS_PATTERNS = [
  // Generic terms without specifics
  { pattern: /\b(revenue|sales|income|money)\b/i, type: "revenue" },
  {
    pattern:
      /\b(users?|customers?|clients?|people)\b(?!\s+(who|with|from|in|that))/i,
    type: "entity",
  },
  {
    pattern: /\b(data|info|information|details|stats|statistics)\b/i,
    type: "generic",
  },
  // Time-related ambiguity
  { pattern: /\brecent(ly)?\b/i, type: "time" },
  { pattern: /\blast\b(?!\s+\d+)/i, type: "time" },
  { pattern: /\bthis\s+(week|month|year)\b/i, type: "time_relative" },
];

/**
 * Result of ambiguity check
 */
export interface AmbiguityCheckResult {
  /** Whether the query is ambiguous */
  isAmbiguous: boolean;
  /** Detected ambiguity types */
  ambiguityTypes: string[];
  /** Suggested clarifying questions */
  questions: string[];
}

/**
 * Checks if a natural language query is ambiguous given the schema
 */
export function checkAmbiguity(
  query: string,
  schema: Schema
): AmbiguityCheckResult {
  const ambiguityTypes: string[] = [];
  const questions: string[] = [];

  // Check for pattern-based ambiguity
  for (const { pattern, type } of AMBIGUOUS_PATTERNS) {
    if (pattern.test(query)) {
      ambiguityTypes.push(type);
    }
  }

  // Generate questions based on ambiguity types
  if (ambiguityTypes.includes("revenue")) {
    const possibleTables = findRevenueRelatedTables(schema);
    if (possibleTables.length > 1) {
      questions.push(`Do you want revenue from: ${possibleTables.join(", ")}?`);
    }
  }

  if (ambiguityTypes.includes("time")) {
    questions.push(
      "What time range would you like? (e.g., last 7 days, last month, all time)"
    );
  }

  if (ambiguityTypes.includes("entity") && !hasSpecificFilter(query)) {
    questions.push(
      "Would you like all records or filtered by a specific condition?"
    );
  }

  // Check for column ambiguity
  const columnAmbiguity = checkColumnAmbiguity(query, schema);
  if (columnAmbiguity.isAmbiguous) {
    ambiguityTypes.push("column");
    questions.push(...columnAmbiguity.questions);
  }

  // Check for table ambiguity
  const tableAmbiguity = checkTableAmbiguity(query, schema);
  if (tableAmbiguity.isAmbiguous) {
    ambiguityTypes.push("table");
    questions.push(...tableAmbiguity.questions);
  }

  // Remove duplicates
  const uniqueQuestions = [...new Set(questions)];

  return {
    isAmbiguous: uniqueQuestions.length > 0,
    ambiguityTypes,
    questions: uniqueQuestions,
  };
}

/**
 * Finds tables that might contain revenue-related data
 */
function findRevenueRelatedTables(schema: Schema): string[] {
  const revenueTerms = [
    "order",
    "payment",
    "subscription",
    "invoice",
    "transaction",
    "sale",
  ];

  return schema.tables
    .filter((table) => {
      const lowerName = table.name.toLowerCase();
      return revenueTerms.some((term) => lowerName.includes(term));
    })
    .map((t) => t.name);
}

/**
 * Checks if query has specific filter keywords
 */
function hasSpecificFilter(query: string): boolean {
  const filterKeywords = [
    "where",
    "with",
    "who",
    "that",
    "which",
    "only",
    "specific",
    "particular",
    "greater than",
    "less than",
    "equal",
    "between",
    "from",
    "to",
  ];

  const lower = query.toLowerCase();
  return filterKeywords.some((keyword) => lower.includes(keyword));
}

/**
 * Checks for column name ambiguity across tables
 */
function checkColumnAmbiguity(
  query: string,
  schema: Schema
): { isAmbiguous: boolean; questions: string[] } {
  const questions: string[] = [];
  const queryLower = query.toLowerCase();

  // Find column names mentioned in query
  const mentionedColumns = new Map<string, string[]>();

  for (const table of schema.tables) {
    for (const column of table.columns) {
      const colNameLower = column.name.toLowerCase().replace(/_/g, " ");

      if (
        queryLower.includes(colNameLower) ||
        queryLower.includes(column.name.toLowerCase())
      ) {
        if (!mentionedColumns.has(column.name)) {
          mentionedColumns.set(column.name, []);
        }
        mentionedColumns.get(column.name)!.push(table.name);
      }
    }
  }

  // Check if any column exists in multiple tables
  for (const [columnName, tables] of mentionedColumns) {
    if (tables.length > 1) {
      questions.push(
        `Which table's "${columnName}" do you mean: ${tables.join(", ")}?`
      );
    }
  }

  return {
    isAmbiguous: questions.length > 0,
    questions,
  };
}

/**
 * Checks for table name ambiguity
 */
function checkTableAmbiguity(
  query: string,
  schema: Schema
): { isAmbiguous: boolean; questions: string[] } {
  const questions: string[] = [];
  const queryLower = query.toLowerCase();

  // Check for plural/singular confusion
  const tableNames = schema.tables.map((t) => t.name.toLowerCase());

  // Look for generic terms that might match multiple tables
  const genericTerms = [
    "user",
    "customer",
    "account",
    "order",
    "product",
    "item",
  ];

  for (const term of genericTerms) {
    if (queryLower.includes(term)) {
      const matchingTables = tableNames.filter((name) => name.includes(term));
      if (matchingTables.length > 1) {
        questions.push(`Did you mean: ${matchingTables.join(", ")}?`);
      }
    }
  }

  return {
    isAmbiguous: questions.length > 0,
    questions,
  };
}

/**
 * Builds a clarification response
 */
export function buildClarificationResponse(questions: string[]): {
  needs_clarification: true;
  questions: string[];
} {
  return {
    needs_clarification: true,
    questions,
  };
}
