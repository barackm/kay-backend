import { ENV } from "../../config/env.js";
import { getUserTokens, storeUserTokens } from "../database/db-store.js";
import { getConnection, getKaySessionIdByToken } from "../connections/connection-service.js";
import type { StoredToken } from "../../types/oauth.js";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { tokens: StoredToken; expiresAt: number }>();

export function getTokensForSession(
  sessionToken: string
): StoredToken | undefined {
  const cacheKey = `session:${sessionToken}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt) {
    return cached.tokens;
  }

  const kaySessionId = getKaySessionIdByToken(sessionToken);
  if (!kaySessionId) {
    return undefined;
  }

  const connection = getConnection(kaySessionId, "jira");
  if (connection) {
    const accountId = connection.metadata.account_id as string;
    if (accountId) {
      const tokens = getUserTokens(accountId);
      if (tokens) {
        cache.set(cacheKey, {
          tokens,
          expiresAt: Date.now() + CACHE_TTL_MS,
        });
        return tokens;
      }
    }
  }

  return undefined;
}

export async function refreshAccessTokenIfNeeded(
  tokens: StoredToken
): Promise<string> {
  let accessToken = tokens.access_token;

  if (Date.now() < tokens.expires_at) {
    return tokens.access_token;
  }

  try {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: ENV.ATLASSIAN_CLIENT_ID,
        client_secret: ENV.ATLASSIAN_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to refresh token: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    console.log(
      "[Token Refresh] New token scopes:",
      data.scope || "NO SCOPE FIELD"
    );
    const updatedTokens = getUserTokens(tokens.account_id);

    if (updatedTokens) {
      storeUserTokens(
        tokens.account_id,
        data.access_token,
        data.refresh_token || tokens.refresh_token,
        data.expires_in,
        updatedTokens.user,
        updatedTokens.resources
      );
    }

    accessToken = data.access_token;
    cache.delete(`session:${tokens.account_id}`);
  } catch (error) {
    throw new Error(
      `Token refresh failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
  return accessToken;
}
