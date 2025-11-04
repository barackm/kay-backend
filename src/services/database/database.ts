import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, statSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use an absolute path to ensure persistence
// Default to project root/data directory, or use environment variable
const dbDir = process.env.DATABASE_DIR
  ? process.env.DATABASE_DIR.startsWith("/")
    ? process.env.DATABASE_DIR
    : join(process.cwd(), process.env.DATABASE_DIR)
  : join(process.cwd(), "data");

const dbPath = process.env.DATABASE_PATH
  ? process.env.DATABASE_PATH.startsWith("/")
    ? process.env.DATABASE_PATH
    : join(process.cwd(), process.env.DATABASE_PATH)
  : join(dbDir, "kay.db");

// Ensure directory exists
mkdirSync(dbDir, { recursive: true });

// Log database location for debugging
console.log("[Database] Initializing SQLite database");
console.log("[Database] Database directory:", dbDir);
console.log("[Database] Database file:", dbPath);

const db: DatabaseType = new Database(dbPath);

// Verify database file exists
try {
  const stats = statSync(dbPath);
  console.log("[Database] Database file exists, size:", stats.size, "bytes");
} catch {
  console.log("[Database] Database file will be created on first write");
}

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
    account_id TEXT,
    device_info TEXT,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
    -- Note: account_id is nullable legacy field, not used anymore
  );

  CREATE INDEX IF NOT EXISTS idx_cli_sessions_account_id ON cli_sessions(account_id);
  CREATE INDEX IF NOT EXISTS idx_cli_sessions_refresh_token ON cli_sessions(refresh_token);

  CREATE TABLE IF NOT EXISTS interactive_sessions (
    session_id TEXT PRIMARY KEY,
    kay_session_id TEXT NOT NULL,
    context_data TEXT NOT NULL,
    history TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pending_confirmations (
    confirmation_token TEXT PRIMARY KEY,
    kay_session_id TEXT NOT NULL,
    request_data TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    kay_session_id TEXT,
    service_name TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_interactive_sessions_kay_session_id ON interactive_sessions(kay_session_id);
  CREATE INDEX IF NOT EXISTS idx_pending_confirmations_kay_session_id ON pending_confirmations(kay_session_id);
  CREATE INDEX IF NOT EXISTS idx_pending_confirmations_expires_at ON pending_confirmations(expires_at);
  CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);

         CREATE TABLE IF NOT EXISTS kay_sessions (
           id TEXT PRIMARY KEY,
           created_at INTEGER NOT NULL,
           updated_at INTEGER NOT NULL
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
         -- idx_kay_sessions_account_id removed; kay_sessions no longer stores account_id
`);

// Create indexes for connections table (after table creation)
// Only create indexes if the table exists and has the required columns
try {
  const connectionsTableInfo = db
    .prepare("PRAGMA table_info(connections)")
    .all() as Array<{ name: string }>;

  if (connectionsTableInfo.length > 0) {
    const hasKaySessionId = connectionsTableInfo.some(
      (col) => col.name === "kay_session_id"
    );
    const hasServiceName = connectionsTableInfo.some(
      (col) => col.name === "service_name"
    );

    if (hasKaySessionId) {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_connections_kay_session_id ON connections(kay_session_id)`
      );
    }
    if (hasServiceName) {
      db.exec(
        `CREATE INDEX IF NOT EXISTS idx_connections_service_name ON connections(service_name)`
      );
    }
  }
} catch (error) {
  // Table might not exist yet, that's okay
  console.log(
    "[Database] Connections table not ready for indexes yet, will be created by migration"
  );
}

