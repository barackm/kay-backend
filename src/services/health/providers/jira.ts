import type { HealthReport } from "../../../types/health.js";
import { getConnection } from "../../connections/connection-service.js";
import { ServiceName } from "../../../types/connections.js";
import { getJiraMCPClient } from "../../mcp/manager.js";

export async function checkJira(kaySessionId: string, health: HealthReport) {
  const connection = await getConnection(kaySessionId, ServiceName.JIRA);

  if (!connection) {
    health.services.mcp_jira = {
      status: "unhealthy",
      enabled: false,
      connected: false,
      initialized: false,
      message: "No Atlassian connection found. Please connect Jira first.",
    };
    return;
  }

  try {
    const mcpClient = await getJiraMCPClient(kaySessionId);

    if (!mcpClient || !mcpClient.isReady()) {
      health.services.mcp_jira = {
        status: "unhealthy",
        enabled: true,
        connected: true,
        initialized: false,
        message: "MCP client not initialized",
      };
      return;
    }

    const tools = mcpClient.getTools();

    health.services.mcp_jira = {
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
    health.services.mcp_jira = {
      status: "unhealthy",
      enabled: true,
      connected: true,
      initialized: false,
      message: `MCP client error: ${errorMessage}`,
    };
  }
}
