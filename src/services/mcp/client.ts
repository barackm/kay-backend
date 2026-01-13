import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  searchIssuesDirect,
  getBoardIssuesDirect,
} from "../jira/jira-api-fix.js";

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private serverName: string | null = null;
  private serverEnv: Record<string, string> = {};

  constructor() {
    this.client = new Client({
      name: "kay-backend",
      version: "1.0.0",
    });
  }

  async connect(
    serverPath: string,
    env: Record<string, string> = {},
    serverName?: string
  ): Promise<void> {
    this.serverName = serverName || null;
    this.serverEnv = { ...env };

    this.transport = new StdioClientTransport({
      command: "node",
      args: [serverPath],
      env,
    });

    try {
      await this.client.connect(this.transport);
    } catch (error) {
      throw error;
    }
  }

  async listTools(): Promise<{ tools: unknown[] }> {
    try {
      const result = await this.client.listTools();
      return result;
    } catch (error) {
      throw error;
    }
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    // Workaround for deprecated Jira API endpoints
    // This ensures ALL code using MCPClient automatically gets the fix
    if (this.serverName === "jira") {
      const baseUrl = this.serverEnv.JIRA_BASE_URL || this.serverEnv.JIRA_HOST;
      const email = this.serverEnv.JIRA_EMAIL;
      const apiToken = this.serverEnv.JIRA_API_TOKEN;

      if (name === "search_issues" && baseUrl && email && apiToken) {
        const jql = args.jql as string;
        const maxResults = (args.maxResults as number) || 50;
        return searchIssuesDirect(baseUrl, email, apiToken, jql, maxResults);
      }

      if (name === "get_board_issues" && baseUrl && email && apiToken) {
        const boardId = args.boardId as string;
        const maxResults = (args.maxResults as number) || 50;
        const assigneeFilter = args.assigneeFilter as string | undefined;
        const statusFilter = args.statusFilter as string | undefined;
        return getBoardIssuesDirect(
          baseUrl,
          email,
          apiToken,
          boardId,
          maxResults,
          assigneeFilter,
          statusFilter
        );
      }
    }

    // Fall through to normal MCP call for all other tools
    const result = await this.client.callTool({
      name,
      arguments: args,
    });
    return result;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
    } catch (error) {
      throw error;
    }
  }
}