db.exec(`
  -- Migration: Add device_info column to cli_sessions if it doesn't exist
  -- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check pragma
  -- This is safe to run multiple times
`);
try {
  const tableInfo = db
    .prepare("PRAGMA table_info(cli_sessions)")
    .all() as Array<{ name: string; notnull: number }>;
  const hasDeviceInfo = tableInfo.some((col) => col.name === "device_info");
  if (!hasDeviceInfo) {
    db.exec(`ALTER TABLE cli_sessions ADD COLUMN device_info TEXT`);
  }

  const accountIdColumn = tableInfo.find((col) => col.name === "account_id");
  if (accountIdColumn && accountIdColumn.notnull === 1) {
    console.log(
      "[Database Migration] Making account_id nullable in cli_sessions"
    );
    db.exec(`
      -- SQLite doesn't support MODIFY COLUMN, so we need to recreate the table
      CREATE TABLE IF NOT EXISTS cli_sessions_new (
        session_token TEXT PRIMARY KEY,
        refresh_token TEXT NOT NULL UNIQUE,
        account_id TEXT,
        device_info TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (account_id) REFERENCES users(account_id) ON DELETE CASCADE
      );
      
      INSERT INTO cli_sessions_new 
      SELECT session_token, refresh_token, account_id, NULL, expires_at, created_at 
      FROM cli_sessions;
      
      DROP TABLE cli_sessions;
      ALTER TABLE cli_sessions_new RENAME TO cli_sessions;
      
      CREATE INDEX IF NOT EXISTS idx_cli_sessions_account_id ON cli_sessions(account_id);
      CREATE INDEX IF NOT EXISTS idx_cli_sessions_refresh_token ON cli_sessions(refresh_token);
    `);
  }
} catch (error) {
  console.error("[Database Migration] Error:", error);
}

// Migration: Remove foreign key constraints from interactive_sessions and pending_confirmations
// These tables store kay_session_id, not user account_id
try {
  // Check if interactive_sessions exists and needs migration
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('interactive_sessions', 'pending_confirmations')"
    )
    .all() as Array<{ name: string }>;

  const tableNames = tables.map((t) => t.name);

  if (tableNames.includes("interactive_sessions")) {
    // Check if FK constraint exists by checking table schema
    const tableSchema = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='interactive_sessions'"
      )
      .get() as { sql: string } | undefined;

    if (tableSchema?.sql?.includes("FOREIGN KEY")) {
      console.log(
        "[Database Migration] Removing FK constraint from interactive_sessions"
      );
      db.exec(`
        CREATE TABLE IF NOT EXISTS interactive_sessions_new (
          session_id TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          context_data TEXT NOT NULL,
          history TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        
        INSERT INTO interactive_sessions_new 
        SELECT session_id, account_id, context_data, history, created_at, updated_at 
        FROM interactive_sessions;
        
        DROP TABLE interactive_sessions;
        ALTER TABLE interactive_sessions_new RENAME TO interactive_sessions;
        
        CREATE INDEX IF NOT EXISTS idx_interactive_sessions_account_id ON interactive_sessions(account_id);
      `);
    }
  }

  if (tableNames.includes("pending_confirmations")) {
    const tableSchema = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='pending_confirmations'"
      )
      .get() as { sql: string } | undefined;

    if (tableSchema?.sql?.includes("FOREIGN KEY")) {
      console.log(
        "[Database Migration] Removing FK constraint from pending_confirmations"
      );
      db.exec(`
        CREATE TABLE IF NOT EXISTS pending_confirmations_new (
          confirmation_token TEXT PRIMARY KEY,
          account_id TEXT NOT NULL,
          request_data TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        
        INSERT INTO pending_confirmations_new 
        SELECT confirmation_token, account_id, request_data, expires_at, created_at 
        FROM pending_confirmations;
        
        DROP TABLE pending_confirmations;
        ALTER TABLE pending_confirmations_new RENAME TO pending_confirmations;
        
        CREATE INDEX IF NOT EXISTS idx_pending_confirmations_account_id ON pending_confirmations(account_id);
        CREATE INDEX IF NOT EXISTS idx_pending_confirmations_expires_at ON pending_confirmations(expires_at);
      `);
    }
  }
} catch (error) {
  console.error("[Database Migration] Error removing FK constraints:", error);
}

// Migration: Add kay_session_id to connections table if it doesn't exist
try {
  const connectionsTableInfo = db
    .prepare("PRAGMA table_info(connections)")
    .all() as Array<{ name: string }>;

  const hasKaySessionId = connectionsTableInfo.some(
    (col) => col.name === "kay_session_id"
  );

  if (!hasKaySessionId && connectionsTableInfo.length > 0) {
    console.log(
      "[Database Migration] Adding kay_session_id column to connections table"
    );
    // If connections table exists but doesn't have kay_session_id, we need to recreate it
    db.exec(`
      CREATE TABLE IF NOT EXISTS connections_new (
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
      
      -- Migrate existing data (if any) - set kay_session_id to NULL for now, will need manual fix
      -- For now, we'll just drop old connections since we can't map them
      -- In production, you might want to preserve them differently
      
      DROP TABLE IF EXISTS connections;
      ALTER TABLE connections_new RENAME TO connections;
    `);
  }

  // Create indexes after ensuring table structure is correct
  db.exec(`
  CREATE INDEX IF NOT EXISTS idx_connections_kay_session_id ON connections(kay_session_id);
  CREATE INDEX IF NOT EXISTS idx_connections_service_name ON connections(service_name);
  `);
} catch (error) {
  console.error(
    "[Database Migration] Error updating connections table:",
    error
  );
}

