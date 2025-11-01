import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { ENV } from "./config/env.js";
import "./services/database.js";
import authRouter from "./routes/auth.js";
import askRouter from "./routes/ask.js";
import "./types/hono.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/", (c) => c.json({ message: "Kay Backend running ✅" }));

app.get("/assets/images/logo_orange_kay.png", (c) => {
  const logoPath = join(__dirname, "assets/images/logo_orange_kay.png");
  const logo = readFileSync(logoPath);
  return c.body(logo, 200, {
    "Content-Type": "image/png",
  });
});

app.route("/auth", authRouter);
app.route("/", askRouter);

serve({
  fetch: app.fetch,
  port: ENV.PORT,
});

console.log(`Server is running on port ${ENV.PORT}`);
