import { callMCPTool } from "../../../../servers/client.js";
import type { ToolCall, ToolResult } from "../../../../types/mcp-tools.js";

/**
 * Execute a tool call from OpenAI
 * Routes the call to the appropriate MCP server and returns the result
 */
export async function executeToolCall(
    kaySessionId: string,
    toolCall: ToolCall
): Promise<ToolResult> {
    try {
        // Parse server name from tool name (e.g., "bb_get_pr" -> "bitbucket")
        const serverName = getServerNameFromTool(toolCall.name);

        // Execute via MCP client
        const result = await callMCPTool(
            kaySessionId,
            serverName,
            toolCall.name,
            toolCall.arguments
        );

        // Format result for OpenAI
        // MCP returns various formats, we normalize to string
        const content =
            typeof result === "string" ? result : JSON.stringify(result);

        return {
            tool_call_id: toolCall.id,
            role: "tool",
            content,
        };
    } catch (error) {
        // Return error as tool result so AI can handle it
        const errorMessage =
            error instanceof Error ? error.message : "Unknown error occurred";

        return {
            tool_call_id: toolCall.id,
            role: "tool",
            content: JSON.stringify({
                error: errorMessage,
                success: false,
            }),
        };
    }
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeToolCalls(
    kaySessionId: string,
    toolCalls: ToolCall[]
): Promise<ToolResult[]> {
    return Promise.all(
        toolCalls.map((toolCall) => executeToolCall(kaySessionId, toolCall))
    );
}

/**
 * Map tool name to server name
 * Convention: MCP server tools are prefixed with server identifier
 * e.g., "bb_get_pr" -> "bitbucket", "jira_get_issue" -> "jira"
 */
function getServerNameFromTool(toolName: string): string {
    const prefixMap: Record<string, string> = {
        bb_: "bitbucket",
        // Add more servers here as they're added to config.ts
        // jira_: "jira",
        // confluence_: "confluence",
    };

    for (const [prefix, serverName] of Object.entries(prefixMap)) {
        if (toolName.startsWith(prefix)) {
            return serverName;
        }
    }

    throw new Error(`Unknown tool: ${toolName}. Unable to determine MCP server.`);
}
