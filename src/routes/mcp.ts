import { Hono } from "hono";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { z } from "zod";

export function createMcpRouter(registry: MCPServerRegistry) {
  const router = new Hono();

  const connectSchema = z.object({
    name: z.string(),
    env: z
      .object({
        bearerToken: z.string().min(1),
      })
      .passthrough()
      .optional(),
  });

  router.post("/connect", async (c) => {
    try {
      const body = await c.req.json();
      const config = connectSchema.parse(body);

      const serverEnv: Record<string, string> = {};

      if (config.env?.bearerToken) {
        serverEnv.BEARER_TOKEN = config.env.bearerToken;
        const { bearerToken, ...restEnv } = config.env;
        Object.assign(serverEnv, restEnv);
      }

      const serverConfig = {
        name: config.name,
        env: serverEnv,
      };

      await registry.connect(serverConfig);
      return c.json({ message: `Connected to server: ${config.name}` });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.post("/servers/:name/tools/:toolName", async (c) => {
    try {
      const name = c.req.param("name");
      const toolName = c.req.param("toolName");
      const args = await c.req.json().catch(() => ({}));

      const client = registry.getClient(name);
      const result = await client.callTool(toolName, args);
      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  return router;
}
