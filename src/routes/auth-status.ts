import { Hono } from "hono";
import {
  validateState,
  getStateKaySessionId,
  getStateServiceName,
  removeState,
} from "../services/connections/state-store.js";
import {
  getConnection,
  storeConnection,
} from "../services/connections/connection-service.js";
import { ServiceName } from "../types/connections.js";

const authStatusRouter = new Hono();

authStatusRouter.get("/status/:state", async (c) => {
  const state = c.req.param("state");

  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  console.log(`[Auth Status] Checking status for state: ${state}`);

  const kaySessionId = await getStateKaySessionId(state);
  const serviceName = await getStateServiceName(state);

  console.log(`[Auth Status] State data:`, {
    kaySessionId: kaySessionId || "NOT FOUND",
    serviceName: serviceName || "NOT FOUND",
  });

  if (kaySessionId && serviceName) {
    let connection = await getConnection(kaySessionId, serviceName as any);

    console.log(`[Auth Status] Primary connection check:`, {
      serviceName,
      found: !!connection,
      kaySessionId,
    });

    if (
      !connection &&
      (serviceName === ServiceName.JIRA ||
        serviceName === ServiceName.CONFLUENCE)
    ) {
      const otherService =
        serviceName === ServiceName.JIRA
          ? ServiceName.CONFLUENCE
          : ServiceName.JIRA;
      connection = await getConnection(kaySessionId, otherService);
      console.log(`[Auth Status] Fallback connection check:`, {
        otherService,
        found: !!connection,
        kaySessionId,
      });
    }

    if (!connection) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      connection = await getConnection(kaySessionId, serviceName as any);
      console.log(`[Auth Status] Retry connection check after delay:`, {
        serviceName,
        found: !!connection,
      });
    }

    if (connection) {
      console.log(
        `[Auth Status] Connection found! Completing auth for ${serviceName}`
      );

      if (
        serviceName === ServiceName.JIRA ||
        serviceName === ServiceName.CONFLUENCE
      ) {
        const otherService =
          serviceName === ServiceName.JIRA
            ? ServiceName.CONFLUENCE
            : ServiceName.JIRA;
        const otherConnection = await getConnection(kaySessionId, otherService);
        if (!otherConnection) {
          console.log(
            `[Auth Status] Creating shared connection for ${otherService}`
          );
          await storeConnection(
            kaySessionId,
            otherService,
            connection.access_token,
            connection.refresh_token,
            connection.expires_at,
            connection.metadata
          );
        }
      }

      await removeState(state);
      console.log(`[Auth Status] State removed, returning completed status`);
      return c.json({
        status: "completed",
        message:
          "Authorization completed successfully. Use your existing session token for authentication.",
      });
    } else {
      console.log(
        `[Auth Status] No connection found yet, checking if state is valid`
      );
    }
  }

  const stateExists = await validateState(state);
  console.log(`[Auth Status] State validation:`, { exists: stateExists });

  if (!stateExists) {
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

export default authStatusRouter;
