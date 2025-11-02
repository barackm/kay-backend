import { ENV } from "../config/env.js";
import { getUserTokens, storeUserTokens } from "./db-store.js";
import type { StoredToken } from "../types/oauth.js";

export async function refreshAccessTokenIfNeeded(
  tokens: StoredToken
): Promise<string> {
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

    return data.access_token;
  } catch (error) {
    throw new Error(
      `Token refresh failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
