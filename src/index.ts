import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { ENV } from "./config/env.js";
import "./services/database/database.js";
import authRouter from "./routes/auth.js";
import authStatusRouter from "./routes/auth-status.js";
import askRouter from "./routes/ask.js";
import mcpRouter from "./routes/mcp.js";
import healthRouter from "./routes/health.js";
import connectionsRouter from "./routes/connections.js";
import serviceCallbacksRouter from "./routes/service-callbacks.js";
import sessionRouter from "./routes/session.js";
import "./types/hono.js";
import { cleanupExpiredSessions } from "./services/database/db-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => c.json({ message: "Kay Backend running ✅" }));

app.route("/health", healthRouter);

app.get("/assets/images/logo_orange_kay.png", (c) => {
  const logoPath = join(__dirname, "assets/images/logo_orange_kay.png");
  const logo = readFileSync(logoPath);
  return c.body(logo, 200, {
    "Content-Type": "image/png",
  });
});

app.route("/auth", authRouter);
app.route("/auth", authStatusRouter);
app.route("/", askRouter);
app.route("/mcp", mcpRouter);
app.route("/connections", connectionsRouter);
app.route("/connections", serviceCallbacksRouter);
app.route("/session", sessionRouter);

cleanupExpiredSessions();
setInterval(cleanupExpiredSessions, 24 * 60 * 60 * 1000);

serve({
  fetch: app.fetch,
  port: ENV.PORT,
});

console.log(`Server is running on port ${ENV.PORT}`);
