import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { AskService } from "../services/ai/ask-service.js";
import type { AskRequest, AskResponse } from "../types/ask.js";

const askRouter = new Hono();
const askService = new AskService();

askRouter.post("/ask", authMiddleware(), async (c) => {
  try {
    const body = (await c.req.json()) as AskRequest;

    const sessionId = c.get("session_id");

    if (!sessionId) {
      return c.json<AskResponse>(
        {
          status: "error",
          message: "Session ID is required",
        },
        401
      );
    }

    const response = await askService.processRequest({
      accountId: sessionId,
      request: body,
    });

    return c.json<AskResponse>(response);
  } catch (error) {
    console.error("[ask] Error processing request:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return c.json<AskResponse>(
      {
        status: "error",
        message: "Failed to process request",
        data: { error: errorMessage },
      },
      500
    );
  }
});

export default askRouter;
