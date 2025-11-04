import { Hono } from "hono";
import {
  getStateAccountId,
  isStateComplete,
  removeState,
} from "../services/connections/state-store.js";

const authStatusRouter = new Hono();

authStatusRouter.get("/status/:state", async (c) => {
  const state = c.req.param("state");

  if (!state) {
    return c.json({ error: "Missing state parameter" }, 400);
  }

  if (!isStateComplete(state)) {
    return c.json({
      status: "pending",
      message: "Authorization not yet completed",
    });
  }

  const accountId = getStateAccountId(state);

  removeState(state);

  return c.json({
    status: "completed",
    account_id: accountId,
    message:
      "Authorization completed successfully. Use your existing session token for authentication.",
  });
});

export default authStatusRouter;
