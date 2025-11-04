import type { Context, Next } from "hono";
import { verifyCliSessionToken } from "../services/auth/auth.js";
import { getCliSessionBySessionToken } from "../services/database/db-store.js";
import { ErrorCode, type ErrorResponse } from "../types/errors.js";

export function sessionAuthMiddleware() {
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
      let payload;
      try {
        payload = verifyCliSessionToken(sessionToken);
      } catch (verifyError) {
        if (
          verifyError instanceof Error &&
          verifyError.name === "TokenExpiredError"
        ) {
          payload = verifyCliSessionToken(sessionToken, {
            ignoreExpiration: true,
          });
        } else {
          throw verifyError;
        }
      }

      const session = await getCliSessionBySessionToken(sessionToken);

      if (!session) {
        const kaySessionId = payload.kay_session_id;
        if (kaySessionId) {
          c.set("session_id", kaySessionId);
        }
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_INVALID,
            code: ErrorCode.TOKEN_INVALID,
            message: "Token revoked or not found",
          },
          403
        );
      }

      const now = Date.now();
      if (now >= session.expires_at) {
        const kaySessionId = payload.kay_session_id;
        if (kaySessionId) {
          c.set("session_id", kaySessionId);
        }
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_EXPIRED,
            code: ErrorCode.TOKEN_EXPIRED,
            message: "Token valid but expired",
          },
          401
        );
      }

      c.set("session_token", sessionToken);
      const kaySessionId = payload.kay_session_id;
      if (kaySessionId) {
        c.set("session_id", kaySessionId);
      }
      c.set("session_payload", payload);

      await next();
    } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") {
        try {
          const payload = verifyCliSessionToken(sessionToken, {
            ignoreExpiration: true,
          });
          const kaySessionId = payload.kay_session_id;
          if (kaySessionId) {
            c.set("session_id", kaySessionId);
          }
        } catch {
          // Ignore if we can't extract session_id from expired token
        }
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
