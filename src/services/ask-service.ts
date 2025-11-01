import type { AskRequest, AskResponse } from "../types/ask.js";
import type { StoredToken } from "../types/oauth.js";
import { createChatCompletion, isOpenAIConfigured } from "./openai-service.js";
import { getSystemPrompt, getInteractivePrompt } from "./prompt-service.js";
import {
  storeInteractiveSession as dbStoreInteractiveSession,
  getInteractiveSession as dbGetInteractiveSession,
  updateInteractiveSessionHistory,
  deleteInteractiveSession as dbDeleteInteractiveSession,
  storePendingConfirmation,
  getPendingConfirmation,
  deletePendingConfirmation,
  type InteractiveSession,
  type PendingConfirmation,
} from "./ask-store.js";

export interface AskServiceContext {
  accountId: string;
  atlassianTokens: StoredToken;
  request: AskRequest;
}

export class AskService {
  async processRequest(context: AskServiceContext): Promise<AskResponse> {
    const { request } = context;

    // Interactive mode - requires session management
    if (request.interactive && request.session_id) {
      return this.handleInteractiveTurn(context);
    }

    // Interactive mode - start new session
    if (request.interactive) {
      return this.startInteractiveSession(context);
    }

    // Confirmation required
    if (request.confirm) {
      return this.handleConfirmationRequest(context);
    }

    // Normal one-shot request
    return this.handleOneShotRequest(context);
  }

  private async handleOneShotRequest(
    context: AskServiceContext
  ): Promise<AskResponse> {
    try {
      if (!isOpenAIConfigured()) {
        return {
          status: "error",
          message: "OpenAI API key is not configured",
        };
      }

      const userInfo = {
        name: context.atlassianTokens.user.name,
        email: context.atlassianTokens.user.email,
        accountId: context.accountId,
      };

      const response = await createChatCompletion({
        messages: [
          {
            role: "system",
            content: getSystemPrompt(userInfo),
          },
          {
            role: "user",
            content: context.request.prompt,
          },
        ],
      });

      return {
        status: "completed",
        message: response,
        data: {
          prompt: context.request.prompt,
          response: response,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        status: "error",
        message: `Failed to process request: ${errorMessage}`,
      };
    }
  }

  private async handleConfirmationRequest(
    context: AskServiceContext
  ): Promise<AskResponse> {
    // Generate confirmation token and return pending status
    const confirmationToken = this.generateConfirmationToken();

    // Store pending action in database
    storePendingConfirmation(confirmationToken, context.accountId, context);

    return {
      status: "confirmation_required",
      confirmation_token: confirmationToken,
      requires_confirmation: true,
      message: `Please confirm the following action: ${context.request.prompt}`,
      data: {
        prompt: context.request.prompt,
        context: context.request.context,
      },
    };
  }

  private async startInteractiveSession(
    context: AskServiceContext
  ): Promise<AskResponse> {
    const sessionId = this.generateSessionId();

    // Store session in database
    dbStoreInteractiveSession(sessionId, context.accountId, context, []);

    // Process first turn with empty history
    const response = await this.processInteractiveTurn(sessionId, context, []);

    return {
      status: "interactive_response",
      session_id: sessionId,
      interactive: true,
      message: response.message,
      data: response.data,
    };
  }

  private async handleInteractiveTurn(
    context: AskServiceContext
  ): Promise<AskResponse> {
    if (!context.request.session_id) {
      return {
        status: "error",
        message: "session_id required for interactive mode",
      };
    }

    // Get conversation history from database
    const session = dbGetInteractiveSession(context.request.session_id);
    if (!session) {
      return {
        status: "error",
        message: "Invalid or expired session_id",
      };
    }

    // Verify session belongs to the same account
    if (session.account_id !== context.accountId) {
      return {
        status: "error",
        message: "Session does not belong to this account",
      };
    }

    const response = await this.processInteractiveTurn(
      context.request.session_id,
      context,
      session.history
    );

    return {
      status: "interactive_response",
      session_id: context.request.session_id,
      interactive: true,
      message: response.message,
      data: response.data,
    };
  }

  private async processInteractiveTurn(
    sessionId: string,
    context: AskServiceContext,
    history: Array<{ role: string; content: string }>
  ): Promise<{ message: string; data?: unknown }> {
    try {
      if (!isOpenAIConfigured()) {
        return {
          message:
            "OpenAI API key is not configured. I need more information to proceed.",
          data: {
            questions: ["Which Jira project should I create this in?"],
          },
        };
      }

      const userInfo = {
        name: context.atlassianTokens.user.name,
        email: context.atlassianTokens.user.email,
        accountId: context.accountId,
      };

      // Build messages array with system prompt, history, and current prompt
      const messages = [
        {
          role: "system" as const,
          content: getInteractivePrompt(userInfo),
        },
        // Add conversation history
        ...history.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        // Add current user message
        {
          role: "user" as const,
          content: context.request.prompt,
        },
      ];

      const aiResponse = await createChatCompletion({
        messages,
      });

      // Update session history in database
      const updatedHistory = [
        ...history,
        { role: "user", content: context.request.prompt },
        { role: "assistant", content: aiResponse },
      ];
      updateInteractiveSessionHistory(sessionId, updatedHistory);

      return {
        message: aiResponse,
        data: {
          prompt: context.request.prompt,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return {
        message: `I encountered an error: ${errorMessage}. Could you please rephrase your request?`,
        data: {
          error: errorMessage,
        },
      };
    }
  }

  async processConfirmation(
    context: AskServiceContext & { approved: boolean }
  ): Promise<AskResponse> {
    if (!context.request.confirmation_token) {
      return {
        status: "error",
        message: "confirmation_token required",
      };
    }

    // Retrieve pending action from database
    const pending = getPendingConfirmation(context.request.confirmation_token);

    if (!pending) {
      return {
        status: "error",
        message: "Invalid or expired confirmation token",
      };
    }

    // Verify it belongs to the same account
    if (pending.account_id !== context.accountId) {
      return {
        status: "error",
        message: "Confirmation token does not belong to this account",
      };
    }

    const pendingAction = pending.context;

    if (!context.approved) {
      // Clean up pending action from database
      deletePendingConfirmation(context.request.confirmation_token);

      return {
        status: "completed",
        message: "Action cancelled by user",
      };
    }

    // Execute the action
    const result = await this.executeAction(pendingAction);

    // Clean up pending action from database
    deletePendingConfirmation(context.request.confirmation_token);

    return {
      status: "completed",
      message: "Action confirmed and executed successfully",
      data: result,
    };
  }

  private async executeAction(
    context: AskServiceContext
  ): Promise<Record<string, unknown>> {
    // TODO: Integrate with AI agent + MCP tools to execute the actual action
    // This will be dynamically determined by the AI agent based on available tools
    return {
      executed: true,
      timestamp: Date.now(),
      prompt: context.request.prompt,
    };
  }

  private generateConfirmationToken(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
