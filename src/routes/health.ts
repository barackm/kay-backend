import { Hono } from "hono";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";

export function createHealthRouter(registry: MCPServerRegistry) {
  const router = new Hono();

  router.get("/", async (c) => {
    const servers = registry.listConnections();
    const serverStatuses = await Promise.all(
      servers.map(async (name) => {
        try {
          const client = registry.getClient(name);
          const toolsResult = await client.listTools();
          const tools: string[] = Array.isArray(toolsResult.tools)
            ? toolsResult.tools
                .map((tool: unknown) => {
                  if (
                    typeof tool === "object" &&
                    tool !== null &&
                    "name" in tool &&
                    typeof (tool as { name: unknown }).name === "string"
                  ) {
                    return (tool as { name: string }).name;
                  }
                  return "";
                })
                .filter((name: string) => name !== "")
            : [];
          return {
            name,
            status: "connected",
            healthy: true,
            tools,
          };
        } catch (error) {
          return {
            name,
            status: "disconnected",
            healthy: false,
            error: error instanceof Error ? error.message : "Unknown error",
            tools: [],
          };
        }
      })
    );

    const connectedCount = serverStatuses.filter((s) => s.healthy).length;
    const allHealthy =
      serverStatuses.length > 0 && serverStatuses.every((s) => s.healthy);
    const statusCode = allHealthy ? 200 : 503;

    return c.json(
      {
        status:
          serverStatuses.length === 0
            ? "no_servers"
            : allHealthy
            ? "healthy"
            : "degraded",
        servers: serverStatuses,
        total: servers.length,
        connected: connectedCount,
      },
      statusCode
    );
  });

  return router;
}
