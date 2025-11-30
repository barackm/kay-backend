import { Hono } from "hono";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { encrypt, decrypt } from "../services/encryption.js";
import { z } from "zod";

export function createMcpRouter(registry: MCPServerRegistry) {
  const router = new Hono();

  router.get("/servers/available", async (c) => {
    try {
      const servers = await prisma.mcpServer.findMany({
        select: {
          id: true,
          name: true,
          npmPackage: true,
          localPath: true,
          requiredEnvVars: true,
        },
      });
      return c.json({ servers });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  const connectSchema = z.object({
    env: z.record(z.string(), z.string()).optional(),
  });

  router.post("/connect/:serverName", async (c) => {
    try {
      const user = c.get("user");
      const serverName = c.req.param("serverName");
      const body = await c.req.json().catch(() => ({}));
      const { env } = connectSchema.parse(body);

      const server = await prisma.mcpServer.findUnique({
        where: { name: serverName },
      });

      if (!server) {
        return c.json({ error: `Server ${serverName} not found` }, 404);
      }

      let envVars: Record<string, string> = {};

      if (env) {
        if (server.requiredEnvVars) {
          const requiredVars = (server.requiredEnvVars as string[]).filter(
            (key) => key !== "BEARER_TOKEN"
          );
          const missingVars = requiredVars.filter((key) => !env[key]);
          if (missingVars.length > 0) {
            return c.json(
              {
                error: `Missing required environment variables: ${missingVars.join(
                  ", "
                )}`,
              },
              400
            );
          }
        }

        const encryptedEnvVars = encrypt(JSON.stringify(env));

        await prisma.userServerCredential.upsert({
          where: {
            userId_serverId: {
              userId: user.id,
              serverId: server.id,
            },
          },
          update: {
            encryptedEnvVars: encryptedEnvVars,
            updatedAt: new Date(),
          },
          create: {
            userId: user.id,
            serverId: server.id,
            encryptedEnvVars: encryptedEnvVars,
          },
        });

        envVars = env;
      } else {
        const credential = await prisma.userServerCredential.findUnique({
          where: {
            userId_serverId: {
              userId: user.id,
              serverId: server.id,
            },
          },
        });

        if (!credential) {
          return c.json(
            {
              error: `Credentials not found for ${serverName}. Please provide credentials in the request body.`,
            },
            404
          );
        }

        envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
      }

      if (!envVars.BEARER_TOKEN) {
        envVars.BEARER_TOKEN = user.token;
      }

      const serverPath = server.npmPackage || server.localPath;
      if (!serverPath) {
        return c.json(
          { error: `Server path not configured for ${serverName}` },
          500
        );
      }

      await registry.connect(user.id, {
        name: serverName,
        path: serverPath,
        env: envVars,
      });

      await new Promise((resolve) => setTimeout(resolve, 800));

      const client = registry.getClient(user.id, serverName);
      await client.listTools();

      await registry.disconnect(user.id, serverName);

      return c.json({
        message: `Credentials saved and connection verified for server: ${serverName}`,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.post("/servers/:name/tools/:toolName", async (c) => {
    let client = null;
    try {
      const user = c.get("user");
      const name = c.req.param("name");
      const toolName = c.req.param("toolName");
      const args = await c.req.json().catch(() => ({}));

      const server = await prisma.mcpServer.findUnique({
        where: { name },
      });

      if (!server) {
        return c.json({ error: `Server ${name} not found` }, 404);
      }

      const credential = await prisma.userServerCredential.findUnique({
        where: {
          userId_serverId: {
            userId: user.id,
            serverId: server.id,
          },
        },
      });

      if (!credential) {
        return c.json(
          { error: `Credentials not found for ${name}. Please connect first.` },
          404
        );
      }

      const envVars = JSON.parse(decrypt(credential.encryptedEnvVars));
      if (!envVars.BEARER_TOKEN) {
        envVars.BEARER_TOKEN = user.token;
      }

      const serverPath = server.npmPackage || server.localPath;
      if (!serverPath) {
        return c.json({ error: `Server path not configured for ${name}` }, 500);
      }

      await registry.connect(user.id, {
        name,
        path: serverPath,
        env: envVars,
      });

      client = registry.getClient(user.id, name);
      const result = await client.callTool(toolName, args);

      await registry.disconnect(user.id, name);

      return c.json(result);
    } catch (error) {
      if (client) {
        try {
          const user = c.get("user");
          const name = c.req.param("name");
          await registry.disconnect(user.id, name);
        } catch {
          // Ignore disconnect errors
        }
      }
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.delete("/servers/:name", async (c) => {
    try {
      const user = c.get("user");
      const name = c.req.param("name");

      const server = await prisma.mcpServer.findUnique({
        where: { name },
      });

      if (!server) {
        return c.json({ error: `Server ${name} not found` }, 404);
      }

      await prisma.userServerCredential.delete({
        where: {
          userId_serverId: {
            userId: user.id,
            serverId: server.id,
          },
        },
      });

      return c.json({ message: `Credentials removed for server: ${name}` });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  return router;
}
