import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth/auth.js";
import { getCliSessionByToken } from "../services/database/db-store.js";
import { ErrorCode, type ErrorResponse } from "../types/errors.js";

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
      // Verify token and extract payload
      const payload = verifyCliSessionToken(sessionToken);

      const session = await getCliSessionByToken(sessionToken);

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

      // Extract kay_session_id from JWT token payload
      const kaySessionId = payload.kay_session_id;

      if (!kaySessionId) {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_INVALID,
            code: ErrorCode.TOKEN_INVALID,
            message: "Token missing kay_session_id",
          },
          403
        );
      }

      c.set("session_id", kaySessionId);
      c.set("session_token", sessionToken);
      c.set("account_id", kaySessionId); // For backward compatibility only

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
