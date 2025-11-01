import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth.js";
import { getTokens } from "../services/token-store.js";

export function cliAuthMiddleware() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized: Missing or invalid token" }, 401);
    }

    const token = authHeader.substring(7);

    try {
      const payload = verifyCliSessionToken(token);
      const storedTokens = getTokens(payload.account_id);

      if (!storedTokens) {
        return c.json(
          { error: "Unauthorized: No tokens found for account" },
          401
        );
      }

      c.set("account_id", payload.account_id);
      c.set("atlassian_tokens", storedTokens);

      await next();
    } catch (error) {
      return c.json({ error: "Unauthorized: Invalid or expired token" }, 401);
    }
  };
}
