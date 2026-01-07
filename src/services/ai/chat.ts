import OpenAI from "openai";
import { ENV } from "../../config/env.js";
import { MCPServerRegistry } from "../mcp/server-registry.js";
import { getAvailableTools, callMcpTool } from "./mcp-tools.js";
import { SYSTEM_PROMPT } from "./prompts.js";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  message?: string | undefined;
  messages?: ChatMessage[] | undefined;
}

interface ChatUser {
  id: string;
  token: string;
}

const openai = new OpenAI({
  apiKey: ENV.OPENAI_API_KEY,
});

function convertMcpSchemaToOpenAI(inputSchema: unknown): {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
} {
  if (!inputSchema || typeof inputSchema !== "object") {
    return { type: "object", properties: {} };
  }

  const schema = inputSchema as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return {
    type: schema.type || "object",
    properties: schema.properties || {},
    required: schema.required || [],
  };
}

export async function createChatResponse(
  registry: MCPServerRegistry,
  user: ChatUser,
  request: ChatRequest,
  interactive: boolean
) {
  if (!request.message && !request.messages) {
    throw new Error("message or messages is required");
  }

  const availableTools = await getAvailableTools(user.id, registry);

  const functions = [];

  for (const availableTool of availableTools) {
    const functionName = `${availableTool.server}_${availableTool.name}`;
    const parameters = convertMcpSchemaToOpenAI(availableTool.inputSchema);

    functions.push({
      type: "function" as const,
      function: {
        name: functionName,
        description: `Call ${availableTool.name} from ${
          availableTool.server
        } service. ${availableTool.description || ""}`,
        parameters,
      },
    });
  }

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(
      request.messages || [
        { role: "user" as const, content: request.message || "" },
      ]
    ).map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  if (interactive) {
    const streamOptions: {
      model: string;
      messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }>;
      stream: true;
      tools?: typeof functions;
    } = {
      model: "gpt-4o",
      messages,
      stream: true,
    };

    if (functions.length > 0) {
      streamOptions.tools = functions;
    }

    const stream = await openai.chat.completions.create(streamOptions);

    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            // Track tool call arguments as they're being streamed
            const toolCallBuffer: Record<string, { name: string; args: string }> = {};

            for await (const chunk of stream) {
              const delta = chunk.choices[0]?.delta;
              if (delta?.content) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ content: delta.content })}\n\n`
                  )
                );
              }

              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const index = toolCall.index;

                  // Initialize buffer for this tool call if it doesn't exist
                  if (!toolCallBuffer[index]) {
                    toolCallBuffer[index] = { name: "", args: "" };
                  }

                  // Accumulate the function name
                  if (toolCall.function?.name) {
                    toolCallBuffer[index].name = toolCall.function.name;
                  }

                  // Accumulate the arguments
                  if (toolCall.function?.arguments) {
                    toolCallBuffer[index].args += toolCall.function.arguments;
                  }
                }
              }

              // Check if the stream has finished (no more deltas)
              const finishReason = chunk.choices[0]?.finish_reason;
              if (finishReason === "tool_calls") {
                // Now process all accumulated tool calls
                for (const bufferedCall of Object.values(toolCallBuffer)) {
                  if (bufferedCall.name && bufferedCall.args) {
                    try {
                      const args = JSON.parse(bufferedCall.args);
                      const firstUnderscore = bufferedCall.name.indexOf("_");

                      if (firstUnderscore > 0) {
                        const serverName = bufferedCall.name.substring(0, firstUnderscore);
                        const mcpToolName = bufferedCall.name.substring(firstUnderscore + 1);

                        const result = await callMcpTool(
                          registry,
                          user.id,
                          user.token,
                          serverName,
                          mcpToolName,
                          args
                        );

                        controller.enqueue(
                          new TextEncoder().encode(
                            `data: ${JSON.stringify({
                              tool_result: { name: bufferedCall.name, result },
                            })}\n\n`
                          )
                        );
                      }
                    } catch (error) {
                      console.error(
                        `[Chat] Error calling tool ${bufferedCall.name} in stream:`,
                        error
                      );
                      const errorMessage =
                        error instanceof Error ? error.message : String(error);
                      controller.enqueue(
                        new TextEncoder().encode(
                          `data: ${JSON.stringify({
                            tool_result: {
                              name: bufferedCall.name,
                              error: errorMessage,
                            },
                          })}\n\n`
                        )
                      );
                    }
                  }
                }
              }
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      }
    );
  }

  // Allow multiple rounds of tool calling (max 5 iterations to prevent infinite loops)
  const MAX_ITERATIONS = 5;
  let currentMessages = messages;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[Chat] Tool calling iteration ${iteration}/${MAX_ITERATIONS}`);

    const completionOptions: {
      model: string;
      messages: typeof currentMessages;
      tools?: typeof functions;
    } = {
      model: "gpt-4o",
      messages: currentMessages,
    };

    if (functions.length > 0) {
      completionOptions.tools = functions;
    }

    const completion = await openai.chat.completions.create(completionOptions);
    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      console.log(`[Chat] No assistant message received`);
      break;
    }

    // If no tool calls, we're done
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      console.log(`[Chat] No tool calls in iteration ${iteration}, finishing`);
      return { response: assistantMessage.content || "" };
    }

    console.log(
      `[Chat] Processing ${assistantMessage.tool_calls.length} tool call(s) in iteration ${iteration}`
    );

    // Execute all tool calls
    const toolResults: Array<{
      role: "tool";
      tool_call_id: string;
      content: string;
    }> = [];

    for (const toolCall of assistantMessage.tool_calls) {
      if (toolCall.type === "function" && toolCall.function.name) {
        const firstUnderscore = toolCall.function.name.indexOf("_");
        if (firstUnderscore > 0) {
          const serverName = toolCall.function.name.substring(
            0,
            firstUnderscore
          );
          const mcpToolName = toolCall.function.name.substring(
            firstUnderscore + 1
          );
          const args = JSON.parse(toolCall.function.arguments || "{}");

          try {
            console.log(
              `[Chat] Calling tool ${toolCall.function.name} with args:`,
              Object.keys(args)
            );
            const result = await callMcpTool(
              registry,
              user.id,
              user.token,
              serverName,
              mcpToolName,
              args
            );

            // Truncate large results to prevent context overflow
            let resultContent = JSON.stringify(result);
            if (resultContent.length > 4000) {
              const truncated = resultContent.substring(0, 4000);
              resultContent = truncated + "... [truncated due to length]";
              console.log(
                `[Chat] Tool result truncated from ${JSON.stringify(result).length} to 4000 chars`
              );
            }

            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: resultContent,
            });
          } catch (error) {
            console.error(
              `[Chat] Error calling tool ${toolCall.function.name}:`,
              error
            );
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({
                error: errorMessage,
                tool: toolCall.function.name,
                server: serverName,
              }),
            });
          }
        }
      }
    }

    // Add assistant message and tool results to conversation
    currentMessages = [
      ...currentMessages,
      {
        role: assistantMessage.role,
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      } as any,
      ...toolResults as any,
    ];

    // Continue to next iteration to let AI process tool results
  }

  // If we hit max iterations, return whatever the last message was
  console.log(`[Chat] Reached max iterations (${MAX_ITERATIONS}), returning last response`);
  const lastCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: currentMessages,
  });

  return { response: lastCompletion.choices[0]?.message?.content || "I've completed the requested actions." };
}
