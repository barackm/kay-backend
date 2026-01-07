import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { decrypt } from "../services/encryption.js";

const ToolInfoSchema = z.object({
  name: z.string(),
  properties: z.unknown().optional(),
});

const ServerStatusSchema = z
  .object({
    name: z.string(),
    status: z.enum(["connected", "disconnected", "error"]),
    healthy: z.boolean(),
    tools: z.array(ToolInfoSchema),
    error: z.string().optional(),
  })
  .openapi("ServerStatus");

const HealthResponseSchema = z
  .object({
    status: z.enum(["healthy", "degraded", "no_servers"]),
    servers: z.array(ServerStatusSchema),
    total: z.number(),
    connected: z.number(),
  })
  .openapi("HealthResponse");

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const healthRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["Health"],
  summary: "Health check",
  description: "Check the health status of connected MCP servers",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "All servers are healthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
    401: {
      description: "Unauthorized - Missing or invalid authorization header",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    503: {
      description: "Some servers are unhealthy",
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
    },
  },
});

interface ToolInfo {
  name: string;
  properties?: unknown;
}

interface ServerStatus {
  name: string;
  status: "connected" | "disconnected" | "error";
  healthy: boolean;
  tools: ToolInfo[];
  error?: string;
}

async function checkServer(
  registry: MCPServerRegistry,
  userId: string,
  serverName: string,
  serverPath: string,
  envVars: Record<string, string>
): Promise<ServerStatus> {
  try {
    await registry.connect(userId, {
      name: serverName,
      path: serverPath,
      env: envVars,
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const client = registry.getClient(userId, serverName);
    const result = await client.listTools();

    const tools: ToolInfo[] = Array.isArray(result.tools)
      ? result.tools
          .map((tool: unknown) => {
            if (
              typeof tool === "object" &&
              tool !== null &&
              "name" in tool &&
              typeof (tool as { name: unknown }).name === "string"
            ) {
              const toolObj = tool as {
                name: string;
                description?: unknown;
                inputSchema?: unknown;
              };
              const toolInfo: ToolInfo = {
                name: toolObj.name,
              };
              if (
                "inputSchema" in toolObj &&
                typeof toolObj.inputSchema === "object" &&
                toolObj.inputSchema !== null &&
                "properties" in toolObj.inputSchema
              ) {
                toolInfo.properties = (
                  toolObj.inputSchema as { properties?: unknown }
                ).properties;
              }
              return toolInfo;
            }
            return null;
          })
          .filter((tool): tool is ToolInfo => tool !== null)
      : [];

    await registry.disconnect(userId, serverName);

    return {
      name: serverName,
      status: "connected",
      healthy: true,
      tools,
    };
  } catch (error) {
    try {
      await registry.disconnect(userId, serverName).catch(() => {});
    } catch {
      // Ignore
    }

    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      name: serverName,
      status: "disconnected",
      healthy: false,
      error: errorMessage,
      tools: [],
    };
  }
}

export function createHealthRouter(registry: MCPServerRegistry) {
  const router = new OpenAPIHono();

  router.openapi(healthRoute, async (c) => {
    const user = c.get("user");

    const credentials = await prisma.userServerCredential.findMany({
      where: { userId: user.id },
      include: { server: true },
    });

    const servers: ServerStatus[] = [];

    for (const credential of credentials) {
      try {
        const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
        if (!envVars.BEARER_TOKEN) {
          envVars.BEARER_TOKEN = user.token;
        }

        const serverPath =
          credential.server.npmPackage || credential.server.localPath;
        if (!serverPath) {
          servers.push({
            name: credential.server.name,
            status: "error",
            healthy: false,
            error: "Server path not configured",
            tools: [],
          });
          continue;
        }

        const status = await checkServer(
          registry,
          user.id,
          credential.server.name,
          serverPath,
          envVars
        );
        servers.push(status);
      } catch (error) {
        servers.push({
          name: credential.server.name,
          status: "error",
          healthy: false,
          error: error instanceof Error ? error.message : "Unknown error",
          tools: [],
        });
      }
    }

    const connected = servers.filter((s) => s.healthy).length;
    const allHealthy = servers.every((s) => s.healthy);

    return c.json(
      {
        status:
          servers.length === 0
            ? "no_servers"
            : allHealthy
            ? "healthy"
            : "degraded",
        servers,
        total: servers.length,
        connected,
      },
      servers.length === 0 || allHealthy ? 200 : 503
    );
  });

  return router;
}
