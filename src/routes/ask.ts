import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth.js";
import { AskService } from "../services/ai/ask-service.js";
import type {
  AskRequest,
  AskResponse,
  ConfirmationRequest,
} from "../types/ask.js";

const askRouter = new Hono();
const askService = new AskService();

askRouter.post("/ask", authMiddleware(), async (c) => {
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
    const jiraProjects = c.get("jira_projects") || [];
    const confluenceSpaces = c.get("confluence_spaces") || [];

    const sessionToken = c.get("session_token");
    const response = await askService.processRequest({
      accountId,
      atlassianTokens,
      request: body,
      jiraProjects,
      confluenceSpaces,
      sessionToken,
    });

    return c.json<AskResponse>(response);
  } catch (error) {
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

askRouter.post("/ask/confirm", authMiddleware(), async (c) => {
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
    const jiraProjects = c.get("jira_projects") || [];
    const confluenceSpaces = c.get("confluence_spaces") || [];

    const response = await askService.processConfirmation({
      accountId,
      atlassianTokens,
      request: {
        confirmation_token: body.confirmation_token,
        prompt: "",
      },
      approved: body.approved,
      jiraProjects,
      confluenceSpaces,
    });

    return c.json<AskResponse>(response);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

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
