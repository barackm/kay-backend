import { OpenAPIHono } from "@hono/zod-openapi";
import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { ENV } from "./config/env.js";
import { createMcpRouter } from "./routes/mcp.js";
import { createAuthRouter } from "./routes/auth.js";
import { createChatRouter } from "./routes/chat.js";
import { MCPServerRegistry } from "./services/mcp/server-registry.js";
import { authMiddleware } from "./services/auth/middleware.js";

const app = new OpenAPIHono();
const registry = new MCPServerRegistry();

// Register security scheme
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
});

// Apply auth middleware to all routes
app.use("*", authMiddleware);

// Welcome route
app.get("/", (c) => {
  return c.json({ message: "Welcome to Kay Backend" });
});

// Mount routers
app.route("/auth", createAuthRouter());
app.route("/mcp", createMcpRouter(registry));
app.route("/", createChatRouter(registry));

// Generate and serve OpenAPI spec
app.doc("/openapi.json", {
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
});

// Swagger UI
app.get(
  "/api",
  swaggerUI({
    url: "/openapi.json",
    persistAuthorization: true,
  })
);

serve({
  fetch: app.fetch,
  port: ENV.PORT,
});
