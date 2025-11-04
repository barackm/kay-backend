import { MCPJiraService } from "../../../services/mcp/mcp-jira-service.js";
import type { HealthReport } from "../../../types/health.js";
import type { StoredToken } from "../../../types/oauth.js";
import { handleError } from "../core.js";

export async function checkJira(
  tokens: StoredToken | undefined,
  health: HealthReport
) {
  const jiraService = new MCPJiraService();

  if (!tokens) {
    health.services.mcp_jira = {
      status: "unhealthy",
      enabled: true,
      connected: false,
      initialized: false,
      message: "No Atlassian connection found",
    };
    return;
  }

  try {
    await jiraService.initialize(tokens);
    const status = await jiraService.getConnectionStatus();
    const tools = status.connected ? await jiraService.getTools(true) : [];

    health.services.mcp_jira = {
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

    if (status.error) {
      health.services.mcp_jira.message = status.error;
    }
  } catch (error) {
    health.services.mcp_jira = handleError(health.services.mcp_jira, error);
  } finally {
    await jiraService.disconnect();
  }
}
