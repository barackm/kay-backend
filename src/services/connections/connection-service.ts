import db from "../database/database.js";
import { getCliSessionByToken } from "../database/db-store.js";
import type {
  Connection,
  ServiceName,
  ConnectionMetadata,
  ConnectionStatus,
} from "../../types/connections.js";
import { handleOAuthCallback } from "../oauth/oauth.js";
import { storeUserTokens, getUserTokens } from "../database/db-store.js";
import type { StoredToken } from "../../types/oauth.js";
import { ENV } from "../../config/env.js";

export function getKaySessionById(kaySessionId: string):
  | {
      id: string;
      account_id: string | null;
    }
  | undefined {
  console.log("[getKaySessionById] Looking up kay_session_id:", kaySessionId);

  const kaySession = db
    .prepare(`SELECT id, account_id FROM kay_sessions WHERE id = ?`)
    .get(kaySessionId) as
    | {
        id: string;
        account_id: string | null;
      }
    | undefined;

  if (!kaySession) {
    const allSessions = db
      .prepare(`SELECT id FROM kay_sessions LIMIT 5`)
      .all() as Array<{ id: string }>;
    console.log(
      "[getKaySessionById] Session not found. Existing sessions:",
      allSessions.map((s) => s.id)
    );
  } else {
    console.log("[getKaySessionById] Found kay_session:", kaySession);
  }

  return kaySession;
}

export function createKaySession(): string {
  const kaySessionId = `kaysession_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const now = Date.now();

  console.log("[createKaySession] Creating kay_session with id:", kaySessionId);

  const result = db
    .prepare(
      `INSERT INTO kay_sessions (id, account_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
    )
    .run(kaySessionId, null, now, now);

  console.log("[createKaySession] Insert result:", result.changes, "changes");

  const verify = db
    .prepare(`SELECT id FROM kay_sessions WHERE id = ?`)
    .get(kaySessionId) as { id: string } | undefined;

  if (!verify) {
    console.error(
      "[createKaySession] ERROR: Session was not created successfully!"
    );
  } else {
    console.log("[createKaySession] Verified session exists:", verify.id);
  }

  return kaySessionId;
}

export function getOrCreateKaySessionByToken(sessionToken: string): string {
  const session = getCliSessionByToken(sessionToken);
  if (!session) {
    throw new Error("Invalid session token");
  }

  const existing = db
    .prepare(`SELECT id FROM kay_sessions WHERE account_id = ?`)
    .get(session.account_id) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const kaySessionId = `kaysession_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const now = Date.now();

  db.prepare(
    `INSERT INTO kay_sessions (id, account_id, created_at, updated_at) VALUES (?, ?, ?, ?)`
  ).run(kaySessionId, session.account_id, now, now);

  return kaySessionId;
}

export function getKaySessionIdByToken(
  sessionToken: string
): string | undefined {
  const session = getCliSessionByToken(sessionToken);
  if (!session) {
    return undefined;
  }

  const kaySession = db
    .prepare(`SELECT id FROM kay_sessions WHERE account_id = ?`)
    .get(session.account_id) as { id: string } | undefined;

  return kaySession?.id;
}

export function updateKaySessionAccountId(
  kaySessionId: string,
  accountId: string
): void {
  db.prepare(`UPDATE kay_sessions SET account_id = ? WHERE id = ?`).run(
    accountId,
    kaySessionId
  );
}

export function storeConnection(
  kaySessionId: string,
  serviceName: ServiceName,
  accessToken: string,
  refreshToken: string | undefined,
  expiresAt: number | undefined,
  metadata: ConnectionMetadata
): Connection {
  const connectionId = `conn_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const now = Date.now();

  db.prepare(
    `INSERT OR REPLACE INTO connections 
     (id, kay_session_id, service_name, access_token, refresh_token, expires_at, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM connections WHERE kay_session_id = ? AND service_name = ?), ?), ?)`
  ).run(
    connectionId,
    kaySessionId,
    serviceName,
    accessToken,
    refreshToken || null,
    expiresAt || null,
    JSON.stringify(metadata),
    kaySessionId,
    serviceName,
    now,
    now
  );

  const connection: Connection = {
    id: connectionId,
    kay_session_id: kaySessionId,
    service_name: serviceName,
    access_token: accessToken,
    metadata,
    created_at: now,
    updated_at: now,
  };

  if (refreshToken !== undefined) {
    connection.refresh_token = refreshToken;
  }

  if (expiresAt !== undefined) {
    connection.expires_at = expiresAt;
  }

  return connection;
}

