import type { AskRequest, AskResponse } from "../../types/ask.js";
import {
  createChatCompletion,
  isOpenAIConfigured,
  type ChatMessage,
} from "./openai-service.js";
import {
  storeInteractiveSession as dbStoreInteractiveSession,
  getInteractiveSession as dbGetInteractiveSession,
  updateInteractiveSessionHistory,
} from "./ask-store.js";

export interface AskServiceContext {
  accountId: string;
  request: AskRequest;
}

const SYSTEM_PROMPT = `You are Kay, a helpful AI assistant for developers. You help with questions and conversations about development, coding, and general assistance. Be friendly, concise, and helpful.`;

export class AskService {
  async processRequest(context: AskServiceContext): Promise<AskResponse> {
    const { request } = context;

    if (!request.prompt) {
      return {
        status: "error",
        message: "Missing required field: prompt",
      };
    }

    if (!isOpenAIConfigured()) {
      return {
        status: "error",
        message: "OpenAI API key is not configured",
      };
    }

    // Interactive mode: multi-turn conversation
    if (request.interactive) {
      if (request.session_id) {
        return this.handleInteractiveTurn(context);
      } else {
        return this.startInteractiveSession(context);
      }
    }

    // One-shot mode: single request/response
    return this.handleOneShotRequest(context);
  }

  private async handleOneShotRequest(
    context: AskServiceContext
  ): Promise<AskResponse> {
    try {
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context.request.prompt },
      ];

      const result = await createChatCompletion({ messages });

      return {
        status: "completed",
        message: result.content || "I'm sorry, I couldn't generate a response.",
        data: {
          prompt: context.request.prompt,
          response: result.content,
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

  private async startInteractiveSession(
    context: AskServiceContext
  ): Promise<AskResponse> {
    const sessionId = this.generateSessionId();

    // Store empty session
    dbStoreInteractiveSession(sessionId, context.accountId, context, []);

    // Process first turn
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
    const sessionId = context.request.session_id!;

    // Try to retrieve existing session for history
    const session = dbGetInteractiveSession(sessionId);

    if (!session) {
      // Session not found, start a new one
      return this.startInteractiveSession(context);
    }

    // Process with existing history
    const response = await this.processInteractiveTurn(
      sessionId,
      context,
      session.history
    );

    return {
      status: "interactive_response",
      session_id: sessionId,
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
      const messages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: context.request.prompt },
      ];

      const result = await createChatCompletion({ messages });

      const assistantMessage =
        result.content || "I'm sorry, I couldn't generate a response.";

      // Update history
      const updatedHistory = [
        ...history,
        { role: "user", content: context.request.prompt },
        { role: "assistant", content: assistantMessage },
      ];
      updateInteractiveSessionHistory(sessionId, updatedHistory);

      return {
        message: assistantMessage,
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

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
