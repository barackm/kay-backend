import { Hono } from "hono";
import { sessionAuthMiddleware } from "../middleware/session-auth.js";
import { getTokensForSession } from "../services/auth/token-service.js";
import {
  createHealthReport,
  checkDatabase,
  checkOpenAI,
} from "../services/health/core.js";
import { checkBitbucket } from "../services/health/providers/bitbucket.js";
import { checkJira } from "../services/health/providers/jira.js";
import { checkConfluence } from "../services/health/providers/confluence.js";

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */
import type { HealthStatus } from "../types/health.js";

/* -------------------------------------------------------------------------- */
/*                                Router Init                                 */
/* -------------------------------------------------------------------------- */
const healthRouter = new Hono();

/* helpers moved to services/health/core.ts */

/* checks moved to services/health/providers/* */

/* -------------------------------------------------------------------------- */
/*                                   Route                                    */
/* -------------------------------------------------------------------------- */

healthRouter.get("/", sessionAuthMiddleware(), async (c) => {
  const sessionToken = c.get("session_token");
  const tokens = getTokensForSession(sessionToken);
  const health = createHealthReport();

  let hasCriticalFailure = false;
  let hasNonCriticalFailure = false;

  try {
    await checkDatabase(health);
  } catch {
    hasCriticalFailure = true;
  }

  await checkOpenAI(health);
  await checkBitbucket(c, health);

  const allTools: any[] = [];
  await checkJira(tokens, health);
  await checkConfluence(tokens, health, allTools);

  // determine overall status
  const statuses = Object.values(health.services).map((s) => s.status);
  if (statuses.includes("unhealthy")) health.status = "degraded";
  if (hasCriticalFailure) health.status = "unhealthy";

  const statusCode = health.status === "healthy" ? 200 : 503;
  return c.json(health, statusCode);
});

export default healthRouter;
