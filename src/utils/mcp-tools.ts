import type { MCPTool } from "../services/mcp-client.js";

export function convertMCPToolsToOpenAI(mcpTools: MCPTool[]): Array<{
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}> {
  return mcpTools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description ?? `Execute ${tool.name}`,
      parameters: tool.inputSchema ?? {
        type: "object",
        properties: {},
      },
    },
  }));
}
