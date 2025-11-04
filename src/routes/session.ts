import { Hono } from "hono";
import {
  generateCliSessionToken,
  generateRefreshToken,
  verifyCliSessionToken,
} from "../services/auth/auth.js";
import {
  storeCliSession,
  getCliSessionByRefreshToken,
  updateCliSessionToken,
  deleteCliSession,
  deleteCliSessionByRefreshToken,
} from "../services/database/db-store.js";
import { ENV } from "../config/env.js";
import { validateRefreshTokenExpiration } from "../utils/validation.js";
import { parseDurationToMs } from "../utils/time.js";
import { ErrorCode, type ErrorResponse } from "../types/errors.js";
import {
  createKaySession,
  getKaySessionById,
} from "../services/connections/connection-service.js";

const sessionRouter = new Hono();

interface InitSessionRequest {
  device_info?: string;
}

interface RefreshSessionRequest {
  refresh_token: string;
}

sessionRouter.post("/init", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as InitSessionRequest;

    const sessionToken = generateCliSessionToken();
    const refreshToken = generateRefreshToken();

    const refreshExpiresInMs = validateRefreshTokenExpiration(
      ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
    );
    const sessionExpiresInMs = parseDurationToMs(ENV.CLI_SESSION_EXPIRES_IN);

    const kaySessionId = createKaySession();
    const kaySession = getKaySessionById(kaySessionId);

    storeCliSession(
      sessionToken,
      refreshToken,
      null,
      refreshExpiresInMs,
      body.device_info ? JSON.stringify(body.device_info) : undefined
    );

    const expiresAt = Date.now() + sessionExpiresInMs;

    return c.json({
      session_id: kaySessionId,
      session_token: sessionToken,
      refresh_token: refreshToken,
      expires_at: new Date(expiresAt).toISOString(),
    });
  } catch (error) {
    console.error("[POST /session/init] Error:", error);
    console.error(
      "[POST /session/init] Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json<ErrorResponse>(
      {
        error: ErrorCode.SERVER_ERROR,
        code: ErrorCode.SERVER_ERROR,
        message: "Internal error",
        details: errorMessage,
      },
      500
    );
  }
});

sessionRouter.post("/refresh", async (c) => {
  try {
    const body = (await c.req
      .json()
      .catch(() => ({}))) as RefreshSessionRequest;

    if (!body.refresh_token) {
      return c.json({ error: "Missing refresh_token" }, 400);
    }

    const session = getCliSessionByRefreshToken(body.refresh_token);

    if (!session) {
      return c.json<ErrorResponse>(
        {
          error: ErrorCode.TOKEN_INVALID,
          code: ErrorCode.TOKEN_INVALID,
          message: "Invalid refresh token",
        },
        403
      );
    }

    const now = Date.now();
    if (now >= session.expires_at) {
      deleteCliSessionByRefreshToken(body.refresh_token);
      return c.json<ErrorResponse>(
        {
          error: ErrorCode.TOKEN_EXPIRED,
          code: ErrorCode.TOKEN_EXPIRED,
          message: "Refresh token expired",
        },
        401
      );
    }

    const newSessionToken = generateCliSessionToken();
    const sessionExpiresInMs = parseDurationToMs(ENV.CLI_SESSION_EXPIRES_IN);
    const newExpiresAt = now + sessionExpiresInMs;

    updateCliSessionToken(session.session_token, newSessionToken, newExpiresAt);

    return c.json({
      session_token: newSessionToken,
      refresh_token: body.refresh_token,
      expires_at: new Date(newExpiresAt).toISOString(),
    });
  } catch (error) {
    console.error("[POST /session/refresh] Error:", error);
    console.error(
      "[POST /session/refresh] Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json<ErrorResponse>(
      {
        error: ErrorCode.SERVER_ERROR,
        code: ErrorCode.SERVER_ERROR,
        message: "Internal error",
        details: errorMessage,
      },
      500
    );
  }
});

sessionRouter.delete("/revoke", async (c) => {
  try {
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
      deleteCliSession(sessionToken);
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
      return c.json<ErrorResponse>(
        {
          error: ErrorCode.TOKEN_INVALID,
          code: ErrorCode.TOKEN_INVALID,
          message: "Token malformed, revoked, or tampered",
        },
        403
      );
    }

    return c.json({ message: "Session revoked successfully" });
  } catch (error) {
    console.error("[DELETE /session/revoke] Error:", error);
    console.error(
      "[DELETE /session/revoke] Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return c.json<ErrorResponse>(
      {
        error: ErrorCode.SERVER_ERROR,
        code: ErrorCode.SERVER_ERROR,
        message: "Internal error",
        details: errorMessage,
      },
      500
    );
  }
});

export default sessionRouter;
