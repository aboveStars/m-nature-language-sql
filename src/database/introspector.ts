import type pg from "pg";
import type {
  Schema,
  TableInfo,
  ColumnInfo,
  Relationship,
  IndexInfo,
  DatabaseConfig,
} from "../types/index.js";
import { getPool } from "./connection.js";

/**
 * Introspects database schema including tables, columns, relationships, and indexes
 */
export async function introspectSchema(
  config: DatabaseConfig,
  allowedTables?: string[]
): Promise<Schema> {
  const pool = getPool(config);

  // Get tables
  const tables = await getTables(pool, allowedTables);

  // Get relationships (foreign keys)
  const relationships = await getRelationships(pool, allowedTables);

  // Get indexes
  const indexes = await getIndexes(pool, allowedTables);

  return {
    tables,
    relationships,
    indexes,
    introspectedAt: new Date(),
  };
}

/**
 * Gets all tables with their columns
 */
async function getTables(
  pool: pg.Pool,
  allowedTables?: string[]
): Promise<TableInfo[]> {
  // Build table filter
  let tableFilter = "";
  const params: string[] = [];

  if (allowedTables && allowedTables.length > 0) {
    const placeholders = allowedTables.map((_, i) => `$${i + 1}`).join(", ");
    tableFilter = `AND t.table_name IN (${placeholders})`;
    params.push(...allowedTables);
  }

  // Get tables
  const tablesQuery = `
    SELECT table_name
    FROM information_schema.tables t
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      ${tableFilter}
    ORDER BY t.table_name
  `;

  const tablesResult = await pool.query<{ table_name: string }>(
    tablesQuery,
    params
  );

  // Get columns for all tables
  const tables: TableInfo[] = [];

  for (const tableRow of tablesResult.rows) {
    const tableName = tableRow.table_name;

    // Get column information
    const columnsQuery = `
      SELECT 
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        CASE 
          WHEN pk.column_name IS NOT NULL THEN true 
          ELSE false 
        END as is_primary_key
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
          AND tc.table_schema = 'public'
      ) pk ON c.column_name = pk.column_name
      WHERE c.table_name = $1
        AND c.table_schema = 'public'
      ORDER BY c.ordinal_position
    `;

    const columnsResult = await pool.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      is_primary_key: boolean;
    }>(columnsQuery, [tableName]);

    const columns: ColumnInfo[] = columnsResult.rows.map((col) => ({
      name: col.column_name,
      dataType: col.data_type,
      isNullable: col.is_nullable === "YES",
      defaultValue: col.column_default,
      isPrimaryKey: col.is_primary_key,
    }));

    const primaryKeys = columns
      .filter((col) => col.isPrimaryKey)
      .map((col) => col.name);

    tables.push({
      name: tableName,
      columns,
      primaryKeys,
    });
  }

  return tables;
}

/**
 * Gets foreign key relationships between tables
 */
async function getRelationships(
  pool: pg.Pool,
  allowedTables?: string[]
): Promise<Relationship[]> {
  let tableFilter = "";
  const params: string[] = [];

  if (allowedTables && allowedTables.length > 0) {
    const placeholders = allowedTables.map((_, i) => `$${i + 1}`).join(", ");
    tableFilter = `AND tc.table_name IN (${placeholders}) AND ccu.table_name IN (${placeholders})`;
    params.push(...allowedTables, ...allowedTables);
  }

  const query = `
    SELECT 
      tc.table_name AS source_table,
      kcu.column_name AS source_column,
      ccu.table_name AS target_table,
      ccu.column_name AS target_column
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      ${tableFilter}
    ORDER BY tc.table_name, kcu.column_name
  `;

  const result = await pool.query<{
    source_table: string;
    source_column: string;
    target_table: string;
    target_column: string;
  }>(query, params);

  return result.rows.map((row) => ({
    sourceTable: row.source_table,
    sourceColumn: row.source_column,
    targetTable: row.target_table,
    targetColumn: row.target_column,
  }));
}

/**
 * Gets index information for tables
 */
async function getIndexes(
  pool: pg.Pool,
  allowedTables?: string[]
): Promise<IndexInfo[]> {
  let tableFilter = "";
  const params: string[] = [];

  if (allowedTables && allowedTables.length > 0) {
    const placeholders = allowedTables.map((_, i) => `$${i + 1}`).join(", ");
    tableFilter = `AND t.relname IN (${placeholders})`;
    params.push(...allowedTables);
  }

  const query = `
    SELECT 
      i.relname AS index_name,
      t.relname AS table_name,
      array_agg(a.attname ORDER BY array_position(ix.indkey, a.attnum)) AS columns,
      ix.indisunique AS is_unique
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE n.nspname = 'public'
      AND NOT ix.indisprimary
      ${tableFilter}
    GROUP BY i.relname, t.relname, ix.indisunique
    ORDER BY t.relname, i.relname
  `;

  const result = await pool.query<{
    index_name: string;
    table_name: string;
    columns: string[];
    is_unique: boolean;
  }>(query, params);

  return result.rows.map((row) => ({
    name: row.index_name,
    tableName: row.table_name,
    columns: row.columns,
    isUnique: row.is_unique,
  }));
}

/**
 * Formats schema as a human-readable string for LLM context
 */
export function formatSchemaForLLM(schema: Schema): string {
  let output = "## Database Schema\n\n";

  // Tables and columns
  for (const table of schema.tables) {
    output += `### Table: ${table.name}\n`;
    output += "| Column | Type | Nullable | Primary Key |\n";
    output += "|--------|------|----------|-------------|\n";

    for (const col of table.columns) {
      output += `| ${col.name} | ${col.dataType} | ${
        col.isNullable ? "Yes" : "No"
      } | ${col.isPrimaryKey ? "Yes" : "No"} |\n`;
    }
    output += "\n";
  }

  // Relationships
  if (schema.relationships.length > 0) {
    output += "## Relationships (Foreign Keys)\n\n";
    output +=
      "| Source Table | Source Column | Target Table | Target Column |\n";
    output +=
      "|--------------|---------------|--------------|---------------|\n";

    for (const rel of schema.relationships) {
      output += `| ${rel.sourceTable} | ${rel.sourceColumn} | ${rel.targetTable} | ${rel.targetColumn} |\n`;
    }
    output += "\n";
  }

  return output;
}
