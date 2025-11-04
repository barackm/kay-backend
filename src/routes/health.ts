import { Hono } from "hono";
import { sessionAuthMiddleware } from "../middleware/session-auth.js";
import {
  createHealthReport,
  checkDatabase,
  checkOpenAI,
} from "../services/health/core.js";
import { checkBitbucket } from "../services/health/providers/bitbucket.js";
import { checkJira } from "../services/health/providers/jira.js";
import { checkConfluence } from "../services/health/providers/confluence.js";
const healthRouter = new Hono();

healthRouter.get("/", sessionAuthMiddleware(), async (c) => {
  const kaySessionId = c.get("session_id");
  const health = createHealthReport();

  let hasCriticalFailure = false;

  try {
    await checkDatabase(health);
  } catch {
    hasCriticalFailure = true;
  }

  await checkOpenAI(health);
  if (kaySessionId) {
    await checkBitbucket(kaySessionId, health);
    await checkJira(kaySessionId, health);
    await checkConfluence(kaySessionId, health);
  }

  const statuses = Object.values(health.services).map((s) => s.status);
  if (statuses.includes("unhealthy")) health.status = "degraded";
  if (hasCriticalFailure) health.status = "unhealthy";

  const statusCode = health.status === "unhealthy" ? 503 : 200;
  return c.json(health, statusCode);
});

export default healthRouter;
