import db from "./database.js";
import type {
  StoredToken,
  AtlassianUser,
  AccessibleResource,
} from "../../types/oauth.js";

export function storeUserTokens(
  accountId: string,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  user: AtlassianUser,
  resources: AccessibleResource[]
): void {
  const now = Date.now();

  db.transaction(() => {
    db.prepare(
      `INSERT OR REPLACE INTO users (account_id, name, email, picture, account_type, account_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM users WHERE account_id = ?), ?), ?)`
    ).run(
      accountId,
      user.name,
      user.email,
      user.picture,
      user.account_type,
      user.account_status,
      accountId,
      now,
      now
    );

    db.prepare(
      `INSERT OR REPLACE INTO atlassian_tokens (account_id, access_token, refresh_token, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM atlassian_tokens WHERE account_id = ?), ?), ?)`
    ).run(
      accountId,
      accessToken,
      refreshToken,
      now + expiresIn * 1000,
      accountId,
      now,
      now
    );

    const resourceIdsToDelete = db
      .prepare(`SELECT id FROM accessible_resources WHERE account_id = ?`)
      .all(accountId) as Array<{ id: string }>;

    if (resourceIdsToDelete.length > 0) {
      const placeholders = resourceIdsToDelete.map(() => "?").join(",");
      db.prepare(
        `DELETE FROM resource_scopes WHERE resource_id IN (${placeholders})`
      ).run(...resourceIdsToDelete.map((r) => r.id));
    }

    db.prepare(`DELETE FROM accessible_resources WHERE account_id = ?`).run(
      accountId
    );

    for (const resource of resources) {
      const resourceDbId = `${accountId}:${resource.id}`;
      console.log(
        `[DB] Storing resource ${resource.id} with scopes:`,
        resource.scopes
      );
      db.prepare(
        `INSERT OR REPLACE INTO accessible_resources (id, account_id, resource_id, url, name, avatar_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        resourceDbId,
        accountId,
        resource.id,
        resource.url,
        resource.name,
        resource.avatarUrl,
        now
      );

      for (const scope of resource.scopes) {
        db.prepare(
          `INSERT OR IGNORE INTO resource_scopes (resource_id, scope) VALUES (?, ?)`
        ).run(resourceDbId, scope);
      }
    }
  })();
}

export function getUserTokens(accountId: string): StoredToken | undefined {
  const user = db
    .prepare(`SELECT * FROM users WHERE account_id = ?`)
    .get(accountId) as
    | {
        account_id: string;
        name: string;
        email: string;
        picture: string | null;
        account_type: string | null;
        account_status: string | null;
      }
    | undefined;

  if (!user) return undefined;

  const tokens = db
    .prepare(`SELECT * FROM atlassian_tokens WHERE account_id = ?`)
    .get(accountId) as
    | {
        access_token: string;
        refresh_token: string;
        expires_at: number;
      }
    | undefined;

  if (!tokens) return undefined;

  const resources = db
    .prepare(`SELECT * FROM accessible_resources WHERE account_id = ?`)
    .all(accountId) as Array<{
    id: string;
    resource_id: string;
    url: string;
    name: string;
    avatar_url: string | null;
  }>;

  const resourcesWithScopes = resources.map((resource) => {
    const scopes = db
      .prepare(`SELECT scope FROM resource_scopes WHERE resource_id = ?`)
      .all(resource.id) as Array<{ scope: string }>;

    const scopeList = scopes.map((s) => s.scope);
    console.log(
      `[DB] Retrieved resource ${resource.resource_id} with ${scopeList.length} scopes:`,
      scopeList
    );

    return {
      id: resource.resource_id,
      url: resource.url,
      name: resource.name,
      scopes: scopeList,
      avatarUrl: resource.avatar_url || "",
    };
  });

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    account_id: accountId,
    resources: resourcesWithScopes,
    user: {
      account_id: accountId,
      name: user.name,
      email: user.email,
      picture: user.picture || "",
      account_type: user.account_type || "",
      account_status: user.account_status || "",
    },
  };
}

export function deleteUserTokens(accountId: string): void {
  db.transaction(() => {
    db.prepare(`DELETE FROM cli_sessions WHERE account_id = ?`).run(accountId);
    db.prepare(`DELETE FROM accessible_resources WHERE account_id = ?`).run(
      accountId
    );
    db.prepare(`DELETE FROM atlassian_tokens WHERE account_id = ?`).run(
      accountId
    );
    // Note: interactive_sessions and pending_confirmations are deleted via CASCADE
    db.prepare(`DELETE FROM users WHERE account_id = ?`).run(accountId);
  })();
}

export function storeCliSession(
  sessionToken: string,
  refreshToken: string,
  accountId: string,
  expiresIn: number
): void {
  const now = Date.now();
  db.prepare(
    `INSERT OR REPLACE INTO cli_sessions (session_token, refresh_token, account_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionToken, refreshToken, accountId, now + expiresIn * 1000, now);
}

export function getCliSessionByToken(sessionToken: string):
  | {
      account_id: string;
      refresh_token: string;
      expires_at: number;
    }
  | undefined {
  return db
    .prepare(
      `SELECT account_id, refresh_token, expires_at FROM cli_sessions WHERE session_token = ?`
    )
    .get(sessionToken) as
    | {
        account_id: string;
        refresh_token: string;
        expires_at: number;
      }
    | undefined;
}

export function getCliSessionByRefreshToken(refreshToken: string):
  | {
      session_token: string;
      account_id: string;
      expires_at: number;
    }
  | undefined {
  return db
    .prepare(
      `SELECT session_token, account_id, expires_at FROM cli_sessions WHERE refresh_token = ?`
    )
    .get(refreshToken) as
    | {
        session_token: string;
        account_id: string;
        expires_at: number;
      }
    | undefined;
}

export function deleteCliSession(sessionToken: string): void {
  db.prepare(`DELETE FROM cli_sessions WHERE session_token = ?`).run(
    sessionToken
  );
}

export function deleteCliSessionByRefreshToken(refreshToken: string): void {
  db.prepare(`DELETE FROM cli_sessions WHERE refresh_token = ?`).run(
    refreshToken
  );
}
