import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { prisma } from "../db/client.js";
import { encrypt, decrypt } from "../services/encryption.js";

// Schemas
const McpServerNameSchema = z
  .enum(["jira", "bitbucket", "confluence", "kyg-kmesh"])
  .openapi({ example: "jira" });

const ToolSchema = z.object({
  name: z.string(),
  description: z.unknown().optional(),
  inputSchema: z.unknown().optional(),
});

const ServerStatusResponseSchema = z
  .object({
    serverName: z.string(),
    connected: z.boolean(),
    tools: z.array(ToolSchema),
  })
  .openapi("ServerStatusResponse");

const ConnectRequestSchema = z
  .object({
    env: z
      .record(z.string(), z.string())
      .optional()
      .openapi({
        description:
          "Environment variables for the MCP server. Required variables depend on the server type.",
        example: {
          JIRA_HOST: "your-instance.atlassian.net",
          JIRA_EMAIL: "user@example.com",
          JIRA_API_TOKEN: "your-api-token",
        },
      }),
  })
  .openapi("ConnectRequest");

const ConnectResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("ConnectResponse");

const DeleteResponseSchema = z
  .object({
    message: z.string(),
  })
  .openapi("DeleteResponse");

const ErrorResponseSchema = z.object({
  error: z.string(),
});

// Routes
const serverStatusRoute = createRoute({
  method: "get",
  path: "/servers/{name}/status",
  tags: ["MCP"],
  summary: "Get server connection status and available tools",
  description:
    "Get the connection status of an MCP server and list all available tools with their descriptions and input schemas. Serves as both health check and tool discovery endpoint.",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      name: McpServerNameSchema,
    }),
  },
  responses: {
    200: {
      description: "Server status and available tools",
      content: {
        "application/json": {
          schema: ServerStatusResponseSchema,
        },
      },
    },
    404: {
      description: "Server not found or not connected",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Failed to check status or list tools",
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
  description: `Connect to an MCP server. If credentials are provided in the request body, they will be saved and then used to connect. If credentials are not provided, previously saved credentials will be used.

Required environment variables by server:
- **jira**: JIRA_HOST (will be mapped to JIRA_BASE_URL), JIRA_EMAIL, JIRA_API_TOKEN
- **bitbucket**: BITBUCKET_USERNAME, BITBUCKET_APP_PASSWORD
- **confluence**: CONFLUENCE_URL, CONFLUENCE_USERNAME, CONFLUENCE_API_TOKEN
- **kyg-kmesh**: API_BASE_URL, BEARER_TOKEN`,
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      serverName: McpServerNameSchema,
    }),
    body: {
      content: {
        "application/json": {
          schema: ConnectRequestSchema.openapi({
            example: {
              env: {
                JIRA_HOST: "your-instance.atlassian.net",
                JIRA_EMAIL: "user@example.com",
                JIRA_API_TOKEN: "your-api-token",
              },
            },
          }),
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

const disconnectRoute = createRoute({
  method: "delete",
  path: "/servers/{name}",
  tags: ["MCP"],
  summary: "Disconnect from an MCP server",
  description:
    "Disconnect from a connected MCP server and remove saved credentials",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      name: McpServerNameSchema,
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

  // @ts-ignore - Hono OpenAPI type inference limitation with try-catch returning multiple status codes
  router.openapi(serverStatusRoute, async (c) => {
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
        `[Route] Status check for ${name}:`,
        JSON.stringify(tools, null, 2)
      );

      return c.json({
        serverName: name,
        connected: true,
        tools,
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  // @ts-ignore - Hono OpenAPI type inference limitation with try-catch returning multiple status codes
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

  // @ts-ignore - Hono OpenAPI type inference limitation with try-catch returning multiple status codes
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
