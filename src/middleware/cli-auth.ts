import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth.js";
import { getCliSessionByToken, getUserTokens } from "../services/db-store.js";

export function cliAuthMiddleware() {
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

      c.set("account_id", session.account_id);
      c.set("atlassian_tokens", userTokens);
      c.set("session_token", sessionToken);

      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
  };
}
