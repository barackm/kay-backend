import type { HealthReport } from "../../../types/health.js";
import type { StoredToken } from "../../../types/oauth.js";

export async function checkJira(
  tokens: StoredToken | undefined,
  health: HealthReport
) {
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

  health.services.mcp_jira = {
    status: "disabled",
    enabled: true,
    connected: false,
    initialized: false,
    message: "MCP integration not yet implemented",
  };
}
