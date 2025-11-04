import {
  getKaySessionById,
  getConnection,
} from "../../../services/connections/connection-service.js";
import type { HealthReport } from "../../../types/health.js";
import { ServiceName } from "../../../types/connections.js";

export async function checkBitbucket(c: any, health: HealthReport) {
  const sessionId = c.req.query("session_id") as string | undefined;

  if (!sessionId) {
    health.services.mcp_bitbucket = {
      status: "unhealthy",
      enabled: true,
      connected: false,
      initialized: false,
      message: "Missing session_id query parameter",
    };
    return;
  }

  const kaySession = getKaySessionById(sessionId);
  if (!kaySession) {
    health.services.mcp_bitbucket = {
      status: "unhealthy",
      enabled: true,
      connected: false,
      initialized: false,
      message: "Invalid session_id",
    };
    return;
  }

  const connection = getConnection(sessionId, ServiceName.BITBUCKET);
  if (!connection) {
    health.services.mcp_bitbucket = {
      status: "unhealthy",
      enabled: true,
      connected: false,
      initialized: false,
      message: "No Bitbucket connection found",
    };
    return;
  }

  health.services.mcp_bitbucket = {
    status: "disabled",
    enabled: true,
    connected: false,
    initialized: false,
    message: "MCP integration not yet implemented",
  };
}
