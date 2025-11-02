import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth.js";
import { getCliSessionByToken, getUserTokens } from "../services/db-store.js";
import { refreshAccessTokenIfNeeded } from "../services/token-service.js";
import type { UserContext } from "../types/auth.js";

async function fetchJiraSpaces(
  tokens: ReturnType<typeof getUserTokens>
): Promise<Array<{ key: string; name: string }>> {
  if (!tokens) {
    return [];
  }

  const jiraResource = tokens.resources.find((r) =>
    r.url.includes("atlassian.net")
  );

  if (!jiraResource) {
    return [];
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessTokenIfNeeded(tokens);
  } catch (error) {
    return [];
  }

  try {
    const response = await fetch(
      `${jiraResource.url}/rest/api/3/project/search?maxResults=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return (data.values || []).map((space: { key: string; name: string }) => ({
      key: space.key,
      name: space.name,
    }));
  } catch (error) {
    return [];
  }
}

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: Missing or invalid token" }, 401);
    }

    const sessionToken = authHeader.substring(7);

    try {
      verifyCliSessionToken(sessionToken);

      const session = getCliSessionByToken(sessionToken);

      if (!session) {
        return c.json(
          { error: "Unauthorized: Session not found or expired" },
          401
        );
      }

      if (Date.now() > session.expires_at) {
        return c.json({ error: "Unauthorized: Session expired" }, 401);
      }

      const userTokens = getUserTokens(session.account_id);

      if (!userTokens) {
        return c.json(
          { error: "Unauthorized: No tokens found for account" },
          401
        );
      }

      const spaces = await fetchJiraSpaces(userTokens);

      console.log(
        `[authMiddleware] Fetched ${spaces.length} Jira spaces for user ${session.account_id}:`,
        spaces
      );

      const jiraResource = userTokens.resources.find((r) =>
        r.url.includes("atlassian.net")
      );

      const userContext: UserContext = {
        accountId: session.account_id,
        displayName: userTokens.user.name,
        email: userTokens.user.email,
        baseUrl: jiraResource?.url || "",
        projects: spaces,
        permissions: [],
      };

      c.set("user", userContext);
      c.set("account_id", session.account_id);
      c.set("atlassian_tokens", userTokens);
      c.set("session_token", sessionToken);
      c.set("jira_projects", spaces);

      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
  };
}
