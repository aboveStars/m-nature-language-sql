/**
 * Mock Test Database Setup Script
 *
 * Creates a test database with sample tables for testing the Natural Language SQL Agent.
 * This creates: users, subscriptions, orders tables with sample data.
 */

import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

const TEST_DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost:5432/nlsql_test";

async function setupTestDatabase() {
  console.log("Setting up test database...");

  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
  });

  try {
    // Drop existing tables (for clean setup)
    await pool.query(`
      DROP TABLE IF EXISTS orders CASCADE;
      DROP TABLE IF EXISTS subscriptions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        status VARCHAR(50) DEFAULT 'active'
      )
    `);

    // Create subscriptions table
    await pool.query(`
      CREATE TABLE subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        plan VARCHAR(50) NOT NULL,
        mrr NUMERIC(10, 2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP
      )
    `);

    // Create orders table
    await pool.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        total_amount NUMERIC(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      )
    `);

    // Create indexes
    await pool.query(`
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_created_at ON users(created_at);
      CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
      CREATE INDEX idx_subscriptions_plan ON subscriptions(plan);
      CREATE INDEX idx_orders_user_id ON orders(user_id);
      CREATE INDEX idx_orders_created_at ON orders(created_at);
    `);

    console.log("Tables created successfully!");

    // Insert sample data
    console.log("Inserting sample data...");

    // Insert users
    const users = [
      { email: "alice@example.com", name: "Alice Smith", daysAgo: 3 },
      { email: "bob@example.com", name: "Bob Johnson", daysAgo: 5 },
      { email: "carol@example.com", name: "Carol Williams", daysAgo: 10 },
      { email: "david@example.com", name: "David Brown", daysAgo: 15 },
      { email: "eve@example.com", name: "Eve Davis", daysAgo: 2 },
    ];

    for (const user of users) {
      await pool.query(
        `INSERT INTO users (email, name, created_at) 
         VALUES ($1, $2, NOW() - INTERVAL '${user.daysAgo} days')`,
        [user.email, user.name]
      );
    }

    // Insert subscriptions
    const subscriptions = [
      { userId: 1, plan: "pro", mrr: 49.99 },
      { userId: 2, plan: "pro", mrr: 49.99 },
      { userId: 3, plan: "basic", mrr: 9.99 },
      { userId: 4, plan: "enterprise", mrr: 199.99 },
      { userId: 5, plan: "pro", mrr: 49.99 },
    ];

    for (const sub of subscriptions) {
      await pool.query(
        `INSERT INTO subscriptions (user_id, plan, mrr) VALUES ($1, $2, $3)`,
        [sub.userId, sub.plan, sub.mrr]
      );
    }

    // Insert orders
    const orders = [
      { userId: 1, amount: 150.0, status: "completed" },
      { userId: 1, amount: 75.0, status: "completed" },
      { userId: 2, amount: 200.0, status: "completed" },
      { userId: 3, amount: 50.0, status: "pending" },
      { userId: 4, amount: 500.0, status: "completed" },
    ];

    for (const order of orders) {
      await pool.query(
        `INSERT INTO orders (user_id, total_amount, status) VALUES ($1, $2, $3)`,
        [order.userId, order.amount, order.status]
      );
    }

    console.log("Sample data inserted successfully!");
    console.log("\nTest database setup complete!");
    console.log(`\nConnection string: ${TEST_DATABASE_URL}`);
    console.log("\nTables created:");
    console.log("  - users (5 rows)");
    console.log("  - subscriptions (5 rows)");
    console.log("  - orders (5 rows)");
  } catch (error) {
    console.error("Error setting up test database:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run setup
setupTestDatabase().catch(console.error);
