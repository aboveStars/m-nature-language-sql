/**
 * Core TypeScript interfaces for the Natural Language SQL Agent
 */

// ============= Request/Response Types =============

export interface DatabaseConfig {
  /** PostgreSQL connection string */
  connection: string;
  /** Optional list of tables the agent is allowed to query */
  allowedTables?: string[];
}

export interface QueryRequest {
  /** Database configuration */
  database: DatabaseConfig;
  /** Natural language query from user */
  query: string;
  /** Output format (default: json) */
  format?: OutputFormat;
}

export interface QueryResponse {
  /** The generated SQL query */
  sql_generated: string;
  /** Human-readable explanation of what the query does */
  explanation: string;
  /** Query results as array of objects */
  results: Record<string, unknown>[];
  /** Number of rows returned */
  result_count: number;
  /** Query execution time */
  execution_time: string;
}

export interface ClarificationResponse {
  /** Indicates this response requires user clarification */
  needs_clarification: true;
  /** List of clarifying questions */
  questions: string[];
}

export interface ErrorResponse {
  /** Error indicator */
  error: true;
  /** Error message */
  message: string;
  /** Original query that caused the error */
  original_query?: string;
}

export type AgentResponse =
  | QueryResponse
  | ClarificationResponse
  | ErrorResponse;

// ============= Schema Types =============

export interface ColumnInfo {
  /** Column name */
  name: string;
  /** PostgreSQL data type */
  dataType: string;
  /** Whether column allows NULL values */
  isNullable: boolean;
  /** Default value if any */
  defaultValue: string | null;
  /** Whether this column is a primary key */
  isPrimaryKey: boolean;
}

export interface TableInfo {
  /** Table name */
  name: string;
  /** Table columns */
  columns: ColumnInfo[];
  /** Primary key column names */
  primaryKeys: string[];
}

export interface Relationship {
  /** Source table name */
  sourceTable: string;
  /** Source column name */
  sourceColumn: string;
  /** Target (foreign) table name */
  targetTable: string;
  /** Target (foreign) column name */
  targetColumn: string;
}

export interface IndexInfo {
  /** Index name */
  name: string;
  /** Table the index belongs to */
  tableName: string;
  /** Columns included in the index */
  columns: string[];
  /** Whether this is a unique index */
  isUnique: boolean;
}

export interface Schema {
  /** All tables in the database */
  tables: TableInfo[];
  /** Foreign key relationships */
  relationships: Relationship[];
  /** Database indexes */
  indexes: IndexInfo[];
  /** Timestamp when schema was introspected */
  introspectedAt: Date;
}

// ============= Validation Types =============

export interface ValidationResult {
  /** Whether the query passed validation */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
  /** Warning messages (query is valid but has potential issues) */
  warnings?: string[];
}

// ============= SQL Generation Types =============

export interface SQLGenerationResult {
  /** Generated SQL query */
  sql: string;
  /** Explanation of what the query does */
  explanation: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Tables used in the query */
  tablesUsed: string[];
  /** Whether the query might be ambiguous */
  isAmbiguous: boolean;
  /** Clarifying questions if ambiguous */
  clarifyingQuestions?: string[];
}

// ============= Output Formats =============

export type OutputFormat = "json" | "csv" | "table";

// ============= Cache Types =============

export interface CachedSchema {
  /** The cached schema */
  schema: Schema;
  /** When the cache was created */
  cachedAt: Date;
  /** Cache TTL in milliseconds */
  ttlMs: number;
}

// ============= Performance Metrics =============

export interface QueryMetrics {
  /** Time spent on schema introspection */
  schemaIntrospectionMs: number;
  /** Time spent on SQL generation */
  sqlGenerationMs: number;
  /** Time spent on query validation */
  validationMs: number;
  /** Time spent executing the query */
  executionMs: number;
  /** Total end-to-end time */
  totalMs: number;
}
