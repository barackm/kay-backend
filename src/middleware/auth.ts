import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth/auth.js";
import { getCliSessionByToken } from "../services/database/db-store.js";
import {
  getTokensForSession,
  refreshAccessTokenIfNeeded,
} from "../services/auth/token-service.js";
import type { UserContext } from "../types/auth.js";
import type { StoredToken } from "../types/oauth.js";
import { getKaySessionIdByToken } from "../services/connections/connection-service.js";

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
      return c.json<ErrorResponse>(
        {
          error: ErrorCode.TOKEN_MISSING,
          code: ErrorCode.TOKEN_MISSING,
          message: "No Authorization header or invalid format",
        },
        401
      );
    }

    const sessionToken = authHeader.substring(7);

    try {
      verifyCliSessionToken(sessionToken);

      const session = getCliSessionByToken(sessionToken);

      if (!session) {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_INVALID,
            code: ErrorCode.TOKEN_INVALID,
            message: "Token revoked or not found",
          },
          403
        );
      }

      if (Date.now() > session.expires_at) {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_EXPIRED,
            code: ErrorCode.TOKEN_EXPIRED,
            message: "Token valid but expired",
          },
          401
        );
      }

      const userTokens = getTokensForSession(sessionToken);

      if (!userTokens) {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_INVALID,
            code: ErrorCode.TOKEN_INVALID,
            message: "No tokens found for account",
          },
          403
        );
      }

      const kaySessionId = getKaySessionIdByToken(sessionToken);
      const cacheKey = `spaces:${kaySessionId || "unknown"}`;
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
        accountId: kaySessionId || "",
        displayName: userTokens.user.name,
        email: userTokens.user.email,
        baseUrl: jiraResource?.url || "",
        projects: jiraProjects,
        confluenceSpaces: confluenceSpaces,
        permissions: [],
      };

      c.set("user", userContext);
      if (kaySessionId) {
        c.set("session_id", kaySessionId);
      }
      c.set("atlassian_tokens", userTokens);
      c.set("session_token", sessionToken);
      c.set("jira_projects", jiraProjects);
      c.set("confluence_spaces", confluenceSpaces);

      await next();
    } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_EXPIRED,
            code: ErrorCode.TOKEN_EXPIRED,
            message: "Token valid but expired",
          },
          401
        );
      }

      if (error instanceof Error && error.name === "JsonWebTokenError") {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_INVALID,
            code: ErrorCode.TOKEN_INVALID,
            message: "Token malformed, revoked, or tampered",
          },
          403
        );
      }

      return c.json<ErrorResponse>(
        {
          error: ErrorCode.TOKEN_INVALID,
          code: ErrorCode.TOKEN_INVALID,
          message: "Token malformed, revoked, or tampered",
        },
        403
      );
    }
  };
}
