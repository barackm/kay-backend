import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface MCPTool {
  name: string;
  description?: string | undefined;
  inputSchema?: Record<string, unknown> | undefined;
}

export interface MCPToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError: boolean;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: MCPTool[] = [];
  private connected = false;

  constructor(
    private command: string,
    private args: string[] = [],
    private env: Record<string, string> = {}
  ) {}

  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    try {
      this.transport = new StdioClientTransport({
        command: this.command,
        args: this.args,
        env: this.env,
      });

      this.client = new Client(
        {
          name: "kay-backend",
          version: "1.0.0",
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      await this.client.connect(this.transport);

      await this.discoverTools();

      this.connected = true;
    } catch (error) {
      this.connected = false;
      this.client = null;
      this.transport = null;
      throw new Error(
        `Failed to connect to MCP server: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        // Ignore disconnect errors
      }
      this.client = null;
      this.transport = null;
      this.connected = false;
      this.tools = [];
    }
  }

  async discoverTools(): Promise<MCPTool[]> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const response = await this.client.listTools({});

      if (!response.tools || response.tools.length === 0) {
        return [];
      }

      this.tools =
        response.tools.map((tool: Tool) => ({
          name: tool.name,
          description: tool.description ?? undefined,
          inputSchema:
            (tool.inputSchema as Record<string, unknown>) ?? undefined,
        })) || [];

      return this.tools;
    } catch (error) {
      throw new Error(
        `Failed to discover MCP tools: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  getTools(): MCPTool[] {
    return this.tools;
  }

  async callTool(
    name: string,
    arguments_: Record<string, unknown> = {}
  ): Promise<MCPToolResult> {
    if (!this.client) {
      throw new Error("MCP client not connected");
    }

    try {
      const response = await this.client.callTool({
        name,
        arguments: arguments_,
      });

      const content = Array.isArray(response.content)
        ? response.content.map(
            (item: { type: string; text?: string; data?: unknown }) => {
              const result: { type: string; text?: string; data?: unknown } = {
                type: item.type,
              };
              if ("text" in item && item.text !== undefined) {
                result.text = item.text;
              }
              if ("data" in item && item.data !== undefined) {
                result.data = item.data;
              }
              return result;
            }
          )
        : [];

      const result: MCPToolResult = {
        content,
        isError: Boolean(response.isError),
      };

      return result;
    } catch (error) {
      throw new Error(
        `Failed to call MCP tool ${name}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }
}
