import { Hono } from "hono";
import {
  getStateAccountId,
  isStateComplete,
  removeState,
} from "../services/connections/state-store.js";
import {
  generateCliSessionToken,
  generateRefreshToken,
} from "../services/auth/auth.js";
import {
  storeCliSession,
} from "../services/database/db-store.js";
import { ENV } from "../config/env.js";
import { parseDurationToMs } from "../utils/time.js";

const authStatusRouter = new Hono();

authStatusRouter.get("/status/:state", async (c) => {
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

  storeCliSession(
    sessionToken,
    refreshToken,
    accountId,
    parseDurationToMs(ENV.CLI_SESSION_EXPIRES_IN)
  );

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

export default authStatusRouter;

