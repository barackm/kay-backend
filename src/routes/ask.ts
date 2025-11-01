import { Hono } from "hono";
import { cliAuthMiddleware } from "../middleware/cli-auth.js";
import { AskService } from "../services/ask-service.js";
import type {
  AskRequest,
  AskResponse,
  ConfirmationRequest,
} from "../types/ask.js";

const askRouter = new Hono();
const askService = new AskService();

askRouter.post("/ask", cliAuthMiddleware(), async (c) => {
  try {
    const body = (await c.req.json()) as AskRequest;

    if (!body.prompt) {
      return c.json<AskResponse>(
        {
          status: "error",
          message: "Missing required field: prompt",
        },
        400
      );
    }

    const accountId = c.get("account_id");
    const atlassianTokens = c.get("atlassian_tokens");

    const response = await askService.processRequest({
      accountId,
      atlassianTokens,
      request: body,
    });

    return c.json<AskResponse>(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("Ask request error:", errorMessage);

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

askRouter.post("/ask/confirm", cliAuthMiddleware(), async (c) => {
  try {
    const body = (await c.req.json()) as ConfirmationRequest;

    if (!body.confirmation_token) {
      return c.json<AskResponse>(
        {
          status: "error",
          message: "Missing required field: confirmation_token",
        },
        400
      );
    }

    const accountId = c.get("account_id");
    const atlassianTokens = c.get("atlassian_tokens");

    const response = await askService.processConfirmation({
      accountId,
      atlassianTokens,
      request: {
        confirmation_token: body.confirmation_token,
        prompt: "", // Not needed for confirmation
      },
      approved: body.approved,
    });

    return c.json<AskResponse>(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    console.error("Confirmation error:", errorMessage);

    return c.json<AskResponse>(
      {
        status: "error",
        message: "Failed to process confirmation",
        data: { error: errorMessage },
      },
      500
    );
  }
});

export default askRouter;
