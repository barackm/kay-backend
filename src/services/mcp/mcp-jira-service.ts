import { MCPClient, type MCPTool } from "./mcp-client.js";
import { ENV } from "../../config/env.js";
import type { StoredToken } from "../../types/oauth.js";
import { refreshAccessTokenIfNeeded } from "../auth/token-service.js";

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

    console.log(
      "[MCP] Initializing with resource scopes:",
      jiraResource.scopes || "NO SCOPES"
    );
    await this.createClient(userTokens, jiraResource);
  }

  private async createClient(
    tokens: StoredToken,
    jiraResource: { id: string; url: string; scopes?: string[] }
  ): Promise<void> {
    if (this.client) {
      await this.disconnect();
    }

    const accessToken = await refreshAccessTokenIfNeeded(tokens);

    const confluenceUrl = jiraResource.url.replace(
      ".atlassian.net",
      ".atlassian.net/wiki"
    );

    try {
      const testUrl = `https://api.atlassian.com/ex/confluence/${jiraResource.id}/api/v2/spaces?limit=1`;
      const testResponse = await fetch(testUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      console.log(
        `[MCP] Token test - Confluence API v2 spaces endpoint: ${testResponse.status} ${testResponse.statusText}`
      );
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error(`[MCP] Token test failed: ${errorText}`);

        if (
          testResponse.status === 401 &&
          errorText.includes("scope does not match")
        ) {
          console.error(
            `[MCP] CRITICAL: The access token does not have the required Confluence scopes. ` +
              `This usually means the token was issued before Confluence scopes were added. ` +
              `The user needs to re-authenticate to get a new token with Confluence permissions.`
          );
          throw new Error(
            "Token missing Confluence scopes. Please re-authenticate by running the login command again."
          );
        }
      } else {
        console.log(
          `[MCP] Token test successful - token has required Confluence scopes`
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Token missing Confluence scopes")
      ) {
        throw error;
      }
      console.error(
        `[MCP] Token test error:`,
        error instanceof Error ? error.message : "Unknown"
      );
    }

    const resourceScopes = jiraResource.scopes || [];
    const hasConfluenceWrite = resourceScopes.includes(
      "write:confluence-content"
    );
    const hasConfluenceRead = resourceScopes.some((scope: string) =>
      scope.includes("confluence")
    );

    console.log("[MCP] Confluence Configuration:");
    console.log(`  CONFLUENCE_URL: ${confluenceUrl}`);
    console.log(`  CONFLUENCE_CLOUD_ID: ${jiraResource.id}`);
    console.log(`  ATLASSIAN_OAUTH_CLOUD_ID: ${jiraResource.id}`);
    console.log(`  JIRA_URL: ${jiraResource.url}`);
    console.log(
      `  ATLASSIAN_OAUTH_ACCESS_TOKEN: ${accessToken.substring(0, 20)}...`
    );
    console.log(
      `  Token expires at: ${new Date(tokens.expires_at).toISOString()}`
    );
    console.log(
      `  Resource scopes (${resourceScopes.length}):`,
      resourceScopes
    );
    console.log(`  Has Confluence write scope: ${hasConfluenceWrite}`);
    console.log(`  Has Confluence read scope: ${hasConfluenceRead}`);

    if (!hasConfluenceWrite) {
      console.warn(
        "[MCP] WARNING: Token missing 'write:confluence-content' scope. User needs to re-authenticate."
      );
    }
    if (!hasConfluenceRead) {
      console.warn(
        "[MCP] WARNING: Token missing Confluence read scopes. User needs to re-authenticate."
      );
    }

    const env: Record<string, string> = {
      JIRA_URL: jiraResource.url,
      CONFLUENCE_URL: confluenceUrl,
      ATLASSIAN_OAUTH_CLOUD_ID: jiraResource.id,
      CONFLUENCE_CLOUD_ID: jiraResource.id,
      ATLASSIAN_OAUTH_ACCESS_TOKEN: accessToken,
      MCP_VERY_VERBOSE: "true",
      MCP_LOGGING_STDOUT: "true",
    };

    const baseArgs = [...ENV.MCP_JIRA_ARGS];
    const imageName =
      baseArgs[baseArgs.length - 1] || "ghcr.io/sooperset/mcp-atlassian:latest";
    const dockerArgs = baseArgs.slice(0, -1);

    console.log("[MCP] Docker environment variables being passed:");
    for (const [key, value] of Object.entries(env)) {
      dockerArgs.push("-e", `${key}=${value}`);
      if (key === "ATLASSIAN_OAUTH_ACCESS_TOKEN") {
        console.log(
          `  ${key}=${value.substring(0, 20)}... (${value.length} chars)`
        );
      } else {
        console.log(`  ${key}=${value}`);
      }
    }

    dockerArgs.push(imageName);
    console.log(
      "[MCP] Docker command:",
      ENV.MCP_JIRA_COMMAND,
      dockerArgs.slice(0, 10).join(" "),
      "..."
    );

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

    try {
      return await this.client.callTool(toolName, arguments_);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        console.warn(
          "[MCP] 401 error detected, disconnecting and reconnecting with fresh token"
        );
        await this.disconnect();
        throw new Error(`Authentication failed: ${errorMessage}`);
      }
      throw error;
    }
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
