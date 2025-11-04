import { getKaySessionIdByToken, getConnectionStatus } from "../connections/connection-service.js";
import type { MCPTool } from "../mcp/mcp-client.js";

export function getKayConnectionStatusTool(): MCPTool {
  return {
    name: "kay_connections_status",
    description: "Check which services are connected or disconnected for the current user session. Returns a list of connected and disconnected services.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "The Kay session ID (optional, will use current session if not provided)",
        },
      },
      required: [],
    },
  };
}

export async function executeKayConnectionStatus(
  sessionToken: string,
  args: { session_id?: string }
): Promise<{ connected: string[]; disconnected: string[] }> {
  const kaySessionId = args.session_id || getKaySessionIdByToken(sessionToken);
  
  if (!kaySessionId) {
    return {
      connected: [],
      disconnected: ["kyg", "jira", "confluence", "bitbucket"],
    };
  }

  const status = getConnectionStatus(kaySessionId);
  
  const connected: string[] = [];
  const disconnected: string[] = [];

  for (const [service, isConnected] of Object.entries(status)) {
    if (isConnected) {
      connected.push(service);
    } else {
      disconnected.push(service);
    }
  }

  return {
    connected,
    disconnected,
  };
}

