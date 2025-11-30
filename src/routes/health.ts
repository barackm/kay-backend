import { Hono } from "hono";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { decrypt } from "../services/encryption.js";

interface ServerStatus {
  name: string;
  status: "connected" | "disconnected" | "error";
  healthy: boolean;
  tools: string[];
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

    const tools = Array.isArray(result.tools)
      ? result.tools
          .map((tool: unknown) => {
            if (
              typeof tool === "object" &&
              tool !== null &&
              "name" in tool &&
              typeof (tool as { name: unknown }).name === "string"
            ) {
              return (tool as { name: string }).name;
            }
            return null;
          })
          .filter((name): name is string => name !== null)
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
  const router = new Hono();

  router.get("/", async (c) => {
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
