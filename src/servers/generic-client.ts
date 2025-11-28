import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * Generic MCP Client
 * Works with any MCP server without modification
 */
export class GenericMCPClient {
    private client: Client | null = null;
    private transport: StdioClientTransport | null = null;
    private tools: Array<{
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;
    }> = [];

    /**
     * Initialize the MCP client
     * @param npmPackage - NPM package name (e.g., "@aashari/mcp-server-atlassian-bitbucket")
     * @param env - Environment variables to pass to the server
     */
    async initialize(
        npmPackage: string,
        env: Record<string, string>
    ): Promise<void> {
        if (this.client) {
            return;
        }

        this.transport = new StdioClientTransport({
            command: "npx",
            args: ["-y", npmPackage],
            env,
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

        const toolsList = await this.client.listTools();
        this.tools = (toolsList.tools || []).map((tool) => {
            const mapped: {
                name: string;
                description?: string;
                inputSchema: Record<string, unknown>;
            } = {
                name: tool.name,
                inputSchema: tool.inputSchema as Record<string, unknown>,
            };
            if (tool.description) {
                mapped.description = tool.description;
            }
            return mapped;
        });
    }

    async callTool(
        name: string,
        arguments_: Record<string, unknown>
    ): Promise<unknown> {
        if (!this.client) {
            throw new Error("MCP client not initialized");
        }

        const result = await this.client.callTool({
            name,
            arguments: arguments_,
        });

        return result.content;
    }

    getTools(): Array<{
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;
    }> {
        return this.tools;
    }

    isReady(): boolean {
        return this.client !== null;
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.close();
            } catch {
                // Ignore errors during disconnect
            }
            this.client = null;
        }

        if (this.transport) {
            try {
                await this.transport.close();
            } catch {
                // Ignore errors during disconnect
            }
            this.transport = null;
        }

        this.tools = [];
    }
}
