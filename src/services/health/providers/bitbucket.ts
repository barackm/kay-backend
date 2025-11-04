import { MCPBitbucketService } from "../../../services/mcp/mcp-bitbucket-service.js";
import {
  getKaySessionById,
  getConnection,
} from "../../../services/connections/connection-service.js";
import type { HealthReport } from "../../../types/health.js";
import { handleError } from "../core.js";

export async function checkBitbucket(c: any, health: HealthReport) {
  const sessionId = c.req.query("session_id") as string | undefined;
  const bitbucketService = new MCPBitbucketService();

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

  const connection = getConnection(sessionId, "bitbucket");
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

  try {
    await bitbucketService.initialize(sessionId);
    const status = await bitbucketService.getConnectionStatus();
    const tools = status.connected ? await bitbucketService.getTools(true) : [];

    health.services.mcp_bitbucket = {
      status: status.connected ? "healthy" : "unhealthy",
      enabled: true,
      connected: status.connected,
      initialized: status.initialized,
      toolCount: status.toolCount,
      tools: tools.map(({ name, description }) => {
        const entry: { name: string; description?: string } = { name };
        if (description !== undefined) entry.description = description;
        return entry;
      }),
    };
  } catch (error) {
    health.services.mcp_bitbucket = handleError(
      health.services.mcp_bitbucket,
      error
    );
  } finally {
    await bitbucketService.disconnect();
  }
}