export function getConnection(
  kaySessionId: string,
  serviceName: ServiceName
): Connection | undefined {
  const row = db
    .prepare(
      `SELECT * FROM connections WHERE kay_session_id = ? AND service_name = ?`
    )
    .get(kaySessionId, serviceName) as
    | {
        id: string;
        kay_session_id: string;
        service_name: string;
        access_token: string;
        refresh_token: string | null;
        expires_at: number | null;
        metadata: string;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) {
    return undefined;
  }

  const connection: Connection = {
    id: row.id,
    kay_session_id: row.kay_session_id,
    service_name: row.service_name as ServiceName,
    access_token: row.access_token,
    metadata: JSON.parse(row.metadata) as ConnectionMetadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (row.refresh_token !== null) {
    connection.refresh_token = row.refresh_token;
  }

  if (row.expires_at !== null) {
    connection.expires_at = row.expires_at;
  }

  return connection;
}

export function deleteConnection(
  kaySessionId: string,
  serviceName: ServiceName
): boolean {
  const result = db
    .prepare(
      `DELETE FROM connections WHERE kay_session_id = ? AND service_name = ?`
    )
    .run(kaySessionId, serviceName);

  return result.changes > 0;
}

export function getConnectionStatus(kaySessionId: string): ConnectionStatus {
  const connections = db
    .prepare(`SELECT service_name FROM connections WHERE kay_session_id = ?`)
    .all(kaySessionId) as Array<{ service_name: string }>;

  const status: ConnectionStatus = {
    kyg: false,
    jira: false,
    confluence: false,
    bitbucket: false,
  };

  for (const conn of connections) {
    status[conn.service_name] = true;
  }

  return status;
}

export async function connectAtlassianService(
  kaySessionId: string,
  serviceName: "jira" | "confluence",
  code: string
): Promise<{
  connection: Connection;
  isFirstConnection: boolean;
  accountId: string;
}> {
  const kaySession = getKaySessionById(kaySessionId);
  if (!kaySession) {
    throw new Error("Invalid kay_session_id");
  }

  const existingJiraConnection = getConnection(kaySessionId, "jira");
  const existingConfluenceConnection = getConnection(
    kaySessionId,
    "confluence"
  );
  const hasExistingConnections =
    existingJiraConnection || existingConfluenceConnection;

  if (hasExistingConnections) {
    console.log(
      `[connectAtlassianService] Existing Atlassian connections found (jira: ${!!existingJiraConnection}, confluence: ${!!existingConfluenceConnection}), will be replaced after successful authentication`
    );
  }

  let tokens, user, resources;
  try {
    const result = await handleOAuthCallback(code);
    tokens = result.tokens;
    user = result.user;
    resources = result.resources;
  } catch (error) {
    if (hasExistingConnections) {
      console.log(
        "[connectAtlassianService] OAuth callback failed, deleting existing connections"
      );
      if (existingJiraConnection) {
        deleteConnection(kaySessionId, "jira");
      }
      if (existingConfluenceConnection) {
        deleteConnection(kaySessionId, "confluence");
      }
    }
    throw error;
  }

  if (!tokens.refresh_token) {
    if (hasExistingConnections) {
      console.log(
        "[connectAtlassianService] No refresh token received, deleting existing connections"
      );
      if (existingJiraConnection) {
        deleteConnection(kaySessionId, "jira");
      }
      if (existingConfluenceConnection) {
        deleteConnection(kaySessionId, "confluence");
      }
    }
    throw new Error("No refresh token received from Atlassian");
  }

  const accountId = user.account_id;

  try {
    storeUserTokens(
      accountId,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      user,
      resources
    );
  } catch (error) {
    if (hasExistingConnections) {
      console.log(
        "[connectAtlassianService] Failed to store user tokens, deleting existing connections"
      );
      if (existingJiraConnection) {
        deleteConnection(kaySessionId, "jira");
      }
      if (existingConfluenceConnection) {
        deleteConnection(kaySessionId, "confluence");
      }
    }
    throw error;
  }

  const jiraResource = resources.find((r) => r.url.includes("atlassian.net"));
  const metadata: ConnectionMetadata = {
    account_id: accountId,
    url: jiraResource?.url || "",
    resources: resources.map((r) => ({
      id: r.id,
      url: r.url,
      name: r.name,
      scopes: r.scopes,
    })),
  };

  const isFirstConnection = kaySession.account_id === null;

  if (isFirstConnection) {
    updateKaySessionAccountId(kaySessionId, accountId);
  }

  const expiresAt = Date.now() + tokens.expires_in * 1000;

  const connection = storeConnection(
    kaySessionId,
    serviceName,
    tokens.access_token,
    tokens.refresh_token,
    expiresAt,
    metadata
  );

  const atlassianServices: ("jira" | "confluence")[] = ["jira", "confluence"];
  const otherService = atlassianServices.find((s) => s !== serviceName);

  if (otherService) {
    const existingConnection = getConnection(kaySessionId, otherService);
    if (!existingConnection) {
      console.log(
        `[connectAtlassianService] Auto-connecting ${otherService} since it shares the same OAuth tokens`
      );
      storeConnection(
        kaySessionId,
        otherService,
        tokens.access_token,
        tokens.refresh_token,
        expiresAt,
        metadata
      );
    }
  }

  return {
    connection,
    isFirstConnection,
    accountId,
  };
}

export function getAtlassianTokensFromConnection(
  kaySessionId: string
): StoredToken | undefined {
  const connection = getConnection(kaySessionId, "jira");
  if (!connection) {
    return undefined;
  }

  const accountId = connection.metadata.account_id as string;
  if (!accountId) {
    return undefined;
  }

  return getUserTokens(accountId);
}

interface KygLoginResponse {
  user: {
    userid: number;
    email: string;
    firstName: string;
    lastName: string;
    CompanyID: number;
    CompanyName: string;
    roles: Array<{
      RoleID: number;
      Name: string;
      LandingPage: string;
    }>;
    [key: string]: unknown;
  };
  token: string;
}

export async function connectKygService(
  kaySessionId: string,
  email: string,
  password: string
): Promise<{
  connection: Connection;
  isFirstConnection: boolean;
  accountId: string;
}> {
  if (!ENV.KYG_CORE_BASE_URL) {
    throw new Error("KYG_CORE_BASE_URL is not configured");
  }

  const kaySession = getKaySessionById(kaySessionId);
  if (!kaySession) {
    throw new Error("Invalid kay_session_id");
  }

  const existingConnection = getConnection(kaySessionId, "kyg");
  if (existingConnection) {
    console.log(
      "[connectKygService] Existing KYG connection found, will be replaced after successful authentication"
    );
  }

  const loginUrl = `${ENV.KYG_CORE_BASE_URL}/authentication/login`;

  const response = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  console.log("[connectKygService] Response status:", response.status);
  if (!response.ok) {
    const errorText = await response.text();
    console.error("[connectKygService] Authentication failed:", errorText);

    if (existingConnection) {
      console.log(
        "[connectKygService] Deleting existing connection due to authentication failure"
      );
      deleteConnection(kaySessionId, "kyg");
    }

    throw new Error(
      `KYG authentication failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as KygLoginResponse;

  if (!data.token) {
    if (existingConnection) {
      console.log(
        "[connectKygService] No token received, deleting existing connection"
      );
      deleteConnection(kaySessionId, "kyg");
    }
    throw new Error("No token received from KYG");
  }

  const accountId = `kyg_${data.user.userid}`;
  const isFirstConnection = kaySession.account_id === null;

  if (isFirstConnection) {
    updateKaySessionAccountId(kaySessionId, accountId);
  }

  const metadata: ConnectionMetadata = {
    account_id: accountId,
    user_id: data.user.userid,
    email: data.user.email,
    first_name: data.user.firstName,
    last_name: data.user.lastName,
    company_id: data.user.CompanyID,
    company_name: data.user.CompanyName,
    roles: data.user.roles,
    user_data: data.user,
  };

  const connection = storeConnection(
    kaySessionId,
    "kyg",
    data.token,
    undefined,
    undefined,
    metadata
  );

  return {
    connection,
    isFirstConnection,
    accountId,
  };
}
