# Natural Language → SQL Query Agent

An AI-powered agent that converts natural language queries into SQL and executes them against PostgreSQL databases. Enable non-technical users to query production data safely without SQL knowledge.

## Features

- **Schema Introspection**: Automatically discovers tables, columns, relationships, and indexes
- **Text-to-SQL**: Converts natural language → valid PostgreSQL queries using GPT-4
- **Query Validation**: Only allows SELECT queries, prevents DROP/DELETE/UPDATE
- **Ambiguity Handling**: Detects unclear queries and asks clarifying questions
- **Result Formatting**: Returns data as JSON, CSV, or ASCII table
- **Performance**: Schema caching and connection pooling for <3s response time

## Prerequisites

### PostgreSQL (macOS)

```bash
# Install PostgreSQL via Homebrew
brew install postgresql@17

# Start the PostgreSQL service
brew services start postgresql@17

# Add PostgreSQL to your PATH (add to ~/.zshrc for persistence)
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"

# Create the test database
createdb nlsql_test
```

### OpenAI API Key

You'll need an OpenAI API key with access to GPT-4. Get one at [platform.openai.com](https://platform.openai.com/api-keys).

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
OPENAI_API_KEY=sk-your-api-key-here
DATABASE_URL=postgres://user:password@localhost:5432/your_database
```

### 3. Setup Test Database (Optional)

```bash
# Create PostgreSQL database
createdb nlsql_test

# Setup sample tables and data
npm run db:setup:test
```

### 4. Run Tests

```bash
npm test
```

## Usage

### Basic Query

```typescript
import { queryDatabase } from "./src/index.js";

const result = await queryDatabase({
  database: {
    connection: "postgres://user:pass@localhost:5432/mydb",
    allowedTables: ["users", "subscriptions", "orders"],
  },
  query: "Show me users who signed up last week and have Pro plan",
});

console.log(result);
```

### Output Format

```json
{
  "sql_generated": "SELECT u.id, u.email, u.created_at, s.plan FROM users u JOIN subscriptions s ON u.id = s.user_id WHERE u.created_at >= NOW() - INTERVAL '7 days' AND s.plan = 'pro' ORDER BY u.created_at DESC LIMIT 100",
  "explanation": "This query joins users and subscriptions tables, filters for users created in last 7 days with Pro plan",
  "results": [
    {
      "id": 1,
      "email": "alice@example.com",
      "created_at": "2024-01-20",
      "plan": "pro"
    },
    {
      "id": 2,
      "email": "bob@example.com",
      "created_at": "2024-01-21",
      "plan": "pro"
    }
  ],
  "result_count": 2,
  "execution_time": "23ms"
}
```

### Handling Clarification Requests

When a query is ambiguous, the agent returns clarifying questions:

```typescript
const result = await queryDatabase({
  database: { connection: "..." },
  query: "Show me revenue",
});

// If ambiguous:
// {
//   "needs_clarification": true,
//   "questions": [
//     "Do you want revenue from: orders, subscriptions?",
//     "What time range would you like? (e.g., last 7 days, last month, all time)"
//   ]
// }

// Use queryWithClarification to provide context:
const clarifiedResult = await queryWithClarification(
  { database: { connection: "..." }, query: "Show me revenue" },
  "I want subscription MRR for last month"
);
```

## API Reference

### `queryDatabase(request: QueryRequest): Promise<AgentResponse>`

Main entry point for processing natural language queries.

### `queryWithClarification(request: QueryRequest, clarification: string): Promise<AgentResponse>`

Processes a query with additional user clarification.

### `validateDatabaseConnection(request): Promise<{ valid: boolean; error?: string }>`

Validates database connection.

### `getDatabaseSchema(request): Promise<Schema>`

Returns detailed schema information.

### `cleanup(): Promise<void>`

Closes all database connections (call before exit).

## Example Queries

| Natural Language                  | Generated SQL                                                                                                  |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| "Show me all users"               | `SELECT * FROM users LIMIT 100`                                                                                |
| "Users who signed up last week"   | `SELECT * FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`                                            |
| "Count of Pro subscriptions"      | `SELECT COUNT(*) FROM subscriptions WHERE plan = 'pro'`                                                        |
| "Total revenue by month"          | `SELECT DATE_TRUNC('month', created_at) as month, SUM(total_amount) FROM orders GROUP BY 1`                    |
| "Users with highest order amount" | `SELECT u.*, MAX(o.total_amount) FROM users u JOIN orders o ON u.id = o.user_id GROUP BY u.id ORDER BY 2 DESC` |

## Safety Features

1. **SELECT-only enforcement**: Agent rejects any data-modifying queries
2. **Keyword blocklist**: Blocks DROP, DELETE, UPDATE, INSERT, TRUNCATE, ALTER, CREATE
3. **Read-only transactions**: All queries execute in read-only transaction mode
4. **Automatic LIMIT**: Adds LIMIT 100 by default to prevent large result sets
5. **Connection pooling**: Prevents connection exhaustion

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Natural Lang   │────▶│   Orchestrator  │────▶│    Response     │
│     Query       │     │                 │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    Schema     │       │      SQL      │       │    Query      │
│ Introspector  │       │   Generator   │       │  Validator    │
└───────────────┘       │   (OpenAI)    │       └───────────────┘
                        └───────────────┘
```

## Scripts

| Command                 | Description         |
| ----------------------- | ------------------- |
| `npm run build`         | Compile TypeScript  |
| `npm run dev`           | Run with hot reload |
| `npm test`              | Run unit tests      |
| `npm run db:setup:test` | Setup test database |

## Test Results

All 22 integration tests pass with real PostgreSQL and OpenAI connections:

| Requirement               | Tests | Status              |
| ------------------------- | ----- | ------------------- |
| Schema Introspection      | 4     | ✅ Pass             |
| Text-to-SQL Generation    | 4     | ✅ Pass             |
| Query Validation (Safety) | 4     | ✅ Pass             |
| Result Formatting         | 2     | ✅ Pass             |
| Error/Ambiguity Handling  | 2     | ✅ Pass             |
| Performance (<3s)         | 2     | ✅ Pass             |
| Read-only Safety          | 2     | ✅ Pass             |
| **Accuracy**              | 1     | ✅ **100% (10/10)** |
| Challenge Format          | 1     | ✅ Pass             |

### Accuracy Breakdown

All 10 natural language queries execute successfully on first try:

| Query                                       | Status |
| ------------------------------------------- | ------ |
| Show me all users                           | ✅     |
| Count of Pro subscriptions                  | ✅     |
| Users who signed up in the last 7 days      | ✅     |
| Show me users with their subscription plans | ✅     |
| Total revenue from orders                   | ✅     |
| Show me the user with most orders           | ✅     |
| Average order amount                        | ✅     |
| List subscriptions by plan type             | ✅     |
| Show me active users                        | ✅     |
| Users with no orders                        | ✅     |

### Run Integration Tests

```bash
npm run db:setup:test          # Setup test database
npm test -- tests/integration.test.ts  # Run integration tests
```

## License

MIT
