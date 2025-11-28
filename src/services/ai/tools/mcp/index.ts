/**
 * MCP tools module (legacy)
 * Provides direct MCP tool execution
 * Note: This is being phased out in favor of the filesystem discovery approach
 */

export { executeToolCall, executeToolCalls } from "./executor.js";
export { getAvailableToolsForUser } from "./registry.js";
