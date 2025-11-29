import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { swaggerUI } from "@hono/swagger-ui";
import { ENV } from "./config/env.js";
import { getOpenAPISpec } from "./config/openapi.js";
import { createHealthRouter } from "./routes/health.js";
import { createMcpRouter } from "./routes/mcp.js";
import { MCPServerRegistry } from "./services/mcp/server-registry.js";

const app = new Hono();
const registry = new MCPServerRegistry();

app.get("/", (c) => {
  return c.json({ message: "Welcome to Kay Backend" });
});

app.get(
  "/api",
  swaggerUI({
    url: "/openapi.json",
  })
);

app.get("/openapi.json", (c) => {
  return c.json(getOpenAPISpec());
});

app.route("/health", createHealthRouter(registry));
app.route("/mcp", createMcpRouter(registry));

serve({
  fetch: app.fetch,
  port: ENV.PORT,
});

console.log(`Server is running on port ${ENV.PORT}`);
