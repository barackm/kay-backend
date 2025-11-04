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
import {
  createKaySession,
  getKaySessionById,
} from "../services/connections/connection-service.js";
import { ENV } from "../config/env.js";
import { validateRefreshTokenExpiration } from "../utils/validation.js";
import { parseDurationToMs } from "../utils/time.js";
import { ErrorCode, type ErrorResponse } from "../types/errors.js";

const sessionRouter = new Hono();

interface InitSessionRequest {
  device_info?: string;
  session_id?: string;
}

interface RefreshSessionRequest {
  refresh_token: string;
  session_id?: string;
}

sessionRouter.post("/init", async (c) => {
  try {
    const body = (await c.req.json().catch(() => ({}))) as InitSessionRequest;

    const refreshExpiresInMs = validateRefreshTokenExpiration(
      ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
    );
    const sessionExpiresInMs = parseDurationToMs(ENV.CLI_SESSION_EXPIRES_IN);

    let kaySessionId: string;

    if (body.session_id) {
      const existingSession = await getKaySessionById(body.session_id);
      if (existingSession) {
        kaySessionId = body.session_id;
      } else {
        kaySessionId = await createKaySession();
      }
    } else {
      kaySessionId = await createKaySession();
    }

    const kaySession = await getKaySessionById(kaySessionId);

    const sessionToken = generateCliSessionToken(kaySessionId);
    const refreshToken = generateRefreshToken();

    await storeCliSession(
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

    const session = await getCliSessionByRefreshToken(body.refresh_token);
    let kaySessionId: string | undefined;

    if (session) {
      kaySessionId = session.kaySessionId;
      const now = Date.now();
      if (now >= session.expires_at) {
        await deleteCliSessionByRefreshToken(body.refresh_token);
        kaySessionId = undefined;
      }
    }

    if (!kaySessionId) {
      if (body.session_id) {
        const existingSession = await getKaySessionById(body.session_id);
        if (existingSession) {
          kaySessionId = body.session_id;
        } else {
          return c.json<ErrorResponse>(
            {
              error: ErrorCode.TOKEN_EXPIRED,
              code: ErrorCode.TOKEN_EXPIRED,
              message:
                "Refresh token expired and session_id not found. Please initialize a new session.",
            },
            401
          );
        }
      } else {
        return c.json<ErrorResponse>(
          {
            error: ErrorCode.TOKEN_EXPIRED,
            code: ErrorCode.TOKEN_EXPIRED,
            message:
              "Refresh token expired. Please provide session_id or initialize a new session.",
          },
          401
        );
      }
    }

    const newSessionToken = generateCliSessionToken(kaySessionId);
    const sessionExpiresInMs = parseDurationToMs(ENV.CLI_SESSION_EXPIRES_IN);
    const newExpiresAt = Date.now() + sessionExpiresInMs;

    if (session) {
      await updateCliSessionToken("", newSessionToken, newExpiresAt);
    } else {
      const refreshExpiresInMs = validateRefreshTokenExpiration(
        ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
      );
      const newRefreshToken = generateRefreshToken();
      await storeCliSession(
        newSessionToken,
        newRefreshToken,
        null,
        refreshExpiresInMs,
        undefined
      );
      return c.json({
        session_id: kaySessionId,
        session_token: newSessionToken,
        refresh_token: newRefreshToken,
        expires_at: new Date(newExpiresAt).toISOString(),
      });
    }

    return c.json({
      session_id: kaySessionId,
      session_token: newSessionToken,
      refresh_token: body.refresh_token,
      expires_at: new Date(newExpiresAt).toISOString(),
    });
  } catch (error) {
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
      await deleteCliSession(sessionToken);
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
