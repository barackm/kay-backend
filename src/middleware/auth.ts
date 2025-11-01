import type { Context, Next } from "hono";
import jwt from "jsonwebtoken";
import type { JiraCredentials } from "../types/auth.js";
import { verifyToken } from "../services/auth.js";
import { fetchUserContext } from "../services/jira.js";

export function authMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: Missing or invalid token" }, 401);
    }

    const token = authHeader.substring(7);

    try {
      const decoded = verifyToken(token);

      const credentials: JiraCredentials = {
        email: decoded.email,
        apiToken: decoded.apiToken,
        baseUrl: decoded.baseUrl,
      };

      const userContext = await fetchUserContext(credentials);

      c.set("user", userContext);

      await next();
    } catch (error) {
      if (
        error instanceof jwt.JsonWebTokenError ||
        error instanceof jwt.TokenExpiredError
      ) {
        return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
      }

      if (
        error instanceof Error &&
        error.message.startsWith("Jira API error:")
      ) {
        return c.json(
          { error: "Internal Server Error: Failed to fetch user context" },
          500
        );
      }

      return c.json({ error: "Internal Server Error" }, 500);
    }
  };
}
