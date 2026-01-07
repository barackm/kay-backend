import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;

  constructor() {
    this.client = new Client({
      name: "kay-backend",
      version: "1.0.0",
    });
  }

  async connect(
    serverPath: string,
    env: Record<string, string> = {}
  ): Promise<void> {
    console.log(`[MCPClient] Connecting to server: ${serverPath}`);
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env,
    });

    try {
      await this.client.connect(this.transport);
      console.log(`[MCPClient] Connected successfully`);
    } catch (error) {
      console.error(`[MCPClient] Connection failed:`, error);
      throw error;
    }
  }

  async listTools(): Promise<{ tools: unknown[] }> {
    console.log(`[MCPClient] Listing tools...`);
    try {
      const result = await this.client.listTools();
      console.log(
        `[MCPClient] Found ${
          Array.isArray(result.tools) ? result.tools.length : 0
        } tools`
      );
      return result;
    } catch (error) {
      console.error(`[MCPClient] listTools failed:`, error);
      throw error;
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    console.log(
      `[MCPClient] Calling tool ${name} with args:`,
      JSON.stringify(args, null, 2)
    );
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    console.log(`[MCPClient] Tool ${name} result type:`, typeof result);
    console.log(
      `[MCPClient] Tool ${name} result:`,
      JSON.stringify(result, null, 2)
    );
    return result;
  }

  async disconnect(): Promise<void> {
    console.log(`[MCPClient] Disconnecting...`);
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
      console.log(`[MCPClient] Disconnected successfully`);
    } catch (error) {
      console.error(`[MCPClient] Disconnect error:`, error);
      throw error;
    }
  }
}
