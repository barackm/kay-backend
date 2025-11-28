import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ENV } from "../../config/env.js";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!ENV.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    openaiClient = new OpenAI({
      apiKey: ENV.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, unknown>;
    };
  }> | undefined;
}

export interface ChatCompletionResult {
  content: string | null;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | null;
}

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResult> {
  const client = getOpenAIClient();

  try {
    const messages: ChatCompletionMessageParam[] = options.messages.map(
      (msg) => {
        if (msg.role === "tool" && msg.tool_call_id) {
          return {
            role: "tool" as const,
            content: msg.content,
            tool_call_id: msg.tool_call_id,
          };
        }
        if (msg.role === "system") {
          return {
            role: "system" as const,
            content: msg.content,
          };
        }
        if (msg.role === "user") {
          return {
            role: "user" as const,
            content: msg.content,
          };
        }
        if (msg.role === "assistant") {
          const assistantMsg: OpenAI.Chat.Completions.ChatCompletionMessageParam =
          {
            role: "assistant" as const,
            content: msg.content,
          };

          if (msg.tool_calls && msg.tool_calls.length > 0) {
            assistantMsg.tool_calls = msg.tool_calls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            }));
          }

          return assistantMsg;
        }
        return {
          role: "user" as const,
          content: msg.content,
        };
      }
    );

    const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: options.model || ENV.OPENAI_MODEL,
      messages,
      temperature: options.temperature ?? ENV.OPENAI_TEMPERATURE,
      max_tokens: options.max_tokens ?? ENV.OPENAI_MAX_TOKENS,
    }

    if (options.tools && options.tools.length > 0) {
      requestParams.tools =
        options.tools as OpenAI.Chat.Completions.ChatCompletionTool[];
    }

    console.log(`[OpenAI] Calling with ${options.tools?.length || 0} tools available`);
    const response = await client.chat.completions.create(requestParams);

    const message = response.choices[0]?.message;
    console.log(`[OpenAI] Finish reason: ${response.choices[0]?.finish_reason}`);
    console.log(`[OpenAI] Has tool_calls: ${!!message?.tool_calls}`);
    if (message?.content) {
      console.log(`[OpenAI] Content preview: ${message.content.substring(0, 100)}...`);
    }

    const toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }> = [];

    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        if ("function" in tc && tc.function) {
          toolCalls.push({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || "{}"),
          });
        }
      }
    }

    const finishReason = response.choices[0]?.finish_reason;
    const validFinishReason:
      | "stop"
      | "length"
      | "tool_calls"
      | "content_filter"
      | null =
      finishReason === "stop" ||
        finishReason === "length" ||
        finishReason === "tool_calls" ||
        finishReason === "content_filter"
        ? finishReason
        : null;

    return {
      content: message?.content ?? null,
      toolCalls: toolCalls.length > 0 ? toolCalls : [],
      finishReason: validFinishReason,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`OpenAI API error: ${error.message}`);
    }
    throw new Error("Unknown OpenAI API error");
  }
}

export function isOpenAIConfigured(): boolean {
  return !!ENV.OPENAI_API_KEY;
}
