import { Hono } from "hono";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { handleOAuthCallback } from "../services/oauth.js";
import { storeTokens, deleteTokens } from "../services/token-store.js";
import { generateCliSessionToken } from "../services/auth.js";
import { cliAuthMiddleware } from "../middleware/cli-auth.js";
import { buildAuthorizationUrl, generateOAuthState } from "../utils/oauth.js";
import {
  storeState,
  validateState,
  completeState,
  getStateAccountId,
  isStateComplete,
  removeState,
} from "../utils/state-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const authRouter = new Hono();

authRouter.get("/login", async (c) => {
  const state = generateOAuthState();
  storeState(state);
  const authorizationUrl = buildAuthorizationUrl(state);

  return c.json({
    message: "Please visit the URL below to authorize",
    authorization_url: authorizationUrl,
    state,
  });
});

authRouter.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  if (!state || !validateState(state)) {
    return c.json({ error: "Invalid or expired state parameter" }, 400);
  }

  try {
    const { tokens, user, resources } = await handleOAuthCallback(code);

    storeTokens(
      user.account_id,
      tokens.access_token,
      tokens.refresh_token,
      tokens.expires_in,
      user,
      resources
    );

    completeState(state, user.account_id);

    const htmlPath = join(__dirname, "../templates/auth-success.html");
    const html = readFileSync(htmlPath, "utf-8");

    return c.html(html);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("OAuth callback error:", errorMessage);

    return c.json(
      {
        error: "Failed to complete OAuth flow",
        details: errorMessage,
      },
      500
    );
  }
});

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

  const cliToken = generateCliSessionToken(accountId);

  removeState(state);

  return c.json({
    status: "completed",
    account_id: accountId,
    token: cliToken,
    message:
      "Authorization completed successfully. Use the token in Authorization header for future requests.",
  });
});

authRouter.get("/me", cliAuthMiddleware(), (c) => {
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

authRouter.post("/logout", cliAuthMiddleware(), (c) => {
  const accountId = c.get("account_id");

  deleteTokens(accountId);

  return c.json({
    message: "Logged out successfully",
  });
});

export default authRouter;
