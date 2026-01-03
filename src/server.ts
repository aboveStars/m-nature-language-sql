import "dotenv/config";
import express from "express";
import { queryDatabase, cleanup } from "./index.js";
import type { QueryRequest } from "./types/index.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * API Input format (maps to internal QueryRequest)
 */
interface APIRequest {
  database: {
    connection: string;
    allowed_tables?: string[];
  };
  query: string;
}

/**
 * POST /query - Process natural language SQL queries
 */
app.post("/query", async (req, res) => {
  try {
    const apiRequest: APIRequest = req.body;

    // Map API format to internal format (allowed_tables -> allowedTables)
    const queryRequest: QueryRequest = {
      database: {
        connection: apiRequest.database.connection,
        allowedTables: apiRequest.database.allowed_tables,
      },
      query: apiRequest.query,
    };

    const result = await queryDatabase(queryRequest);
    res.json(result);
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Invalid JSON in request body"
        : error instanceof Error
        ? error.message
        : "Unknown error";

    res.status(400).json({ error: true, message });
  }
});

/**
 * GET /health - Health check
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Natural Language SQL API running on http://localhost:${PORT}`);
  console.log(`POST /query - Process natural language queries`);
  console.log(`GET /health - Health check`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  await cleanup();
  server.close();
  process.exit(0);
});
