import { Hono } from "hono";
import { sessionAuthMiddleware } from "../middleware/session-auth.js";
import {
  getKaySessionById,
  createKaySession,
  getConnectionStatus,
  deleteConnection,
  connectKygService,
  connectBitbucketService,
  getConnection,
} from "../services/connections/connection-service.js";
import { ServiceName } from "../types/connections.js";
import {
  buildServiceAuthorizationUrl,
  generateOAuthState,
} from "../services/oauth/service-oauth.js";
import {
  getServiceConfig,
  getOAuthProvider,
} from "../services/connections/service-registry.js";
import { storeState } from "../services/connections/state-store.js";

const connectionsRouter = new Hono();

connectionsRouter.get("/", sessionAuthMiddleware(), async (c) => {
  const sessionId = c.req.query("session_id") as string | undefined;

  if (!sessionId) {
    return c.json(
      {
        error: "TOKEN_MISSING",
        code: "TOKEN_MISSING",
        message: "Missing required parameter: session_id",
      },
      401
    );
  }

  const kaySession = await getKaySessionById(sessionId);
  if (!kaySession) {
    return c.json(
      {
        error: "TOKEN_INVALID",
        code: "TOKEN_INVALID",
        message: "Invalid session_id - session not found",
        session_reset_required: true,
      },
      401
    );
  }

  const status = await getConnectionStatus(sessionId);

  return c.json({
    connections: status,
  });
});

connectionsRouter.post("/connect", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    session_id?: string;
    email?: string;
    password?: string;
    api_token?: string;
    api_key?: string;
  };
  const serviceName = c.req.query("service") as ServiceName | undefined;

  if (!serviceName) {
    return c.json({ error: "Missing required parameter: service" }, 400);
  }

  const validServices: ServiceName[] = [
    ServiceName.JIRA,
    ServiceName.CONFLUENCE,
    ServiceName.BITBUCKET,
    ServiceName.KYG,
  ];
  if (!validServices.includes(serviceName)) {
    return c.json(
      { error: `Invalid service. Must be one of: ${validServices.join(", ")}` },
      400
    );
  }

  let kaySessionId = body.session_id;
  let sessionCreated = false;

  if (!kaySessionId) {
    kaySessionId = await createKaySession();
    sessionCreated = true;
  } else {
    const kaySession = await getKaySessionById(kaySessionId);
    if (!kaySession) {
      kaySessionId = await createKaySession();
      sessionCreated = true;
    }
  }

  const existingConnection = await getConnection(kaySessionId, serviceName);
  if (existingConnection) {
    const metadata = existingConnection.metadata;
    const response: {
      service: string;
      session_id: string;
      message: string;
      connected: boolean;
      account_id?: string;
    } = {
      service: serviceName,
      session_id: kaySessionId,
      connected: true,
      message: `${serviceName} is already connected`,
    };

    if (serviceName === "jira" || serviceName === "confluence") {
      if (metadata.user_data) {
        const userData = metadata.user_data as {
          account_id: string;
        };
        response.account_id = userData.account_id;
      }
    } else if (serviceName === "bitbucket") {
      if (metadata.account_id) {
        response.account_id = metadata.account_id as string;
      }
    } else if (serviceName === "kyg") {
      if (metadata.account_id) {
        response.account_id = metadata.account_id as string;
      }
    }

    return c.json(response);
  }

  const config = getServiceConfig(serviceName);

  if (!config.requiresOAuth) {
    if (serviceName === ServiceName.KYG) {
      if (!body.api_key && (!body.email || !body.password)) {
        return c.json(
          {
            error: "Missing required fields for KYG",
            message:
              "KYG requires either api_key or email and password in the request body",
          },
          400
        );
      }

      try {
        const result = await connectKygService(
          kaySessionId,
          body.api_key,
          body.email,
          body.password
        );

        const response: {
          service: string;
          session_id: string;
          message: string;
          session_reset?: boolean;
          connected: boolean;
          token?: string;
          refresh_token?: string;
          account_id?: string;
        } = {
          service: serviceName,
          session_id: kaySessionId,
          connected: true,
          message: `Successfully connected to ${serviceName}`,
        };

        if (sessionCreated) {
          response.session_reset = true;
        }

        return c.json(response);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          { error: `Failed to connect to KYG: ${errorMessage}` },
          500
        );
      }
    }

    if (serviceName === ServiceName.BITBUCKET) {
      if (!body.email || !body.api_token) {
        return c.json(
          {
            error: "Missing required fields for Bitbucket",
            message:
              "Bitbucket requires email and api_token in the request body",
          },
          400
        );
      }

      try {
        const result = await connectBitbucketService(
          kaySessionId,
          body.email,
          body.api_token
        );

        const response: {
          service: string;
          session_id: string;
          message: string;
          session_reset?: boolean;
          connected: boolean;
          account_id?: string;
        } = {
          service: serviceName,
          session_id: kaySessionId,
          connected: true,
          account_id: result.accountId,
          message: `Successfully connected to ${serviceName}`,
        };

        if (sessionCreated) {
          response.session_reset = true;
        }

        return c.json(response);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return c.json(
          { error: `Failed to connect to Bitbucket: ${errorMessage}` },
          500
        );
      }
    }

    return c.json(
      { error: `Service ${serviceName} does not require OAuth connection` },
      400
    );
  }

  const oauthProvider = getOAuthProvider(serviceName);

  if (!oauthProvider) {
    return c.json(
      { error: `Service ${serviceName} does not support OAuth` },
      400
    );
  }

  const state = generateOAuthState();
  await storeState(state, kaySessionId, serviceName);

  try {
    const authorizationUrl = buildServiceAuthorizationUrl(serviceName, state);

    const response: {
      service: string;
      session_id: string;
      authorization_url: string;
      state: string;
      message: string;
      session_reset?: boolean;
    } = {
      service: serviceName,
      session_id: kaySessionId,
      authorization_url: authorizationUrl,
      state,
      message: `Please visit the authorization URL to connect ${serviceName}`,
    };

    if (sessionCreated) {
      response.session_reset = true;
      response.message = `New session created. Please visit the authorization URL to connect ${serviceName}`;
    }

    return c.json(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    console.error(
      `[Connect] Error initiating OAuth flow for ${serviceName}:`,
      errorMessage,
      error instanceof Error ? error.stack : ""
    );

    if (errorMessage.includes("not yet implemented")) {
      return c.json({ error: errorMessage }, 501);
    }

    return c.json(
      { error: `Failed to initiate OAuth flow: ${errorMessage}` },
      500
    );
  }
});

