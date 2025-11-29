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
    paths: {
      "/health": {
        get: {
          summary: "Health check",
          description: "Check the health status of connected MCP servers",
          tags: ["Health"],
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
            "503": {
              description: "Some servers are unhealthy",
            },
          },
        },
      },
      "/mcp/connect": {
        post: {
          summary: "Connect to an MCP server",
          description: "Establish a connection to an MCP server",
          tags: ["MCP"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the MCP server to connect to",
                      example: "kmesh",
                    },
                    env: {
                      type: "object",
                      properties: {
                        bearerToken: {
                          type: "string",
                          description: "Bearer token for authentication",
                          example: "your_bearer_token_here",
                        },
                      },
                      additionalProperties: { type: "string" },
                      description:
                        "Environment variables for the server. Must include bearerToken.",
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
            "500": {
              description: "Connection failed",
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
      "/mcp/servers/{name}/tools/{toolName}": {
        post: {
          summary: "Call a tool on an MCP server",
          description: "Execute a tool on a connected MCP server",
          tags: ["MCP"],
          parameters: [
            {
              name: "name",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Name of the connected MCP server",
              example: "kmesh",
            },
            {
              name: "toolName",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Name of the tool to call",
              example: "capabilityCategoriesList",
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
    },
  };
}
