import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbDir = process.env.DATABASE_DIR || join(__dirname, "../../data");
const dbPath = process.env.DATABASE_PATH || join(dbDir, "kay.db");

mkdirSync(dbDir, { recursive: true });

const db: DatabaseType = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    account_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    picture TEXT,
    account_type TEXT,
    account_status TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS atlassian_tokens (
    account_id TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS accessible_resources (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS resource_scopes (
    resource_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    PRIMARY KEY (resource_id, scope),
    FOREIGN KEY (resource_id) REFERENCES accessible_resources(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cli_sessions (
    session_token TEXT PRIMARY KEY,
    refresh_token TEXT NOT NULL UNIQUE,
    account_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_cli_sessions_account_id ON cli_sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_cli_sessions_refresh_token ON cli_sessions(refresh_token);

  CREATE TABLE IF NOT EXISTS interactive_sessions (
    session_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    context_data TEXT NOT NULL,
    history TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS pending_confirmations (
    confirmation_token TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    request_data TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    kay_session_id TEXT,
    service_name TEXT,
    account_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactive_sessions_account_id ON interactive_sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_pending_confirmations_account_id ON pending_confirmations(account_id);
  CREATE INDEX IF NOT EXISTS idx_pending_confirmations_expires_at ON pending_confirmations(expires_at);
  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

         CREATE TABLE IF NOT EXISTS kay_sessions (
           id TEXT PRIMARY KEY,
           account_id TEXT,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL,
           FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
         );

  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    kay_session_id TEXT NOT NULL,
    service_name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    metadata TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (kay_session_id) REFERENCES kay_sessions(id) ON DELETE CASCADE,
    UNIQUE(kay_session_id, service_name)
  );

  CREATE INDEX IF NOT EXISTS idx_connections_kay_session_id ON connections(kay_session_id);
  CREATE INDEX IF NOT EXISTS idx_connections_service_name ON connections(service_name);
         CREATE INDEX IF NOT EXISTS idx_kay_sessions_account_id ON kay_sessions(account_id);

  CREATE TRIGGER IF NOT EXISTS trg_update_users_updated_at
  AFTER UPDATE ON users
  BEGIN
    UPDATE users SET updated_at = (strftime('%s','now') * 1000) WHERE account_id = NEW.account_id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_update_atlassian_tokens_updated_at
  AFTER UPDATE ON atlassian_tokens
  BEGIN
    UPDATE atlassian_tokens SET updated_at = (strftime('%s','now') * 1000) WHERE account_id = NEW.account_id;
  END;

  CREATE TRIGGER IF NOT EXISTS trg_update_interactive_sessions_updated_at
  AFTER UPDATE ON interactive_sessions
  BEGIN
    UPDATE interactive_sessions SET updated_at = (strftime('%s','now') * 1000) WHERE session_id = NEW.session_id;
  END;

         CREATE TRIGGER IF NOT EXISTS trg_update_kay_sessions_updated_at
         AFTER UPDATE ON kay_sessions
         BEGIN
           UPDATE kay_sessions SET updated_at = (strftime('%s','now') * 1000) WHERE id = NEW.id;
         END;

  CREATE TRIGGER IF NOT EXISTS trg_update_connections_updated_at
  AFTER UPDATE ON connections
  BEGIN
    UPDATE connections SET updated_at = (strftime('%s','now') * 1000) WHERE id = NEW.id;
  END;
`);

export default db;
