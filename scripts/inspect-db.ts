#!/usr/bin/env tsx
import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";

const dbPath =
  process.env.DATABASE_PATH || join(process.cwd(), "data", "kay.db");

if (!existsSync(dbPath)) {
  console.error(`Database file not found: ${dbPath}`);
  process.exit(1);
}

console.log(`Opening database: ${dbPath}\n`);
const db = Database(dbPath);

// Get all tables
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as Array<{ name: string }>;

console.log("📊 Tables in database:\n");
for (const table of tables) {
  const count = db
    .prepare(`SELECT COUNT(*) as count FROM ${table.name}`)
    .get() as {
    count: number;
  };
  console.log(`  - ${table.name}: ${count.count} rows`);
}

// Show data from key tables
console.log("\n" + "=".repeat(80));
console.log("📋 DETAILED DATA\n");

// Kay Sessions
console.log("\n🔑 kay_sessions:");
const kaySessions = db.prepare("SELECT * FROM kay_sessions LIMIT 10").all();
console.log(JSON.stringify(kaySessions, null, 2));

// CLI Sessions
console.log("\n💻 cli_sessions:");
const cliSessions = db
  .prepare(
    "SELECT session_token, account_id, expires_at, created_at FROM cli_sessions LIMIT 10"
  )
  .all();
console.log(JSON.stringify(cliSessions, null, 2));

// Connections
console.log("\n🔌 connections:");
const connections = db.prepare("SELECT * FROM connections LIMIT 10").all();
console.log(JSON.stringify(connections, null, 2));

// Interactive Sessions
console.log("\n💬 interactive_sessions:");
const interactiveSessions = db
  .prepare(
    "SELECT session_id, account_id, created_at, updated_at FROM interactive_sessions LIMIT 10"
  )
  .all();
console.log(JSON.stringify(interactiveSessions, null, 2));

// OAuth States
console.log("\n🔐 oauth_states:");
const oauthStates = db.prepare("SELECT * FROM oauth_states LIMIT 10").all();
console.log(JSON.stringify(oauthStates, null, 2));

// Users
console.log("\n👤 users:");
const users = db.prepare("SELECT * FROM users LIMIT 10").all();
console.log(JSON.stringify(users, null, 2));

// Atlassian Tokens
console.log("\n🎫 atlassian_tokens:");
const tokens = db
  .prepare(
    "SELECT account_id, expires_at, created_at FROM atlassian_tokens LIMIT 10"
  )
  .all();
console.log(JSON.stringify(tokens, null, 2));

db.close();
console.log("\n✅ Database inspection complete!");