// Migration: Add kay_session_id to oauth_states table if it doesn't exist
try {
  const oauthStatesTableInfo = db
    .prepare("PRAGMA table_info(oauth_states)")
    .all() as Array<{ name: string }>;

  const hasKaySessionId = oauthStatesTableInfo.some(
    (col) => col.name === "kay_session_id"
  );

  if (!hasKaySessionId && oauthStatesTableInfo.length > 0) {
    console.log(
      "[Database Migration] Adding kay_session_id column to oauth_states table"
    );
    db.exec(`ALTER TABLE oauth_states ADD COLUMN kay_session_id TEXT`);
  }
} catch (error) {
  console.error(
    "[Database Migration] Error updating oauth_states table:",
    error
  );
}

// Migration: Remove account_id from kay_sessions (legacy column)
try {
  const ksInfo = db.prepare("PRAGMA table_info(kay_sessions)").all() as Array<{
    name: string;
  }>;
  const hasAccountId = ksInfo.some((col) => col.name === "account_id");
  if (hasAccountId) {
    console.log("[Database Migration] Removing account_id from kay_sessions");
    db.exec(`
      CREATE TABLE IF NOT EXISTS kay_sessions_new (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      INSERT INTO kay_sessions_new (id, created_at, updated_at)
      SELECT id, created_at, updated_at FROM kay_sessions;

      DROP TABLE kay_sessions;
      ALTER TABLE kay_sessions_new RENAME TO kay_sessions;
    `);

    // Attempt to drop legacy index if it exists
    try {
      db.exec(`DROP INDEX IF EXISTS idx_kay_sessions_account_id`);
    } catch {}
  }
} catch (error) {
  console.error("[Database Migration] Error updating kay_sessions:", error);
}

// Migration: Remove legacy k_sessions table (redundant with kay_sessions)
try {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='k_sessions'"
    )
    .all() as Array<{ name: string }>;

  if (tables.length > 0) {
    console.log("[Database Migration] Removing legacy k_sessions table");
    db.exec(`DROP TABLE IF EXISTS k_sessions`);
    try {
      db.exec(`DROP INDEX IF EXISTS idx_k_sessions_account_id`);
    } catch {}
  }
} catch (error) {
  console.error("[Database Migration] Error removing k_sessions:", error);
}

