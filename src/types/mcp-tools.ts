/**
 * Type definitions for MCP and OpenAI tool integration
 */

/**
 * MCP Tool format (from MCP servers)
 */
export interface MCPTool {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

/**
 * OpenAI Tool format (for function calling)
 */
export interface OpenAITool {
    type: "function";
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

/**
 * Tool call from OpenAI
 */
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}

/**
 * Tool result to send back to OpenAI
 */
export interface ToolResult {
    tool_call_id: string;
    role: "tool";
    content: string;
}
