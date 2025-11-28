import {
    listDirectory,
    readFileContent,
    executeTypeScriptCode,
} from "./operations.js";
import type { ToolCall, ToolResult } from "../../../../types/mcp-tools.js";

/**
 * Execute filesystem tool calls from the AI
 * Routes to appropriate filesystem operation based on tool name
 */
export async function executeFilesystemTool(
    kaySessionId: string,
    toolCall: ToolCall
): Promise<ToolResult> {
    console.log(`[Filesystem Tool] Executing: ${toolCall.name}`);
    console.log(`[Filesystem Tool] Arguments:`, JSON.stringify(toolCall.arguments, null, 2));

    try {
        let result: string;

        switch (toolCall.name) {
            case "list_directory": {
                const path = toolCall.arguments.path as string;
                console.log(`[list_directory] Listing: ${path}`);
                const entries = await listDirectory(path);
                console.log(`[list_directory] Found ${entries.length} entries`);
                result = JSON.stringify(entries, null, 2);
                break;
            }

            case "read_file": {
                const path = toolCall.arguments.path as string;
                console.log(`[read_file] Reading: ${path}`);
                const content = await readFileContent(path);
                console.log(`[read_file] Content length: ${content.length} characters`);
                result = content;
                break;
            }

            case "execute_typescript": {
                const code = toolCall.arguments.code as string;
                console.log(`[execute_typescript] Executing code (${code.length} chars)`);
                console.log(`[execute_typescript] Code preview:`, code.substring(0, 200) + '...');
                const output = await executeTypeScriptCode(code, kaySessionId);
                console.log(`[execute_typescript] Output:`, output);
                result = output;
                break;
            }

            default:
                throw new Error(`Unknown filesystem tool: ${toolCall.name}`);
        }

        console.log(`[Filesystem Tool] Success: ${toolCall.name}`);
        return {
            tool_call_id: toolCall.id,
            role: "tool",
            content: result,
        };
    } catch (error) {
        console.error(`[Filesystem Tool] Error in ${toolCall.name}:`, error);
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
 * Execute multiple filesystem tool calls in parallel
 */
export async function executeFilesystemTools(
    kaySessionId: string,
    toolCalls: ToolCall[]
): Promise<ToolResult[]> {
    return Promise.all(
        toolCalls.map((toolCall) =>
            executeFilesystemTool(kaySessionId, toolCall)
        )
    );
}
