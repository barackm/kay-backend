import { Hono } from "hono";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  validateState,
  completeState,
  getStateKaySessionId,
  getStateServiceName,
} from "../services/connections/state-store.js";
import {
  connectAtlassianService,
  connectBitbucketService,
} from "../services/connections/connection-service.js";
import type { ServiceName } from "../types/connections.js";
import {
  getOAuthProvider,
  getServicesByProvider,
  isValidService,
} from "../services/connections/service-registry.js";
import {
  generateCliSessionToken,
  generateRefreshToken,
} from "../services/auth/auth.js";
import { storeCliSession } from "../services/database/db-store.js";
import { ENV } from "../config/env.js";
import { validateRefreshTokenExpiration } from "../utils/validation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serviceCallbacksRouter = new Hono();

serviceCallbacksRouter.get("/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const service = c.req.query("service") as string | undefined;

  if (!code) {
    return c.json({ error: "Missing authorization code" }, 400);
  }

  if (!state || !validateState(state)) {
    return c.json({ error: "Invalid or expired state parameter" }, 400);
  }

  const serviceName = (service || getStateServiceName(state)) as
    | ServiceName
    | undefined;

  if (!serviceName || !isValidService(serviceName)) {
    return c.json({ error: "Invalid or missing service parameter" }, 400);
  }

  const provider = getOAuthProvider(serviceName);
  if (!provider) {
    return c.json(
      { error: `Service ${serviceName} does not support OAuth` },
      400
    );
  }

  try {
    const storedKaySessionId = getStateKaySessionId(state);
    const stateServiceName = getStateServiceName(state);

    if (!storedKaySessionId) {
      return c.json(
        { error: "Invalid state. Please try connecting again." },
        400
      );
    }

    console.log(
      "[OAuth Callback] Retrieved kay_session_id from state:",
      storedKaySessionId
    );

    if (stateServiceName && stateServiceName !== serviceName) {
      return c.json({ error: "Service mismatch in state parameter" }, 400);
    }

    const providerServices = getServicesByProvider(provider);
    if (!providerServices.includes(serviceName)) {
      return c.json(
        { error: `Service ${serviceName} cannot use ${provider} OAuth` },
        400
      );
    }

    let accountId: string | undefined;

    switch (provider) {
      case "atlassian":
        if (serviceName !== "jira" && serviceName !== "confluence") {
          return c.json(
            { error: `Service ${serviceName} is not an Atlassian service` },
            400
          );
        }

        console.log(
          "[OAuth Callback] Calling connectAtlassianService with kay_session_id:",
          storedKaySessionId
        );
        const result = await connectAtlassianService(
          storedKaySessionId,
          serviceName,
          code
        );

        accountId = result.accountId;

        if (result.isFirstConnection) {
          completeState(state, result.accountId);

          const sessionToken = generateCliSessionToken(result.accountId);
          const refreshToken = generateRefreshToken();

          const refreshExpiresInMs = validateRefreshTokenExpiration(
            ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
          );

          storeCliSession(
            sessionToken,
            refreshToken,
            result.accountId,
            refreshExpiresInMs
          );
        } else {
          completeState(state, result.accountId);
        }
        break;

      case "bitbucket":
        if (serviceName !== "bitbucket") {
          return c.json(
            { error: `Service ${serviceName} is not a Bitbucket service` },
            400
          );
        }

        const callbackUrl = `${ENV.BITBUCKET_CALLBACK_URL}?service=${serviceName}`;
        console.log(
          "[OAuth Callback] Calling connectBitbucketService with kay_session_id:",
          storedKaySessionId
        );

        const bitbucketResult = await connectBitbucketService(
          storedKaySessionId,
          code,
          callbackUrl
        );

        accountId = bitbucketResult.accountId;

        if (bitbucketResult.isFirstConnection) {
          completeState(state, bitbucketResult.accountId);

          const sessionToken = generateCliSessionToken(
            bitbucketResult.accountId
          );
          const refreshToken = generateRefreshToken();

          const refreshExpiresInMs = validateRefreshTokenExpiration(
            ENV.CLI_REFRESH_TOKEN_EXPIRES_IN
          );

          storeCliSession(
            sessionToken,
            refreshToken,
            bitbucketResult.accountId,
            refreshExpiresInMs
          );
        } else {
          completeState(state, bitbucketResult.accountId);
        }
        break;

      default:
        return c.json(
          { error: `OAuth provider ${provider} not supported` },
          501
        );
    }

    const htmlPath = join(__dirname, "../templates/auth-success.html");
    const html = readFileSync(htmlPath, "utf-8");

    return c.html(html);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return c.json(
      {
        error: "Failed to complete OAuth callback",
        details: errorMessage,
      },
      500
    );
  }
});

export default serviceCallbacksRouter;
