import type { HealthReport } from "../../../types/health.js";
import { getConnection } from "../../connections/connection-service.js";
import { ServiceName } from "../../../types/connections.js";
import { getBitbucketMCPClient } from "../../mcp/manager.js";

export async function checkBitbucket(
  kaySessionId: string | undefined,
  health: HealthReport
): Promise<void> {
  if (!kaySessionId) {
    health.services.mcp_bitbucket = {
      status: "unhealthy",
      enabled: false,
      connected: false,
      initialized: false,
      message: "No session ID found",
    };
    return;
  }

  try {
    const connection = await getConnection(kaySessionId, ServiceName.BITBUCKET);

    if (!connection) {
      health.services.mcp_bitbucket = {
        status: "unhealthy",
        enabled: false,
        connected: false,
        initialized: false,
        message: "No Bitbucket connection found",
      };
      return;
    }

    const mcpClient = await getBitbucketMCPClient(kaySessionId);

    if (!mcpClient || !mcpClient.isReady()) {
      health.services.mcp_bitbucket = {
        status: "unhealthy",
        enabled: true,
        connected: true,
        initialized: false,
        message: "MCP client not initialized",
      };
      return;
    }

    const tools = mcpClient.getTools();

    health.services.mcp_bitbucket = {
      status: "healthy",
      enabled: true,
      connected: true,
      initialized: true,
      toolCount: tools.length,
      tools: tools.map((tool) => {
        const toolInfo: { name: string; description?: string } = {
          name: tool.name,
        };
        if (tool.description) {
          toolInfo.description = tool.description;
        }
        return toolInfo;
      }),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    health.services.mcp_bitbucket = {
      status: "unhealthy",
      enabled: true,
      connected: true,
      initialized: false,
      message: `MCP client error: ${errorMessage}`,
    };
  }
}
