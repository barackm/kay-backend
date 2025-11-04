import { Hono } from "hono";
import {
  deleteCliSession,
  getCliSessionByRefreshToken,
  deleteCliSessionByRefreshToken,
  storeCliSession,
} from "../services/database/db-store.js";
import {
  generateCliSessionToken,
  generateRefreshToken,
  verifyCliSessionToken,
} from "../services/auth/auth.js";
import { ENV } from "../config/env.js";
import { validateRefreshTokenExpiration } from "../utils/validation.js";
import { authMiddleware } from "../middleware/auth.js";
import { validateState } from "../services/connections/state-store.js";

const authRouter = new Hono();

authRouter.get("/status/:state", async (c) => {
  const state = c.req.param("state");

  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  if (!(await validateState(state))) {
    return c.json({
      status: "error",
      message: "Invalid or expired state parameter",
    });
  }

  return c.json({
    status: "pending",
    message: "Authorization is still in progress. Please wait...",
  });
});

authRouter.post("/refresh", async (c) => {
  const body = await c.req.json();
  const { refresh_token } = body;

  if (!refresh_token) {
    return c.json({ error: "Missing refresh_token" }, 400);
  }

  const session = await getCliSessionByRefreshToken(refresh_token);

  if (!session || Date.now() > session.expires_at) {
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  const kaySessionId = session.kaySessionId;
  const newSessionToken = generateCliSessionToken(kaySessionId);
  const newRefreshToken = generateRefreshToken();

  await deleteCliSessionByRefreshToken(refresh_token);

  const refreshExpiresInMs = validateRefreshTokenExpiration(
    ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
  );
  await storeCliSession(
    newSessionToken,
    newRefreshToken,
    null,
    refreshExpiresInMs,
    undefined
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

  return c.json({
    message: "Logged out successfully",
  });
});

export default authRouter;
