import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth/auth.js";
import {
  getCliSessionByToken,
  getUserTokens,
} from "../services/database/db-store.js";
import {
  getTokensForSession,
  refreshAccessTokenIfNeeded,
} from "../services/auth/token-service.js";
import type { UserContext } from "../types/auth.js";
import type { StoredToken } from "../types/oauth.js";

const SPACES_CACHE_TTL_MS = 5 * 60 * 1000;
const spacesCache = new Map<
  string,
  {
    jiraProjects: Array<{ key: string; name: string }>;
    confluenceSpaces: Array<{ key: string; name: string }>;
    expiresAt: number;
  }
>();

async function fetchJiraSpaces(
  tokens: StoredToken
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

async function fetchConfluenceSpaces(
  tokens: StoredToken
): Promise<Array<{ key: string; name: string }>> {
  if (!tokens) {
    return [];
  }

  const confluenceResource = tokens.resources.find((r) =>
    r.url.includes("atlassian.net")
  );

  if (!confluenceResource) {
    return [];
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessTokenIfNeeded(tokens);
  } catch (error) {
    return [];
  }

  try {
    const confluenceUrl = confluenceResource.url.replace(
      ".atlassian.net",
      ".atlassian.net/wiki"
    );

    const response = await fetch(`${confluenceUrl}/rest/api/space?limit=100`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results = data.results || data || [];
    return results.map((space: { key: string; name: string }) => ({
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

      const userTokens = getTokensForSession(sessionToken);

      if (!userTokens) {
        return c.json(
          { error: "Unauthorized: No tokens found for account" },
          401
        );
      }

      const cacheKey = `spaces:${session.account_id}`;
      const cached = spacesCache.get(cacheKey);

      let jiraProjects: Array<{ key: string; name: string }>;
      let confluenceSpaces: Array<{ key: string; name: string }>;

      if (cached && Date.now() < cached.expiresAt) {
        jiraProjects = cached.jiraProjects;
        confluenceSpaces = cached.confluenceSpaces;
      } else {
        const [projects, spaces] = await Promise.all([
          fetchJiraSpaces(userTokens),
          fetchConfluenceSpaces(userTokens),
        ]);

        jiraProjects = projects;
        confluenceSpaces = spaces;

        spacesCache.set(cacheKey, {
          jiraProjects,
          confluenceSpaces,
          expiresAt: Date.now() + SPACES_CACHE_TTL_MS,
        });
      }

      const jiraResource = userTokens.resources.find((r) =>
        r.url.includes("atlassian.net")
      );

      const userContext: UserContext = {
        accountId: session.account_id,
        displayName: userTokens.user.name,
        email: userTokens.user.email,
        baseUrl: jiraResource?.url || "",
        projects: jiraProjects,
        confluenceSpaces: confluenceSpaces,
        permissions: [],
      };

      c.set("user", userContext);
      c.set("account_id", session.account_id);
      c.set("atlassian_tokens", userTokens);
      c.set("session_token", sessionToken);
      c.set("jira_projects", jiraProjects);
      c.set("confluence_spaces", confluenceSpaces);

      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
  };
}
