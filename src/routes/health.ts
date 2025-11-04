import { Hono } from "hono";
import db from "../services/database/database.js";
import { isOpenAIConfigured } from "../services/ai/openai-service.js";
import { ENV } from "../config/env.js";
import { MCPJiraService } from "../services/mcp/mcp-jira-service.js";
import { authMiddleware } from "../middleware/auth.js";
import { refreshAccessTokenIfNeeded } from "../services/auth/token-service.js";

const healthRouter = new Hono();

interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  services: {
    database: {
      status: "healthy" | "unhealthy";
      message?: string;
    };
    openai: {
      status: "healthy" | "unhealthy";
      configured: boolean;
      message?: string;
    };
    mcp_jira: {
      status: "healthy" | "unhealthy" | "disabled";
      enabled: boolean;
      connected?: boolean;
      initialized?: boolean;
      toolCount?: number;
      tools?: Array<{ name: string; description?: string }>;
      message?: string;
    };
    confluence: {
      status: "healthy" | "unhealthy";
      accessible: boolean;
      spaceCount?: number;
      tools?: Array<{ name: string; description?: string }>;
      message?: string;
    };
  };
}

healthRouter.get("/", authMiddleware(), async (c) => {
  const tokens = c.get("atlassian_tokens");

  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    services: {
      database: {
        status: "healthy",
      },
      openai: {
        status: "healthy",
        configured: isOpenAIConfigured(),
      },
      mcp_jira: {
        status: "disabled",
        enabled: true,
      },
      confluence: {
        status: "healthy",
        accessible: false,
      },
    },
  };

  let hasCriticalFailure = false;
  let hasNonCriticalFailure = false;

  try {
    db.prepare("SELECT 1").get();
    health.services.database.status = "healthy";
  } catch (error) {
    health.services.database.status = "unhealthy";
    health.services.database.message =
      error instanceof Error ? error.message : "Unknown error";
    hasCriticalFailure = true;
  }

  if (!isOpenAIConfigured()) {
    health.services.openai.status = "unhealthy";
    health.services.openai.message = "OPENAI_API_KEY not configured";
    hasNonCriticalFailure = true;
  } else {
    health.services.openai.status = "healthy";
  }

  let allTools: Array<{ name: string; description?: string }> = [];

  try {
    const jiraService = new MCPJiraService();

    try {
      await jiraService.initialize(tokens);
      const connectionStatus = await jiraService.getConnectionStatus();
      const tools = connectionStatus.connected
        ? await jiraService.getTools(true)
        : [];

      allTools = tools.map((t) => {
        const tool: { name: string; description?: string } = {
          name: t.name,
        };
        if (t.description) {
          tool.description = t.description;
        }
        return tool;
      });

      const mcpJiraStatus: typeof health.services.mcp_jira = {
        status: connectionStatus.connected ? "healthy" : "unhealthy",
        enabled: true,
        connected: connectionStatus.connected,
        initialized: connectionStatus.initialized,
        toolCount: connectionStatus.toolCount,
        tools: allTools,
      };
      if (connectionStatus.error) {
        mcpJiraStatus.message = connectionStatus.error;
      }
      health.services.mcp_jira = mcpJiraStatus;

      if (!connectionStatus.connected) {
        hasNonCriticalFailure = true;
      }

      await jiraService.disconnect();
    } catch (error) {
      health.services.mcp_jira = {
        status: "unhealthy",
        enabled: true,
        connected: false,
        initialized: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
      hasNonCriticalFailure = true;
    }
  } catch (error) {
    health.services.mcp_jira = {
      status: "unhealthy",
      enabled: true,
      message: error instanceof Error ? error.message : "Unknown error",
    };
    hasNonCriticalFailure = true;
  }

  try {
    const confluenceResource = tokens.resources.find((r) =>
      r.url.includes("atlassian.net")
    );

    if (confluenceResource) {
      const accessToken = await refreshAccessTokenIfNeeded(tokens);
      const confluenceUrl = confluenceResource.url.replace(
        ".atlassian.net",
        ".atlassian.net/wiki"
      );

      const response = await fetch(`${confluenceUrl}/rest/api/space?limit=10`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        const spaces = data.results || data || [];
        const confluenceTools = allTools.filter((t) =>
          t.name.startsWith("confluence_")
        );

        const confluenceStatus: typeof health.services.confluence = {
          status: "healthy",
          accessible: true,
          spaceCount: Array.isArray(spaces) ? spaces.length : 0,
        };

        if (confluenceTools.length > 0) {
          confluenceStatus.tools = confluenceTools;
        }

        health.services.confluence = confluenceStatus;
      } else {
        health.services.confluence = {
          status: "unhealthy",
          accessible: false,
          message: `Confluence API returned ${response.status}`,
        };
      }
    } else {
      health.services.confluence = {
        status: "unhealthy",
        accessible: false,
        message: "No Confluence resource found",
      };
    }
  } catch (error) {
    health.services.confluence = {
      status: "unhealthy",
      accessible: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }

  if (hasCriticalFailure) {
    health.status = "unhealthy";
  } else if (hasNonCriticalFailure) {
    health.status = "degraded";
  } else {
    health.status = "healthy";
  }

  const statusCode =
    health.status === "healthy"
      ? 200
      : health.status === "degraded"
      ? 200
      : 503;

  return c.json(health, statusCode);
});

export default healthRouter;
