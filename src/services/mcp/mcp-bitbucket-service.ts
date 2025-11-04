import { MCPClient, type MCPTool } from "./mcp-client.js";
import { ENV } from "../../config/env.js";
import { getConnection } from "../connections/connection-service.js";

export class MCPBitbucketService {
  private client: MCPClient | null = null;
  private toolsCache: Map<string, Date> = new Map();
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000;

  async initialize(kaySessionId: string): Promise<void> {
    const connection = getConnection(kaySessionId, "bitbucket");
    if (!connection) {
      throw new Error("No Bitbucket connection found for this session");
    }

    const basicAuth = connection.access_token;
    const email = connection.metadata.email as string | undefined;
    const username = connection.metadata.username as string | undefined;

    let apiToken: string | undefined;
    if (basicAuth) {
      try {
        const decoded = Buffer.from(basicAuth, "base64").toString("utf-8");
        const [storedEmail, token] = decoded.split(":");
        if (token) {
          apiToken = token;
        }
      } catch (error) {
        console.error(
          "[MCPBitbucketService] Failed to decode credentials:",
          error instanceof Error ? error.message : error
        );
      }
    }

    const finalUsername = email || username || "";

    if (!finalUsername || !apiToken) {
      throw new Error(
        "Bitbucket credentials are incomplete. Email and API token are required."
      );
    }

    const env: Record<string, string> = {
      BITBUCKET_USERNAME: finalUsername,
      BITBUCKET_ACCESS_TOKEN: apiToken,
      BITBUCKET_API_BASE: "https://api.bitbucket.org/2.0",
      MCP_LOGGING_STDOUT: "true",
    };

    const baseArgs = [...(ENV.MCP_BITBUCKET_ARGS as string[])];
    const command = ENV.MCP_BITBUCKET_COMMAND;
    const client = new MCPClient(command, baseArgs, env);

    if (this.client) {
      await this.disconnect();
    }

    this.client = client;
    await this.client.connect();
  }

  async getTools(forceRefresh = false): Promise<MCPTool[]> {
    if (!this.client) {
      throw new Error("MCP Bitbucket service not initialized");
    }
    if (!this.client.isConnected()) {
      await this.client.connect();
    }

    const cacheKey = "bitbucket-tools";
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
    const disabled = new Set<string>();
    if (
      ENV.MCP_BITBUCKET_DISABLED_TOOLS &&
      ENV.MCP_BITBUCKET_DISABLED_TOOLS.length > 0
    ) {
      for (const t of ENV.MCP_BITBUCKET_DISABLED_TOOLS) disabled.add(t);
    }
    return tools.filter((t) => !disabled.has(t.name));
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

    if (!this.client) return status;
    try {
      status.connected = this.client.isConnected();
      if (status.connected) {
        try {
          await this.getTools(false);
          status.toolCount = this.client.getTools().length;
        } catch (err) {
          status.error = err instanceof Error ? err.message : "Unknown error";
        }
      }
    } catch (err) {
      status.error = err instanceof Error ? err.message : "Unknown error";
    }
    return status;
  }

  async callTool(toolName: string, args: Record<string, unknown> = {}) {
    if (!this.client) throw new Error("MCP Bitbucket service not initialized");
    if (!this.client.isConnected()) await this.client.connect();
    return this.client.callTool(toolName, args);
  }

  async disconnect() {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.toolsCache.clear();
    }
  }
}
