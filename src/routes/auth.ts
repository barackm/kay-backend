import { Hono } from "hono";
import {
  deleteUserTokens,
  deleteCliSession,
  getCliSessionByRefreshToken,
  deleteCliSessionByRefreshToken,
  storeCliSession,
} from "../services/database/db-store.js";
import {
  generateCliSessionToken,
  generateRefreshToken,
} from "../services/auth/auth.js";
import { ENV } from "../config/env.js";
import { validateRefreshTokenExpiration } from "../utils/validation.js";
import { authMiddleware } from "../middleware/auth.js";
import {
  getStateAccountId,
  isStateComplete,
  removeState,
} from "../services/connections/state-store.js";

const authRouter = new Hono();

authRouter.get("/status/:state", async (c) => {
  const state = c.req.param("state");

  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  if (!isStateComplete(state)) {
    return c.json({
      status: "pending",
      message: "Authorization not yet completed",
    });
  }

  const accountId = getStateAccountId(state);

  if (!accountId) {
    return c.json({ error: "Invalid state" }, 400);
  }

  const sessionToken = generateCliSessionToken(accountId);
  const refreshToken = generateRefreshToken();

  const refreshExpiresInMs = validateRefreshTokenExpiration(
    ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
  );

  storeCliSession(sessionToken, refreshToken, accountId, refreshExpiresInMs);

  removeState(state);

  return c.json({
    status: "completed",
    account_id: accountId,
    token: sessionToken,
    refresh_token: refreshToken,
    message:
      "Authorization completed successfully. Use the token in Authorization header for future requests.",
  });
});

authRouter.get("/me", authMiddleware(), (c) => {
  const tokens = c.get("atlassian_tokens");
  const accountId = c.get("account_id");

  return c.json({
    message: "User information",
    data: {
      account_id: accountId,
      name: tokens.user.name,
      email: tokens.user.email,
      picture: tokens.user.picture,
      account_type: tokens.user.account_type,
      account_status: tokens.user.account_status,
      resources: tokens.resources,
    },
  });
});

authRouter.post("/refresh", async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;

  if (!refresh_token) {
    return c.json({ error: "Missing refresh_token" }, 400);
  }

  const session = getCliSessionByRefreshToken(refresh_token);

  if (!session || Date.now() > session.expires_at) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  const newSessionToken = generateCliSessionToken(session.account_id);
  const newRefreshToken = generateRefreshToken();

  deleteCliSessionByRefreshToken(refresh_token);

  const refreshExpiresInMs = validateRefreshTokenExpiration(
    ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
  );
  storeCliSession(
    newSessionToken,
    newRefreshToken,
    session.account_id,
    refreshExpiresInMs
  );

  return c.json({
    token: newSessionToken,
    refresh_token: newRefreshToken,
    message: "Token refreshed successfully",
  });
});

authRouter.post("/logout", authMiddleware(), (c) => {
  const accountId = c.get("account_id");
  const sessionToken = c.get("session_token");

  if (sessionToken) {
    deleteCliSession(sessionToken);
  }

  deleteUserTokens(accountId);

  return c.json({
    message: "Logged out successfully",
  });
});

export default authRouter;
