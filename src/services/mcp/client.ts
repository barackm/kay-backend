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
    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env,
    });

    await this.client.connect(this.transport);
  }

  async listTools(): Promise<{ tools: unknown[] }> {
    const result = await this.client.listTools();
    return result;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    return result;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
    }
    if (this.transport) {
      await this.transport.close();
    }
  }
}
