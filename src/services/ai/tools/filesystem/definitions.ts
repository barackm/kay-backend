import type { OpenAITool } from "../../../../types/mcp-tools.js";

/**
 * Filesystem tools for AI to discover and use MCP server functions
 * These tools allow the AI to explore the codebase and execute TypeScript code
 */
export const FILESYSTEM_TOOLS: OpenAITool[] = [
    {
        type: "function",
        function: {
            name: "list_directory",
            description:
                "List files and directories in a path. Use this to explore available MCP servers and their tool files. Start with 'src/servers' to see available servers, then explore specific servers like 'src/servers/bitbucket'.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "Path relative to project root. Example: 'src/servers' or 'src/servers/bitbucket'",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description:
                "Read the contents of a TypeScript file to understand its exported functions, types, and documentation. Use this to discover function signatures, parameters, and return types before writing code.",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description:
                            "File path relative to project root. Example: 'src/servers/bitbucket/bbAddPrComment.ts'",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "execute_typescript",
            description:
                "Execute TypeScript code that uses MCP server tools. The code can import from 'src/servers/*'. The variable 'kaySessionId' is automatically available. Use console.log() to output results. You can write complex logic including loops, conditionals, and data processing.",
            parameters: {
                type: "object",
                properties: {
                    code: {
                        type: "string",
                        description:
                            "TypeScript code to execute. Example: import { bbAddPrComment } from './src/servers/bitbucket/bbAddPrComment.js'; await bbAddPrComment(kaySessionId, { ... }); console.log('Done');",
                    },
                },
                required: ["code"],
            },
        },
    },
];