// Migration: Clean up oauth_states table - remove ksession_id and account_id
try {
  const oauthStatesInfo = db
    .prepare("PRAGMA table_info(oauth_states)")
    .all() as Array<{
    name: string;
  }>;

  const hasKsessionId = oauthStatesInfo.some(
    (col) => col.name === "ksession_id"
  );
  const hasAccountId = oauthStatesInfo.some((col) => col.name === "account_id");

  if (hasKsessionId || hasAccountId) {
    console.log("[Database Migration] Cleaning up oauth_states table");
    db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_states_new (
        state TEXT PRIMARY KEY,
        kay_session_id TEXT,
        service_name TEXT,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      
      INSERT INTO oauth_states_new (state, kay_session_id, service_name, created_at, expires_at)
      SELECT 
        state,
        COALESCE(kay_session_id, ksession_id) as kay_session_id,
        service_name,
        created_at,
        expires_at
      FROM oauth_states;
      
      DROP TABLE oauth_states;
      ALTER TABLE oauth_states_new RENAME TO oauth_states;
      
      CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states(expires_at);
    `);
  }
} catch (error) {
  console.error("[Database Migration] Error cleaning up oauth_states:", error);
}

// Migration: Remove FK constraint from cli_sessions.account_id (it's now nullable and unused)
try {
  const cliSessionsInfo = db
    .prepare("PRAGMA table_info(cli_sessions)")
    .all() as Array<{ name: string }>;

  if (cliSessionsInfo.length > 0) {
    // Check if FK constraint exists by trying to recreate table without it
    const tableSchema = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='cli_sessions'"
      )
      .get() as { sql: string } | undefined;

    if (tableSchema?.sql?.includes("FOREIGN KEY")) {
      console.log(
        "[Database Migration] Removing FK constraint from cli_sessions.account_id"
      );
      db.exec(`
        CREATE TABLE IF NOT EXISTS cli_sessions_new (
          session_token TEXT PRIMARY KEY,
          refresh_token TEXT NOT NULL UNIQUE,
          account_id TEXT,
          device_info TEXT,
          expires_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
        
        INSERT INTO cli_sessions_new 
        SELECT session_token, refresh_token, account_id, device_info, expires_at, created_at 
        FROM cli_sessions;
        
        DROP TABLE cli_sessions;
        ALTER TABLE cli_sessions_new RENAME TO cli_sessions;
        
        CREATE INDEX IF NOT EXISTS idx_cli_sessions_account_id ON cli_sessions(account_id);
        CREATE INDEX IF NOT EXISTS idx_cli_sessions_refresh_token ON cli_sessions(refresh_token);
      `);
    }
  }
} catch (error) {
  console.error(
    "[Database Migration] Error removing FK from cli_sessions:",
    error
  );
}

// Migration: Rename interactive_sessions.account_id to kay_session_id
try {
  const interactiveSessionsInfo = db
    .prepare("PRAGMA table_info(interactive_sessions)")
    .all() as Array<{ name: string }>;

  const hasAccountId = interactiveSessionsInfo.some(
    (col) => col.name === "account_id"
  );
  const hasKaySessionId = interactiveSessionsInfo.some(
    (col) => col.name === "kay_session_id"
  );

  if (hasAccountId && !hasKaySessionId) {
    console.log(
      "[Database Migration] Renaming interactive_sessions.account_id to kay_session_id"
    );
    db.exec(`
      CREATE TABLE IF NOT EXISTS interactive_sessions_new (
        session_id TEXT PRIMARY KEY,
        kay_session_id TEXT NOT NULL,
        context_data TEXT NOT NULL,
        history TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      INSERT INTO interactive_sessions_new 
      SELECT session_id, account_id as kay_session_id, context_data, history, created_at, updated_at 
      FROM interactive_sessions;
      
      DROP TABLE interactive_sessions;
      ALTER TABLE interactive_sessions_new RENAME TO interactive_sessions;
      
      CREATE INDEX IF NOT EXISTS idx_interactive_sessions_kay_session_id ON interactive_sessions(kay_session_id);
    `);
    // Drop old index
    try {
      db.exec(`DROP INDEX IF EXISTS idx_interactive_sessions_account_id`);
    } catch {}
  }
} catch (error) {
  console.error(
    "[Database Migration] Error renaming interactive_sessions.account_id:",
    error
  );
}

// Migration: Rename pending_confirmations.account_id to kay_session_id
try {
  const pendingConfirmationsInfo = db
    .prepare("PRAGMA table_info(pending_confirmations)")
    .all() as Array<{ name: string }>;

  const hasAccountId = pendingConfirmationsInfo.some(
    (col) => col.name === "account_id"
  );
  const hasKaySessionId = pendingConfirmationsInfo.some(
    (col) => col.name === "kay_session_id"
  );

  if (hasAccountId && !hasKaySessionId) {
    console.log(
      "[Database Migration] Renaming pending_confirmations.account_id to kay_session_id"
    );
    db.exec(`
      CREATE TABLE IF NOT EXISTS pending_confirmations_new (
        confirmation_token TEXT PRIMARY KEY,
        kay_session_id TEXT NOT NULL,
        request_data TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      
      INSERT INTO pending_confirmations_new 
      SELECT confirmation_token, account_id as kay_session_id, request_data, expires_at, created_at 
      FROM pending_confirmations;
      
      DROP TABLE pending_confirmations;
      ALTER TABLE pending_confirmations_new RENAME TO pending_confirmations;
      
      CREATE INDEX IF NOT EXISTS idx_pending_confirmations_kay_session_id ON pending_confirmations(kay_session_id);
      CREATE INDEX IF NOT EXISTS idx_pending_confirmations_expires_at ON pending_confirmations(expires_at);
    `);
    // Drop old index
    try {
      db.exec(`DROP INDEX IF EXISTS idx_pending_confirmations_account_id`);
    } catch {}
  }
} catch (error) {
  console.error(
    "[Database Migration] Error renaming pending_confirmations.account_id:",
    error
  );
}

db.exec(`
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
