import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { MCPJiraService } from "../services/mcp-jira-service.js";
import { ENV } from "../config/env.js";

const mcpRouter = new Hono();

mcpRouter.get("/status", authMiddleware(), async (c) => {
  try {
    if (!ENV.MCP_JIRA_ENABLED) {
      return c.json({
        enabled: false,
        message: "MCP Jira is disabled. Set MCP_JIRA_ENABLED=true to enable.",
      });
    }

    const atlassianTokens = c.get("atlassian_tokens");
    const accountId = c.get("account_id");

    const jiraService = new MCPJiraService();

    try {
      await jiraService.initialize(atlassianTokens);
      const status = await jiraService.getConnectionStatus();

      return c.json({
        enabled: true,
        connected: status.connected,
        initialized: status.initialized,
        toolCount: status.toolCount,
        tools: status.connected
          ? (await jiraService.getTools(true)).map((t) => ({
              name: t.name,
              description: t.description,
            }))
          : [],
        error: status.error,
      });
    } catch (error) {
      return c.json(
        {
          enabled: true,
          connected: false,
          initialized: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        500
      );
    } finally {
      await jiraService.disconnect();
    }
  } catch (error) {
    return c.json(
      {
        enabled: ENV.MCP_JIRA_ENABLED,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default mcpRouter;
