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

  const kaySessionId = await getStateKaySessionId(state);
  const serviceName = await getStateServiceName(state);

  if (kaySessionId && serviceName) {
    let connection = await getConnection(kaySessionId, serviceName as any);

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
    }

    if (connection) {
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
      return c.json({
        status: "completed",
        message:
          "Authorization completed successfully. Use your existing session token for authentication.",
      });
    }
  }

  const stateExists = await validateState(state);

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
