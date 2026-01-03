import OpenAI from "openai";
import type { Schema, SQLGenerationResult } from "../types/index.js";
import { formatSchemaForLLM } from "../database/introspector.js";

/**
 * OpenAI client instance
 */
let openaiClient: OpenAI | null = null;

/**
 * Gets or creates OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * System prompt for SQL generation
 */
const SYSTEM_PROMPT = `You are an expert PostgreSQL query generator. Your task is to convert natural language queries into safe, read-only SQL queries.

RULES:
1. ONLY generate SELECT queries - never generate INSERT, UPDATE, DELETE, DROP, or any data-modifying statements
2. Use proper JOINs based on the foreign key relationships provided
3. Always include ORDER BY for deterministic results when appropriate
4. Use table aliases for clarity (e.g., u for users, s for subscriptions)
5. Add LIMIT 100 by default unless the user explicitly asks for all records or a specific count
6. Use proper date/time functions for temporal queries (e.g., NOW(), INTERVAL)
7. Handle NULL values appropriately
8. Use aggregate functions (COUNT, SUM, AVG) when the query implies aggregation

OUTPUT FORMAT:
You must respond with a valid JSON object containing:
{
  "sql": "The generated SQL query",
  "explanation": "A brief explanation of what the query does",
  "confidence": 0.0-1.0 (how confident you are in the query),
  "tables_used": ["list", "of", "tables"],
  "is_ambiguous": true/false,
  "clarifying_questions": ["optional list of questions if ambiguous"]
}

If the query is ambiguous or you need more information, set is_ambiguous to true and provide clarifying questions.`;

/**
 * Generates SQL from natural language using OpenAI
 */
export async function generateSQL(
  naturalLanguageQuery: string,
  schema: Schema
): Promise<SQLGenerationResult> {
  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4-turbo";

  const schemaContext = formatSchemaForLLM(schema);

  const userPrompt = `Database Schema:
${schemaContext}

User Query: "${naturalLanguageQuery}"

Generate the appropriate SQL query.`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1, // Low temperature for more deterministic outputs
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No response from OpenAI");
  }

  try {
    const parsed = JSON.parse(content) as {
      sql: string;
      explanation: string;
      confidence: number;
      tables_used: string[];
      is_ambiguous: boolean;
      clarifying_questions?: string[];
    };

    return {
      sql: parsed.sql,
      explanation: parsed.explanation,
      confidence: parsed.confidence,
      tablesUsed: parsed.tables_used,
      isAmbiguous: parsed.is_ambiguous,
      clarifyingQuestions: parsed.clarifying_questions,
    };
  } catch (error) {
    throw new Error(`Failed to parse LLM response: ${content}`);
  }
}

/**
 * Refines a query based on clarification response
 */
export async function refineSQL(
  originalQuery: string,
  clarification: string,
  previousSQL: string,
  schema: Schema
): Promise<SQLGenerationResult> {
  const openai = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-4-turbo";

  const schemaContext = formatSchemaForLLM(schema);

  const userPrompt = `Database Schema:
${schemaContext}

Original Query: "${originalQuery}"
Previous SQL Attempt: ${previousSQL}
User Clarification: "${clarification}"

Refine the SQL query based on the user's clarification.`;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("No response from OpenAI");
  }

  const parsed = JSON.parse(content) as {
    sql: string;
    explanation: string;
    confidence: number;
    tables_used: string[];
    is_ambiguous: boolean;
    clarifying_questions?: string[];
  };

  return {
    sql: parsed.sql,
    explanation: parsed.explanation,
    confidence: parsed.confidence,
    tablesUsed: parsed.tables_used,
    isAmbiguous: parsed.is_ambiguous,
    clarifyingQuestions: parsed.clarifying_questions,
  };
}