connectionsRouter.post("/disconnect", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    session_id?: string;
  };
  const serviceName = c.req.query("service") as ServiceName | undefined;

  if (!serviceName) {
    return c.json({ error: "Missing required parameter: service" }, 400);
  }

  const kaySessionId = body.session_id;

  if (!kaySessionId) {
    return c.json({ error: "Missing required field: session_id" }, 400);
  }

  const kaySession = await getKaySessionById(kaySessionId);
  if (!kaySession) {
    return c.json(
      {
        error: "Invalid session_id",
        message:
          "The provided session_id no longer exists. Please reconnect your services.",
        session_reset_required: true,
      },
      404
    );
  }

  const deleted = await deleteConnection(kaySessionId, serviceName);

  if (!deleted) {
    return c.json({ error: "Connection not found" }, 404);
  }

  if (
    serviceName === ServiceName.JIRA ||
    serviceName === ServiceName.CONFLUENCE
  ) {
    const otherService =
      serviceName === ServiceName.JIRA
        ? ServiceName.CONFLUENCE
        : ServiceName.JIRA;
    const otherConnection = await deleteConnection(kaySessionId, otherService);
    if (otherConnection) {
      return c.json({
        service: serviceName,
        connected: false,
        message: `Successfully disconnected from ${serviceName} and ${otherService} (they share the same OAuth tokens)`,
      });
    }
  }

  return c.json({
    service: serviceName,
    connected: false,
    message: `Successfully disconnected from ${serviceName}`,
  });
});

export default connectionsRouter;
