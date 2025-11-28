import { getOrCreateClient } from "../../../../servers/client.js";
import { getAllServerNames } from "../../../../servers/config.js";
import { getConnection } from "../../../connections/connection-service.js";
import { ServiceName } from "../../../../types/connections.js";
import type { MCPTool, OpenAITool } from "../../../../types/mcp-tools.js";

/**
 * Get available MCP tools for a user in OpenAI function calling format
 * Only returns tools for services the user has connected
 */
export async function getAvailableToolsForUser(
    kaySessionId: string
): Promise<OpenAITool[]> {
    const tools: OpenAITool[] = [];

    // Get all configured MCP servers
    const serverNames = getAllServerNames();

    for (const serverName of serverNames) {
        try {
            // Check if user has connection for this server
            const hasConnection = await userHasConnection(
                kaySessionId,
                serverName
            );
            console.log({ hasConnection })
            if (!hasConnection) {
                continue;
            }

            // Get MCP client (creates if needed, uses cached credentials)
            const client = await getOrCreateClient(kaySessionId, serverName);
            console.log({ client })
            // Get tools from MCP server
            const mcpTools = client.getTools();

            // Convert to OpenAI format
            const openAITools = mcpTools.map(convertMCPToolToOpenAI);
            console.log({ openAITools })
            tools.push(...openAITools);
        } catch (error) {
            console.error(`Failed to load tools for ${serverName}:`, error);
            // Continue with other servers
        }
    }

    return tools;
}

/**
 * Convert MCP tool to OpenAI function calling format
 * MCP tools use JSON Schema which directly maps to OpenAI's parameters
 */
function convertMCPToolToOpenAI(mcpTool: MCPTool): OpenAITool {
    return {
        type: "function",
        function: {
            name: mcpTool.name,
            description: mcpTool.description || `Tool: ${mcpTool.name}`,
            parameters: mcpTool.inputSchema,
        },
    };
}

/**
 * Check if user has an active connection for a server
 */
async function userHasConnection(
    kaySessionId: string,
    serverName: string
): Promise<boolean> {
    // Map server names to ServiceName enum
    const serviceMapping: Record<string, ServiceName> = {
        bitbucket: ServiceName.BITBUCKET,
        // Add more servers here as they're added to config.ts
        // jira: ServiceName.JIRA,
        // confluence: ServiceName.CONFLUENCE,
    };

    const serviceName = serviceMapping[serverName];
    if (!serviceName) {
        return false;
    }

    try {
        const connection = await getConnection(kaySessionId, serviceName);
        return !!connection;
    } catch {
        return false;
    }
}
