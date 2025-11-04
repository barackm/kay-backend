import type { HealthReport } from "../../../types/health.js";
import { getConnection } from "../../connections/connection-service.js";
import { ServiceName } from "../../../types/connections.js";
import { getConfluenceMCPClient } from "../../mcp/manager.js";

export async function checkConfluence(
  kaySessionId: string | undefined,
  health: HealthReport
): Promise<void> {
  if (!kaySessionId) {
    health.services.confluence = {
      status: "unhealthy",
      enabled: false,
      connected: false,
      initialized: false,
      message: "No session ID found",
    };
    return;
  }

  try {
    const connection = await getConnection(
      kaySessionId,
      ServiceName.CONFLUENCE
    );

    if (!connection) {
      health.services.confluence = {
        status: "unhealthy",
        enabled: false,
        connected: false,
        initialized: false,
        message:
          "No Atlassian connection found. Please connect Confluence first.",
      };
      return;
    }

    const mcpClient = await getConfluenceMCPClient(kaySessionId);

    if (!mcpClient || !mcpClient.isReady()) {
      health.services.confluence = {
        status: "unhealthy",
        enabled: true,
        connected: true,
        initialized: false,
        message: "MCP client not initialized",
      };
      return;
    }

    const tools = mcpClient.getTools();

    health.services.confluence = {
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
    health.services.confluence = {
      status: "unhealthy",
      enabled: true,
      connected: true,
      initialized: false,
      message: `MCP client error: ${errorMessage}`,
    };
  }
}
