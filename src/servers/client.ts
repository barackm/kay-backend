import { GenericMCPClient } from "./generic-client.js";
import { getServerConfig } from "./config.js";
import {
    getConnection,
    getValidAccessToken,
} from "../services/connections/connection-service.js";
import { ServiceName } from "../types/connections.js";

// Cache of MCP clients per session and server
const clientCache = new Map<string, GenericMCPClient>();

/**
 * Get cache key for a client
 */
function getCacheKey(kaySessionId: string, serverName: string): string {
    return `${kaySessionId}:${serverName}`;
}

/**
 * Map server name to ServiceName enum
 * Add new servers here (1 line per server)
 */
function getServiceName(serverName: string): ServiceName | null {
    const mapping: Record<string, ServiceName> = {
        bitbucket: ServiceName.BITBUCKET,
        // Add more servers here:
        // jira: ServiceName.JIRA,
        // confluence: ServiceName.CONFLUENCE,
    };
    return mapping[serverName] || null;
}

/**
 * Get environment variables for MCP server from database connection
 * This is the SEMI-GENERIC part - add small per-server logic here
 */
async function getEnvFromConnection(
    kaySessionId: string,
    serverName: string
): Promise<Record<string, string>> {
    const serviceName = getServiceName(serverName);
    if (!serviceName) {
        throw new Error(`Unknown server: ${serverName}`);
    }

    // TODO: REMOVE HARDCODED CREDENTIALS - FOR TESTING ONLY
    if (serverName === "bitbucket") {
        console.log(`[getEnvFromConnection] Using hardcoded Bitbucket credentials for testing`);
        return {
            BITBUCKET_EMAIL: "barack.developer@gmail.com",
            BITBUCKET_TOKEN: "ATATT3xFfGF0eEDSantFObYRNnwCCcT5mdbTvb0rgZHyvrkWQq_FfVxfXlZ0dCqrJr_ZaVYaNN-A3P5PHmfF5-3f5p1ywAhg3J4ekCxq4VBiuZogK4mSIsrXdCJDf55RGGoIgrVRjHDCLF3wHWswZL9xy1uVGZhk9FD4W1elc3aF39jTumg7mHY=03D49378"
        };
    }

    const connection = await getConnection(kaySessionId, serviceName);
    if (!connection) {
        throw new Error(
            `No connection found for ${serverName} (session: ${kaySessionId})`
        );
    }

    const env: Record<string, string> = {};

    // SEMI-GENERIC: Small per-server credential transformation
    // Add ~5 lines per server here

    if (serverName === "bitbucket") {
        // Bitbucket stores credentials as base64 encoded email:token
        const credentials = connection.access_token;
        try {
            const decoded = Buffer.from(credentials, "base64").toString("utf-8");
            const [email, apiToken] = decoded.split(":");
            if (!email || !apiToken) {
                throw new Error("Invalid Bitbucket credentials format");
            }

            env.BITBUCKET_EMAIL = email;
            env.BITBUCKET_TOKEN = apiToken;
        } catch (error) {
            throw new Error(
                `Failed to decode Bitbucket credentials: ${error instanceof Error ? error.message : "Unknown error"
                }`
            );
        }
    }
    // Add more servers here:
    // else if (serverName === "jira") {
    //   const validAccessToken = await getValidAccessToken(connection, serviceName);
    //   const metadata = connection.metadata as { email?: string; user_data?: { email?: string } };
    //   const email = metadata.email || metadata.user_data?.email;
    //   env.JIRA_EMAIL = email;
    //   env.JIRA_TOKEN = validAccessToken;
    // }
    else {
        throw new Error(`Unsupported server type: ${serverName}`);
    }

    return env;
}

/**
 * Get or create an MCP client for a server
 * Uses per-user credentials from database
 */
export async function getOrCreateClient(
    kaySessionId: string,
    serverName: string
): Promise<GenericMCPClient> {
    const cacheKey = getCacheKey(kaySessionId, serverName);
    const cached = clientCache.get(cacheKey);

    if (cached && cached.isReady()) {
        return cached;
    }

    // Get server config
    const config = getServerConfig(serverName);
    if (!config) {
        throw new Error(`Unknown MCP server: ${serverName}`);
    }

    // Get credentials from database connection
    const env = await getEnvFromConnection(kaySessionId, serverName);

    // Create and initialize client
    const client = new GenericMCPClient();
    await client.initialize(config.npmPackage, env);

    // Cache it
    clientCache.set(cacheKey, client);

    return client;
}

/**
 * Call an MCP tool from a code execution environment
 * This is the bridge between generated tool files and the actual MCP protocol
 *
 * @param kaySessionId - The session ID for authentication
 * @param serverName - The name of the MCP server (from config)
 * @param toolName - The name of the tool to call
 * @param input - The input arguments for the tool
 * @returns The result from the MCP tool
 */
export async function callMCPTool<T = unknown>(
    kaySessionId: string,
    serverName: string,
    toolName: string,
    input: object
): Promise<T> {
    const client = await getOrCreateClient(kaySessionId, serverName);

    const result = await client.callTool(toolName, input as Record<string, unknown>);

    // Handle array results (common MCP response format)
    if (Array.isArray(result)) {
        const textContent = result
            .map((item) => {
                if (typeof item === "object" && item !== null && "text" in item) {
                    return String(item.text);
                }
                return JSON.stringify(item);
            })
            .join("\n");

        // Try to parse as JSON if possible
        try {
            return JSON.parse(textContent) as T;
        } catch {
            return textContent as T;
        }
    }

    return result as T;
}
