import { Hono } from "hono";
import db from "../services/database.js";
import { isOpenAIConfigured } from "../services/openai-service.js";
import { ENV } from "../config/env.js";
import { MCPJiraService } from "../services/mcp-jira-service.js";
import { authMiddleware } from "../middleware/auth.js";

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
        enabled: ENV.MCP_JIRA_ENABLED,
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

  if (ENV.MCP_JIRA_ENABLED) {
    try {
      const jiraService = new MCPJiraService();

      try {
        await jiraService.initialize(tokens);
        const connectionStatus = await jiraService.getConnectionStatus();

        const mcpJiraStatus: typeof health.services.mcp_jira = {
          status: connectionStatus.connected ? "healthy" : "unhealthy",
          enabled: true,
          connected: connectionStatus.connected,
          initialized: connectionStatus.initialized,
          toolCount: connectionStatus.toolCount,
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
