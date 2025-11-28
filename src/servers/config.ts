/**
 * MCP Server Configuration Registry
 * Add new servers here - no code changes needed elsewhere
 */

export interface MCPServerConfig {
    /** Server identifier (used in folder names, lowercase) */
    name: string;

    /** NPM package name for the MCP server */
    npmPackage: string;

    /** Environment variable requirements for tool generation */
    envVars: {
        /** Required environment variables */
        required: string[];
        /** Optional environment variables */
        optional?: string[];
    };
}

/**
 * Registry of all MCP servers
 * To add a new server, just add an entry here
 */
export const MCP_SERVERS: MCPServerConfig[] = [
    {
        name: "bitbucket",
        npmPackage: "@aashari/mcp-server-atlassian-bitbucket",
        envVars: {
            required: ["BITBUCKET_EMAIL", "BITBUCKET_TOKEN"],
        },
    },
    // Add more servers here as needed
    // Example:
    // {
    //   name: "jira",
    //   npmPackage: "@aashari/mcp-server-atlassian-jira",
    //   envVars: {
    //     required: ["JIRA_EMAIL", "JIRA_TOKEN"],
    //     optional: ["JIRA_SITE"],
    //   },
    // },
];

/**
 * Get server config by name
 */
export function getServerConfig(name: string): MCPServerConfig | undefined {
    return MCP_SERVERS.find((s) => s.name === name);
}

/**
 * Get all configured server names
 */
export function getAllServerNames(): string[] {
    return MCP_SERVERS.map((s) => s.name);
}

/**
 * Check if a server is configured (has all required env vars)
 */
export function isServerConfigured(config: MCPServerConfig): boolean {
    return config.envVars.required.every((envVar) => !!process.env[envVar]);
}

/**
 * Get environment variables for a server from process.env
 * Used during tool generation
 */
export function getServerEnvForGeneration(
    config: MCPServerConfig
): Record<string, string> {
    const env: Record<string, string> = {};

    // Add required variables
    for (const envVar of config.envVars.required) {
        const value = process.env[envVar];
        if (!value) {
            throw new Error(`Missing required environment variable: ${envVar}`);
        }
        env[envVar] = value;
    }

    // Add optional variables
    if (config.envVars.optional) {
        for (const envVar of config.envVars.optional) {
            const value = process.env[envVar];
            if (value) {
                env[envVar] = value;
            }
        }
    }

    return env;
}
