import type { AskRequest, AskResponse } from "../../types/ask.js";
import {
  createChatCompletion,
  isOpenAIConfigured,
  type ChatMessage as OpenAIChatMessage,
} from "./openai-service.js";
import { addChatMessage, getChatHistory } from "./ask-store.js";
import { getAllMCPTools, executeMCPTool } from "../mcp/manager.js";

export interface AskServiceContext {
  accountId: string; // This is kaySessionId
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

    // Interactive mode: multi-turn conversation (uses kaySessionId from context)
    if (request.interactive) {
      return this.handleInteractiveTurn(context);
    }

    // One-shot mode: single request/response
    return this.handleOneShotRequest(context);
  }

  private async handleOneShotRequest(
    context: AskServiceContext
  ): Promise<AskResponse> {
    try {
      const kaySessionId = context.accountId;

      const mcpToolsData = await getAllMCPTools(kaySessionId);
      const allTools = mcpToolsData.flatMap((data) => data.tools);
      const tools = allTools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          ...(tool.description && { description: tool.description }),
          ...(tool.inputSchema && { parameters: tool.inputSchema }),
        },
      }));

      const messages: OpenAIChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context.request.prompt },
      ];

      let result = await createChatCompletion({ messages, tools });

      while (result.toolCalls.length > 0) {
        const toolMessages: OpenAIChatMessage[] = [];

        for (const toolCall of result.toolCalls) {
          try {
            const toolResult = await executeMCPTool(
              kaySessionId,
              toolCall.name,
              toolCall.arguments
            );

            toolMessages.push({
              role: "tool",
              content: toolResult,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            toolMessages.push({
              role: "tool",
              content: `Error executing tool: ${errorMessage}`,
              tool_call_id: toolCall.id,
            });
          }
        }

        messages.push({
          role: "assistant",
          content: result.content || "",
          tool_calls: result.toolCalls,
        });

        messages.push(...toolMessages);

        result = await createChatCompletion({ messages, tools });
      }

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

  private async handleInteractiveTurn(
    context: AskServiceContext
  ): Promise<AskResponse> {
    const kaySessionId = context.accountId;

    // Get chat history for this kay session
    const history = await getChatHistory(kaySessionId, 50);

    // Process the turn
    const response = await this.processInteractiveTurn(
      kaySessionId,
      context,
      history
    );

    return {
      status: "interactive_response",
      session_id: kaySessionId, // Return kaySessionId as session_id for backward compatibility
      interactive: true,
      message: response.message,
      data: response.data,
    };
  }

  private async processInteractiveTurn(
    kaySessionId: string,
    context: AskServiceContext,
    history: Array<{ role: string; content: string }>
  ): Promise<{ message: string; data?: unknown }> {
    try {
      await addChatMessage(kaySessionId, "user", context.request.prompt);

      const mcpToolsData = await getAllMCPTools(kaySessionId);
      const allTools = mcpToolsData.flatMap((data) => data.tools);
      const tools = allTools.map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          ...(tool.description && { description: tool.description }),
          ...(tool.inputSchema && { parameters: tool.inputSchema }),
        },
      }));

      const messages: OpenAIChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...history.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        { role: "user", content: context.request.prompt },
      ];

      let result = await createChatCompletion({ messages, tools });

      while (result.toolCalls.length > 0) {
        const toolMessages: OpenAIChatMessage[] = [];

        for (const toolCall of result.toolCalls) {
          try {
            const toolResult = await executeMCPTool(
              kaySessionId,
              toolCall.name,
              toolCall.arguments
            );

            toolMessages.push({
              role: "tool",
              content: toolResult,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            toolMessages.push({
              role: "tool",
              content: `Error executing tool: ${errorMessage}`,
              tool_call_id: toolCall.id,
            });
          }
        }

        messages.push({
          role: "assistant",
          content: result.content || "",
          tool_calls: result.toolCalls,
        });

        messages.push(...toolMessages);

        result = await createChatCompletion({ messages, tools });
      }

      const assistantMessage =
        result.content || "I'm sorry, I couldn't generate a response.";

      await addChatMessage(kaySessionId, "assistant", assistantMessage);

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
}
