import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { encrypt, decrypt } from "../services/encryption.js";

// Schemas
const McpServerSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    npmPackage: z.string().nullable(),
    localPath: z.string().nullable(),
    requiredEnvVars: z.array(z.string()),
  })
  .openapi("McpServer");

const AvailableServersResponseSchema = z
  .object({
    servers: z.array(McpServerSchema),
  })
  .openapi("AvailableServersResponse");

const ToolSchema = z.object({
  name: z.string(),
  description: z.unknown().optional(),
  inputSchema: z.unknown().optional(),
});

const ToolsResponseSchema = z
  .object({
    server: z.string(),
    tools: z.array(ToolSchema),
    count: z.number(),
  })
  .openapi("ToolsResponse");

const ConnectRequestSchema = z
  .object({
    env: z.record(z.string(), z.string()).optional(),
  })
  .openapi("ConnectRequest");

const ConnectResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("ConnectResponse");

const ToolCallResponseSchema = z.unknown().openapi("ToolCallResponse");

const DeleteResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteResponse");

const ErrorResponseSchema = z.object({
  error: z.string(),
});

// Routes
const listAvailableServersRoute = createRoute({
  method: "get",
  path: "/servers/available",
  tags: ["MCP"],
  summary: "List available MCP servers",
  description: "Get list of all available MCP servers",
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: "List of available servers",
      content: {
        "application/json": {
          schema: AvailableServersResponseSchema,
        },
      },
    },
    500: {
      description: "Server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const listToolsRoute = createRoute({
  method: "get",
  path: "/servers/{name}/tools",
  tags: ["MCP"],
  summary: "List tools from an MCP server",
  description:
    "Get a list of all available tools from a connected MCP server, including their descriptions and input schemas",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      name: z
        .enum(["jira", "bitbucket", "confluence", "kyg-kmesh"])
        .openapi({ example: "jira" }),
    }),
  },
  responses: {
    200: {
      description: "List of tools with schemas",
      content: {
        "application/json": {
          schema: ToolsResponseSchema,
        },
      },
    },
    404: {
      description: "Server not found or credentials not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Failed to connect or list tools",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const connectRoute = createRoute({
  method: "post",
  path: "/connect/{serverName}",
  tags: ["MCP"],
  summary: "Connect to an MCP server",
  description:
    "Connect to an MCP server. If credentials are provided in the request body, they will be saved and then used to connect. If credentials are not provided, previously saved credentials will be used.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      serverName: z.enum(["jira", "bitbucket", "confluence", "kyg-kmesh"]),
    }),
    body: {
      content: {
        "application/json": {
          schema: ConnectRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "Server connected successfully",
      content: {
        "application/json": {
          schema: ConnectResponseSchema,
        },
      },
    },
    400: {
      description: "Missing required environment variables",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    404: {
      description: "Server or credentials not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Connection failed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const callToolRoute = createRoute({
  method: "post",
  path: "/servers/{name}/tools/{toolName}",
  tags: ["MCP"],
  summary: "Call a tool on an MCP server",
  description: "Execute a tool on a connected MCP server",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      name: z.enum(["jira", "bitbucket", "confluence", "kyg-kmesh"]),
      toolName: z.string().openapi({ example: "jira_get" }),
    }),
    body: {
      content: {
        "application/json": {
          schema: z.record(z.string(), z.unknown()).openapi({
            description: "Tool arguments",
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Tool executed successfully",
      content: {
        "application/json": {
          schema: ToolCallResponseSchema,
        },
      },
    },
    404: {
      description: "Server not found or credentials not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Tool execution failed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

const disconnectRoute = createRoute({
  method: "delete",
  path: "/servers/{name}",
  tags: ["MCP"],
  summary: "Disconnect from an MCP server",
  description: "Disconnect from a connected MCP server and remove saved credentials",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      name: z.enum(["jira", "bitbucket", "confluence", "kyg-kmesh"]),
    }),
  },
  responses: {
    200: {
      description: "Server disconnected successfully",
      content: {
        "application/json": {
          schema: DeleteResponseSchema,
        },
      },
    },
    404: {
      description: "Server not found",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Disconnection failed",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createMcpRouter(registry: MCPServerRegistry) {
  const router = new OpenAPIHono();

  router.openapi(listAvailableServersRoute, async (c) => {
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

  router.openapi(listToolsRoute, async (c) => {
    try {
      const user = c.get("user");
      const { name } = c.req.valid("param");

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

      const client = await registry.ensureConnected(user.id, {
        name,
        path: serverPath,
        env: envVars,
      });

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
                const toolObj = tool as {
                  name: string;
                  description?: unknown;
                  inputSchema?: unknown;
                };
                return {
                  name: toolObj.name,
                  description: toolObj.description,
                  inputSchema: toolObj.inputSchema,
                };
              }
              return null;
            })
            .filter((tool) => tool !== null)
        : [];

      console.log(
        `[Route] Tools for ${name}:`,
        JSON.stringify(tools, null, 2)
      );

      return c.json({
        server: name,
        tools,
        count: tools.length,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.openapi(connectRoute, async (c) => {
    try {
      const user = c.get("user");
      const { serverName } = c.req.valid("param");
      const body = c.req.valid("json");
      const { env } = body;

      console.log(
        `[Route] Connect request for ${serverName} by user ${user.id}`
      );

      const server = await prisma.mcpServer.findUnique({
        where: { name: serverName },
      });

      if (!server) {
        console.log(`[Route] Server ${serverName} not found in database`);
        return c.json({ error: `Server ${serverName} not found` }, 404);
      }

      let envVars: Record<string, string> = {};

      if (env) {
        console.log(`[Route] Using provided credentials for ${serverName}`);
        if (server.requiredEnvVars) {
          const requiredVars = (server.requiredEnvVars as string[]).filter(
            (key) => key !== "BEARER_TOKEN"
          );
          const missingVars = requiredVars.filter((key) => !env[key]);
          if (missingVars.length > 0) {
            console.log(
              `[Route] Missing required vars: ${missingVars.join(", ")}`
            );
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
        console.log(`[Route] Loading saved credentials for ${serverName}`);
        const credential = await prisma.userServerCredential.findUnique({
          where: {
            userId_serverId: {
              userId: user.id,
              serverId: server.id,
            },
          },
        });

        if (!credential) {
          console.log(`[Route] No saved credentials found for ${serverName}`);
          return c.json(
            {
              error: `Credentials not found for ${serverName}. Please provide credentials in the request body.`,
            },
            404
          );
        }

        envVars = JSON.parse(decrypt(credential.encryptedEnvVars));

        // Validate saved credentials have all required vars
        if (server.requiredEnvVars) {
          const requiredVars = (server.requiredEnvVars as string[]).filter(
            (key) => key !== "BEARER_TOKEN"
          );
          const missingVars = requiredVars.filter((key) => !envVars[key]);
          if (missingVars.length > 0) {
            console.log(
              `[Route] Saved credentials missing required vars: ${missingVars.join(
                ", "
              )}`
            );
            return c.json(
              {
                error: `Saved credentials are missing required environment variables: ${missingVars.join(
                  ", "
                )}. Please provide updated credentials in the request body.`,
              },
              400
            );
          }
        }
      }

      if (!envVars.BEARER_TOKEN) {
        envVars.BEARER_TOKEN = user.token;
        console.log(`[Route] Using user token as BEARER_TOKEN`);
      }

      const serverPath = server.npmPackage || server.localPath;
      if (!serverPath) {
        console.log(`[Route] No server path configured for ${serverName}`);
        return c.json(
          { error: `Server path not configured for ${serverName}` },
          500
        );
      }

      console.log(`[Route] Connecting to ${serverName}...`);
      const client = await registry.ensureConnected(user.id, {
        name: serverName,
        path: serverPath,
        env: envVars,
      });

      console.log(`[Route] Verifying connection by listing tools...`);
      await client.listTools();
      console.log(`[Route] ${serverName} connected and verified successfully`);

      return c.json({
        message: `Credentials saved and connection verified for server: ${serverName}`,
      });
    } catch (error) {
      const serverName = c.req.param("serverName");
      console.error(`[Route] Connect error for ${serverName}:`, error);
      if (error instanceof Error) {
        console.error(`[Route] Error message: ${error.message}`);
        console.error(`[Route] Error stack:`, error.stack);
      }
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.openapi(callToolRoute, async (c) => {
    try {
      const user = c.get("user");
      const { name, toolName } = c.req.valid("param");
      const args = c.req.valid("json");

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

      const client = await registry.ensureConnected(user.id, {
        name,
        path: serverPath,
        env: envVars,
      });

      const result = await client.callTool(toolName, args);

      return c.json(result);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  router.openapi(disconnectRoute, async (c) => {
    try {
      const user = c.get("user");
      const { name } = c.req.valid("param");

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
