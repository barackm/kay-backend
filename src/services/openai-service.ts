import OpenAI from "openai";
import { ENV } from "../config/env.js";

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
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<string> {
  const client = getOpenAIClient();

  try {
    const response = await client.chat.completions.create({
      model: options.model || ENV.OPENAI_MODEL,
      messages: options.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: options.temperature ?? ENV.OPENAI_TEMPERATURE,
      max_tokens: options.max_tokens ?? ENV.OPENAI_MAX_TOKENS,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    return content;
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
