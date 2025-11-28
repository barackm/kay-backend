import { Experimental_Agent as Agent, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import {
  listDirectory,
  readFileContent,
  executeTypeScriptCode,
} from "../tools/filesystem/operations.js";
import { getSystemPrompt } from "../prompt-service.js";

function createAgent(kaySessionId: string) {
  const systemPrompt = getSystemPrompt(
    { accountId: kaySessionId },
    [
      {
        name: "list_directory",
        description: "List contents of a directory",
      },
      {
        name: "read_file",
        description: "Read content of a file",
      },
      {
        name: "execute_typescript",
        description: "Execute TypeScript code in a secure sandbox",
      },
    ]
  );

  const fullSystemPrompt = `${systemPrompt}

## Conversation Context
You are in an ongoing conversation with the user. **CRITICAL**: Always maintain context from previous messages in the conversation. Reference previous topics, questions, and actions when relevant. 

When the user says things like:
- "yes", "no", "try again", "do it" - refer back to the most recent action or question
- "it", "that", "this" - use conversation history to understand what they're referring to
- Short responses - always check the conversation history to understand the full context

Never reset or forget the conversation context. Each message builds on the previous ones.`;

  return new Agent({
    model: openai("gpt-4o"),
    temperature: 0,
    system: fullSystemPrompt,
    tools: {
      list_directory: tool({
        description: "List contents of a directory",
        inputSchema: z.object({
          path: z.string().describe("Directory path to list"),
        }),
        execute: async ({ path }: { path: string }) => {
          try {
            return await listDirectory(path);
          } catch (error) {
            console.error(`[Tool: list_directory] Error:`, error);
            throw error;
          }
        },
      }),
      read_file: tool({
        description: "Read content of a file",
        inputSchema: z.object({
          path: z.string().describe("File path to read"),
        }),
        execute: async ({ path }: { path: string }) => {
          try {
            return await readFileContent(path);
          } catch (error) {
            console.error(`[Tool: read_file] Error:`, error);
            throw error;
          }
        },
      }),
      execute_typescript: tool({
        description: "Execute TypeScript code in a secure sandbox",
        inputSchema: z.object({
          code: z.string().describe("TypeScript code to execute"),
        }),
        execute: async ({ code }: { code: string }) => {
          try {
            return await executeTypeScriptCode(code, kaySessionId);
          } catch (error) {
            console.error(`[Tool: execute_typescript] Error:`, error);
            throw error;
          }
        },
      }),
    },
    stopWhen: stepCountIs(20),
  });
}

export async function runAgent(
  promptOrMessages:
    | string
    | Array<{ role: "user" | "assistant"; content: string }>,
  kaySessionId: string
): Promise<{
  message: string;
  steps: number;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}> {
  const agent = createAgent(kaySessionId);

  try {
    const result = await agent.generate({
      ...(typeof promptOrMessages === "string"
        ? { prompt: promptOrMessages }
        : { messages: promptOrMessages }),
    });

    return {
      message: result.text,
      steps: result.steps?.length || 0,
      usage: {
        promptTokens: result.usage.inputTokens || 0,
        completionTokens: result.usage.outputTokens || 0,
        totalTokens: result.usage.totalTokens || 0,
      },
    };
  } catch (error) {
    console.error(`[Agent Service] Error:`, error);
    throw error;
  }
}
