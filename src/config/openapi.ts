import { ENV } from "./env.js";

export function getOpenAPISpec() {
  return {
    openapi: "3.0.0",
    info: {
      title: "Kay Backend API",
      version: "1.0.0",
      description: "MCP Client API for connecting to multiple MCP servers",
    },
    servers: [
      {
        url: `http://localhost:${ENV.PORT}`,
        description: "Local server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    paths: {
      "/auth/login": {
        post: {
          summary: "Login",
          description: "Authenticate user with external KYG API",
          tags: ["Auth"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: {
                      type: "string",
                      format: "email",
                      example: "user@example.com",
                    },
                    password: {
                      type: "string",
                      example: "password123",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Login successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token: {
                        type: "string",
                        description: "JWT token from external API",
                      },
                      user: {
                        type: "object",
                        properties: {
                          email: { type: "string" },
                          firstName: { type: "string" },
                          lastName: { type: "string" },
                          userid: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Invalid credentials",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/auth/me": {
        get: {
          summary: "Get current user",
          description: "Get current authenticated user information",
          tags: ["Auth"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "User information",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      user: {
                        type: "object",
                        properties: {
                          id: { type: "string", format: "uuid" },
                          email: { type: "string" },
                          externalUserId: { type: "number" },
                          createdAt: { type: "string", format: "date-time" },
                        },
                      },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          summary: "Health check",
          description: "Check the health status of connected MCP servers",
          tags: ["Health"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "All servers are healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "healthy" },
                      servers: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            name: { type: "string" },
                            status: { type: "string" },
                            healthy: { type: "boolean" },
                            tools: {
                              type: "array",
                              items: { type: "string" },
                              description: "List of available tool names",
                            },
                            error: { type: "string" },
                          },
                        },
                      },
                      total: { type: "number" },
                      connected: { type: "number" },
                    },
                  },
                },
              },
            },
            "401": {
              description:
                "Unauthorized - Missing or invalid authorization header",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: {
                        type: "string",
                        example: "Missing or invalid authorization header",
                      },
                    },
                  },
                },
              },
            },
            "503": {
              description: "Some servers are unhealthy",
            },
          },
        },
      },
      "/mcp/servers/available": {
        get: {
          summary: "List available MCP servers",
          description: "Get list of all available MCP servers",
          tags: ["MCP"],
          security: [{ bearerAuth: [] }],
          responses: {
            "200": {
              description: "List of available servers",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      servers: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string", format: "uuid" },
                            name: { type: "string" },
                            npmPackage: { type: "string", nullable: true },
                            localPath: { type: "string", nullable: true },
                            requiredEnvVars: {
                              type: "array",
                              items: { type: "string" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/mcp/connect/{serverName}": {
        post: {
          summary: "Connect to an MCP server",
          description:
            "Connect to an MCP server. If credentials are provided in the request body, they will be saved and then used to connect. If credentials are not provided, previously saved credentials will be used. Note: BEARER_TOKEN is optional - if not provided, your authentication token will be used automatically.",
          tags: ["MCP"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "serverName",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["jira", "bitbucket", "confluence", "kyg-kmesh"],
              },
              description: "Name of the MCP server to connect to",
              example: "jira",
            },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    env: {
                      type: "object",
                      additionalProperties: { type: "string" },
                      description:
                        "Environment variables for the server. If provided, credentials will be saved and used for connection. If omitted, previously saved credentials will be used. BEARER_TOKEN is optional - if not provided, your authentication token will be used automatically.",
                      examples: {
                        "kyg-kmesh": {
                          value: {
                            API_BASE_URL: "https://dev-oracle.kygenv.com/v1",
                          },
                          summary: "kyg-kmesh (BEARER_TOKEN optional)",
                        },
                        jira: {
                          value: {
                            ATLASSIAN_SITE_NAME: "mycompany",
                            ATLASSIAN_USER_EMAIL: "user@example.com",
                            ATLASSIAN_API_TOKEN: "token123",
                          },
                          summary: "Jira example",
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Server connected successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Missing required environment variables",
            },
            "404": {
              description: "Server or credentials not found",
            },
            "500": {
              description: "Connection failed",
            },
          },
        },
      },
      "/mcp/servers/{name}/tools/{toolName}": {
        post: {
          summary: "Call a tool on an MCP server",
          description: "Execute a tool on a connected MCP server",
          tags: ["MCP"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "name",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["jira", "bitbucket", "confluence", "kyg-kmesh"],
              },
              description: "Name of the connected MCP server",
              example: "jira",
            },
            {
              name: "toolName",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Name of the tool to call",
              example: "getIssue",
            },
          ],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "Tool arguments",
                  additionalProperties: true,
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Tool executed successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    description: "Tool execution result",
                    additionalProperties: true,
                  },
                },
              },
            },
            "500": {
              description: "Tool execution failed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/mcp/servers/{name}": {
        delete: {
          summary: "Disconnect from an MCP server",
          description: "Disconnect from a connected MCP server",
          tags: ["MCP"],
          security: [{ bearerAuth: [] }],
          parameters: [
            {
              name: "name",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: ["jira", "bitbucket", "confluence", "kyg-kmesh"],
              },
              description: "Name of the MCP server to disconnect from",
              example: "jira",
            },
          ],
          responses: {
            "200": {
              description: "Server disconnected successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
            "500": {
              description: "Disconnection failed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}
