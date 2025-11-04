import { Hono } from "hono";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import {
  validateState,
  getStateKaySessionId,
  getStateServiceName,
  removeState,
} from "../services/connections/state-store.js";
import { connectAtlassianService } from "../services/connections/connection-service.js";
import { ServiceName } from "../types/connections.js";
import {
  getOAuthProvider,
  getServicesByProvider,
  isValidService,
} from "../services/connections/service-registry.js";
import { ENV } from "../config/env.js";

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

  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  if (!(await validateState(state))) {
    return c.json(
      {
        error: "Invalid or expired state parameter",
        details: "State may have expired (10 minutes) or was not found",
      },
      400
    );
  }

  const serviceName = (service || (await getStateServiceName(state))) as
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
    const storedKaySessionId = await getStateKaySessionId(state);
    const stateServiceName = await getStateServiceName(state);

    if (!storedKaySessionId) {
      return c.json(
        { error: "Invalid state. Please try connecting again." },
        400
      );
    }

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
        if (
          serviceName !== ServiceName.JIRA &&
          serviceName !== ServiceName.CONFLUENCE
        ) {
          return c.json(
            { error: `Service ${serviceName} is not an Atlassian service` },
            400
          );
        }

        const result = await connectAtlassianService(
          storedKaySessionId,
          code,
          state
        );

        accountId = result.accountId;
        break;

      case "bitbucket":
        return c.json(
          {
            error: "Bitbucket no longer uses OAuth",
            message:
              "Bitbucket now uses email and API token authentication. Please use the /connect endpoint with email and api_token.",
          },
          400
        );

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
