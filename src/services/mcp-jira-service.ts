import { MCPClient, type MCPTool } from "./mcp-client.js";
import { ENV } from "../config/env.js";
import type { StoredToken } from "../types/oauth.js";
import { refreshAccessTokenIfNeeded } from "./token-service.js";

export interface JiraMCPConfig {
  jiraUrl: string;
  jiraUsername: string;
  jiraApiToken: string;
  confluenceUrl?: string;
  confluenceUsername?: string;
  confluenceApiToken?: string;
}

export class MCPJiraService {
  private client: MCPClient | null = null;
  private toolsCache: Map<string, Date> = new Map();
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async initialize(userTokens: StoredToken): Promise<void> {
    if (!ENV.MCP_JIRA_ENABLED) {
      return;
    }

    const jiraResource = userTokens.resources.find((r) =>
      r.url.includes("atlassian.net")
    );

    if (!jiraResource) {
      throw new Error("No Jira resource found for user");
    }

    await this.createClient(userTokens, jiraResource);
  }

  private async createClient(
    tokens: StoredToken,
    jiraResource: { id: string; url: string }
  ): Promise<void> {
    const accessToken = await refreshAccessTokenIfNeeded(tokens);

    const env: Record<string, string> = {
      JIRA_URL: jiraResource.url,
      ATLASSIAN_OAUTH_CLOUD_ID: jiraResource.id,
      ATLASSIAN_OAUTH_ACCESS_TOKEN: accessToken,
      MCP_VERY_VERBOSE: "true",
      MCP_LOGGING_STDOUT: "true",
    };

    const baseArgs = [...ENV.MCP_JIRA_ARGS];
    const imageName =
      baseArgs[baseArgs.length - 1] || "ghcr.io/sooperset/mcp-atlassian:latest";
    const dockerArgs = baseArgs.slice(0, -1);

    for (const [key, value] of Object.entries(env)) {
      dockerArgs.push("-e", `${key}=${value}`);
    }

    dockerArgs.push(imageName);

    this.client = new MCPClient(ENV.MCP_JIRA_COMMAND, dockerArgs, {});

    try {
      await this.client.connect();
    } catch (error) {
      throw error;
    }
  }

  async getTools(forceRefresh = false): Promise<MCPTool[]> {
    if (!this.client) {
      throw new Error("MCP Jira service not initialized");
    }

    if (!this.client.isConnected()) {
      try {
        await this.client.connect();
      } catch (error) {
        throw new Error(
          `MCP client not connected: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    const cacheKey = "jira-tools";
    const cachedTime = this.toolsCache.get(cacheKey);

    if (
      !forceRefresh &&
      cachedTime &&
      Date.now() - cachedTime.getTime() < this.TOOLS_CACHE_TTL_MS
    ) {
      return this.filterTools(this.client.getTools());
    }

    const tools = await this.client.discoverTools();
    this.toolsCache.set(cacheKey, new Date());

    return this.filterTools(tools);
  }

  private filterTools(tools: MCPTool[]): MCPTool[] {
    const defaultDisabled = new Set<string>([
      "jira_delete_issue",
      "confluence_delete_page",
    ]);

    const disabledTools = new Set<string>(defaultDisabled);

    if (ENV.MCP_JIRA_DISABLED_TOOLS && ENV.MCP_JIRA_DISABLED_TOOLS.length > 0) {
      for (const tool of ENV.MCP_JIRA_DISABLED_TOOLS) {
        disabledTools.add(tool);
      }
    }

    return tools.filter((tool) => !disabledTools.has(tool.name));
  }

  async getConnectionStatus(): Promise<{
    connected: boolean;
    initialized: boolean;
    toolCount: number;
    error?: string;
  }> {
    const status: {
      connected: boolean;
      initialized: boolean;
      toolCount: number;
      error?: string;
    } = {
      connected: false,
      initialized: this.client !== null,
      toolCount: 0,
    };

    if (!this.client) {
      status.error = "MCP client not initialized";
      return status;
    }

    try {
      status.connected = this.client.isConnected();
      if (status.connected) {
        try {
          await this.getTools(false);
          status.toolCount = this.client.getTools().length;
        } catch (error) {
          status.error = `Failed to discover tools: ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
        }
      } else {
        status.error = "Client initialized but not connected";
      }
    } catch (error) {
      status.error = error instanceof Error ? error.message : "Unknown error";
    }

    return status;
  }

  async callTool(
    toolName: string,
    arguments_: Record<string, unknown> = {}
  ): Promise<{
    content: Array<{ type: string; text?: string; data?: unknown }>;
    isError: boolean;
  }> {
    if (!this.client) {
      throw new Error("MCP Jira service not initialized");
    }

    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    return this.client.callTool(toolName, arguments_);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.toolsCache.clear();
    }
  }

  isInitialized(): boolean {
    return this.client !== null && this.client.isConnected();
  }
}
