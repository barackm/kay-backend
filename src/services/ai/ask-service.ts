import type { AskRequest, AskResponse } from "../../types/ask.js";
import { addChatMessage, getChatHistory } from "./ask-store.js";
import { runAgent } from "./agent/index.js";

export interface AskServiceContext {
  accountId: string; // This is kaySessionId
  request: AskRequest;
}

export class AskService {
  async processRequest(context: AskServiceContext): Promise<AskResponse> {
    const kaySessionId = context.accountId;

    const history = await getChatHistory(kaySessionId);

    await addChatMessage(kaySessionId, "user", context.request.prompt);

    const result = await this.processWithNewAgent(
      kaySessionId,
      context,
      history
    );

    return {
      status: "completed",
      message: result.message,
      data: result.data,
    };
  }

  private async processWithNewAgent(
    kaySessionId: string,
    context: AskServiceContext,
    history: Array<{ role: string; content: string }>
  ): Promise<{ message: string; data?: unknown }> {
    console.log(`[Ask Service] Using new agent service`);
    console.log(`[Ask Service] History length: ${history.length}`);
    console.log(`[Ask Service] Current prompt: ${context.request.prompt}`);

    try {
      const messages = this.buildMessagesWithHistory(
        history,
        context.request.prompt
      );

      console.log(`[Ask Service] Total messages to send: ${messages.length}`);
      console.log(
        `[Ask Service] Message roles: ${messages.map((m) => m.role).join(", ")}`
      );

      const result = await runAgent(messages, kaySessionId);

      await addChatMessage(kaySessionId, "assistant", result.message);

      return {
        message: result.message,
        data: {
          prompt: context.request.prompt,
          steps: result.steps,
          usage: result.usage,
        },
      };
    } catch (error) {
      console.error(`[Ask Service] Error with new agent:`, error);

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

  private buildMessagesWithHistory(
    history: Array<{ role: string; content: string }>,
    newPrompt: string
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of history) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    messages.push({
      role: "user",
      content: newPrompt,
    });

    return messages;
  }
}
