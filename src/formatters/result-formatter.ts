import type { OutputFormat } from "../types/index.js";

/**
 * Formats query results in the specified format
 */
export function formatResults(
  rows: Record<string, unknown>[],
  format: OutputFormat = "json"
): string {
  if (rows.length === 0) {
    return format === "json" ? "[]" : "";
  }

  switch (format) {
    case "json":
      return formatAsJSON(rows);
    case "csv":
      return formatAsCSV(rows);
    case "table":
      return formatAsTable(rows);
    default:
      return formatAsJSON(rows);
  }
}

/**
 * Formats results as pretty-printed JSON
 */
function formatAsJSON(rows: Record<string, unknown>[]): string {
  return JSON.stringify(rows, null, 2);
}

/**
 * Formats results as CSV
 */
function formatAsCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const headerLine = headers.map(escapeCSVField).join(",");

  const dataLines = rows.map((row) => {
    return headers
      .map((header) => {
        const value = row[header];
        return escapeCSVField(formatValue(value));
      })
      .join(",");
  });

  return [headerLine, ...dataLines].join("\n");
}

/**
 * Escapes a field for CSV format
 */
function escapeCSVField(value: string): string {
  // If value contains comma, quotes, or newlines, wrap in quotes
  if (/[,"\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Formats results as ASCII table
 */
function formatAsTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);

  // Calculate column widths
  const columnWidths = headers.map((header) => {
    const headerWidth = header.length;
    const maxDataWidth = rows.reduce((max, row) => {
      const value = formatValue(row[header]);
      return Math.max(max, value.length);
    }, 0);
    return Math.max(headerWidth, maxDataWidth);
  });

  // Build table
  const lines: string[] = [];

  // Top border
  lines.push(buildBorder(columnWidths, "┌", "┬", "┐"));

  // Header row
  lines.push(buildRow(headers, columnWidths));

  // Header separator
  lines.push(buildBorder(columnWidths, "├", "┼", "┤"));

  // Data rows
  for (const row of rows) {
    const values = headers.map((h) => formatValue(row[h]));
    lines.push(buildRow(values, columnWidths));
  }

  // Bottom border
  lines.push(buildBorder(columnWidths, "└", "┴", "┘"));

  return lines.join("\n");
}

/**
 * Builds a border line for the ASCII table
 */
function buildBorder(
  widths: number[],
  left: string,
  middle: string,
  right: string
): string {
  const segments = widths.map((w) => "─".repeat(w + 2));
  return left + segments.join(middle) + right;
}

/**
 * Builds a data row for the ASCII table
 */
function buildRow(values: string[], widths: number[]): string {
  const cells = values.map((value, i) => {
    const padded = value.padEnd(widths[i]);
    return ` ${padded} `;
  });
  return "│" + cells.join("│") + "│";
}

/**
 * Formats a value to string
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Adds summary information to formatted results
 */
export function addResultSummary(
  formattedResults: string,
  rowCount: number,
  executionTime: string
): string {
  return `${formattedResults}\n\n--- ${rowCount} row(s) returned in ${executionTime} ---`;
}
