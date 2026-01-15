import OpenAI from "openai";
import { ENV } from "../../config/env.js";
import { MCPServerRegistry } from "../mcp/server-registry.js";
import { getAvailableTools, callMcpTool } from "./mcp-tools.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { gatherProactiveContext } from "./context.js";
import {
  getConversationMessages,
  saveMessage,
  createConversation,
} from "./conversation.js";

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
  email: string;
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
  interactive: boolean,
  conversationId?: string
) {
  let activeConversationId = conversationId;
  let conversationMessages: ChatMessage[] = [];
  let newUserMessage: string | null = null;

  if (conversationId) {
    conversationMessages = getConversationMessages(
      user.id,
      conversationId
    ) as ChatMessage[];
    if (conversationMessages.length === 0) {
      throw new Error("Conversation not found");
    }
    if (request.message) {
      newUserMessage = request.message;
    } else {
      throw new Error("message is required when using conversationId");
    }
  } else {
    if (!request.message && !request.messages) {
      throw new Error("message or messages is required");
    }
    if (request.message) {
      newUserMessage = request.message;
      const newConversation = createConversation(user.id);
      activeConversationId = newConversation.id;
    } else if (request.messages && request.messages.length > 0) {
      conversationMessages = request.messages.slice(0, -1);
      newUserMessage = request.messages[request.messages.length - 1].content;
      const newConversation = createConversation(user.id);
      activeConversationId = newConversation.id;
    }
  }

  if (newUserMessage && activeConversationId) {
    saveMessage(user.id, activeConversationId, "user", newUserMessage);
  }

  // First, get available tools (this establishes MCP connections)
  const availableTools = await getAvailableTools(user.id, registry);

  // Then gather proactive context from now-connected MCP servers
  const proactiveContext = await gatherProactiveContext(
    user.id,
    user.token,
    registry,
    user.email
  );

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

  // Build system prompt with user identity and dynamic context
  const userContext = `
Current System User:
- Email: ${user.email}
- User ID: ${user.id}
Note: This is the identity of the currently logged-in user in the Kay system. This is separate from MCP server credentials - each MCP server (Jira, Bitbucket, etc.) has its own way to identify users through their respective tools.`;

  let systemPromptWithContext = `${SYSTEM_PROMPT}\n${userContext}`;
  if (proactiveContext) {
    systemPromptWithContext += `\n${proactiveContext}`;
  }

  const messagesForAI: ChatMessage[] = [...conversationMessages];
  if (newUserMessage) {
    messagesForAI.push({ role: "user", content: newUserMessage });
  }

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPromptWithContext },
    ...messagesForAI.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  ];

  // Both interactive and non-interactive modes work the same way:
  // - Make API call to OpenAI
  // - If AI wants to call tools, execute them and feed results back
  // - Repeat until AI gives a final response (max 5 iterations)
  // The difference is just how the client manages conversation history

  const MAX_ITERATIONS = 5;
  let currentMessages = messages;
  let iteration = 0;

  // Check if kyg-kmesh tools are available or if conversation mentions k-mesh
  const hasKmeshTools = availableTools.some(
    (tool) => tool.server === "kyg-kmesh"
  );
  const mentionsKmesh = currentMessages.some(
    (msg) =>
      msg.content &&
      typeof msg.content === "string" &&
      msg.content.toLowerCase().includes("k-mesh")
  );

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    if (hasKmeshTools || mentionsKmesh) {
      console.log(
        `[Chat:kyg-kmesh] Iteration ${iteration}/${MAX_ITERATIONS}, interactive: ${interactive}`
      );
    }

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

    if (hasKmeshTools || mentionsKmesh) {
      console.log(
        `[Chat:kyg-kmesh] Calling OpenAI with ${currentMessages.length} messages, ${functions.length} tools`
      );
    }
    const completion = await openai.chat.completions.create(completionOptions);
    const assistantMessage = completion.choices[0]?.message;

    if (!assistantMessage) {
      if (hasKmeshTools || mentionsKmesh) {
        console.log(`[Chat:kyg-kmesh] No assistant message received`);
      }
      break;
    }

    if (hasKmeshTools || mentionsKmesh) {
      console.log(
        `[Chat:kyg-kmesh] Assistant response received - content length: ${
          assistantMessage.content?.length || 0
        }, tool_calls: ${assistantMessage.tool_calls?.length || 0}`
      );
    }

    // If no tool calls, we're done
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      const finalResponse = assistantMessage.content || "";
      if (hasKmeshTools || mentionsKmesh) {
        console.log(
          `[Chat:kyg-kmesh] Final response (first 100 chars): ${finalResponse.substring(
            0,
            100
          )}...`
        );
      }

      if (activeConversationId) {
        saveMessage(user.id, activeConversationId, "assistant", finalResponse);
      }

      // Build result - include messages array for interactive mode
      const result: {
        response: string;
        conversationId: string | undefined;
        messages?: ChatMessage[];
      } = { response: finalResponse, conversationId: activeConversationId };

      if (interactive) {
        // Return conversation history so client can send it back on next request
        const updatedMessages: ChatMessage[] = [
          ...messagesForAI,
          { role: "assistant" as const, content: finalResponse },
        ];
        result.messages = updatedMessages;
      }

      if (hasKmeshTools || mentionsKmesh) {
        console.log(
          `[Chat:kyg-kmesh] Returning to client:`,
          JSON.stringify(result).substring(0, 500)
        );
      }
      return result;
    }

    if (hasKmeshTools || mentionsKmesh) {
      console.log(
        `[Chat:kyg-kmesh] Processing ${assistantMessage.tool_calls.length} tool call(s)`
      );
    }

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

          if (serverName === "kyg-kmesh") {
            console.log(
              `[Chat:kyg-kmesh] Executing tool: ${serverName}.${mcpToolName} with args:`,
              JSON.stringify(args, null, 2)
            );
          }

          try {
            const result = await callMcpTool(
              registry,
              user.id,
              user.token,
              serverName,
              mcpToolName,
              args
            );

            // Log tool responses in interactive mode
            if (interactive) {
              console.log(
                `[Chat:interactive] Tool ${serverName}.${mcpToolName} response:`,
                JSON.stringify(result, null, 2).substring(0, 1000)
              );
            }

            if (serverName === "kyg-kmesh") {
              console.log(
                `[Chat:kyg-kmesh] Tool ${serverName}.${mcpToolName} succeeded. Result type:`,
                typeof result
              );
            }

            // Truncate large results to prevent context overflow
            let resultContent = JSON.stringify(result);
            if (serverName === "kyg-kmesh") {
              console.log(
                `[Chat:kyg-kmesh] Tool result length: ${resultContent.length} chars`
              );
            }
            if (resultContent.length > 4000) {
              const truncated = resultContent.substring(0, 4000);
              resultContent = truncated + "... [truncated due to length]";
              if (serverName === "kyg-kmesh") {
                console.log(
                  `[Chat:kyg-kmesh] Tool result truncated from ${resultContent.length} to 4000 chars`
                );
              }
            }

            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: resultContent,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            // Log tool errors in interactive mode
            if (interactive) {
              console.error(
                `[Chat:interactive] Tool ${serverName}.${mcpToolName} error:`,
                errorMessage
              );
            }

            if (serverName === "kyg-kmesh") {
              console.error(
                `[Chat:kyg-kmesh] Tool ${serverName}.${mcpToolName} failed:`,
                errorMessage
              );
              if (error instanceof Error && error.stack) {
                console.error(
                  `[Chat:kyg-kmesh] Tool error stack:`,
                  error.stack
                );
              }
            }
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
      ...(toolResults as any),
    ];

    // Continue to next iteration to let AI process tool results
  }

  // If we hit max iterations, return whatever the last message was
  const lastCompletion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: currentMessages,
  });

  const finalResponse =
    lastCompletion.choices[0]?.message?.content ||
    "I've completed the requested actions.";

  if (activeConversationId) {
    saveMessage(user.id, activeConversationId, "assistant", finalResponse);
  }

  const result: {
    response: string;
    conversationId: string | undefined;
    messages?: ChatMessage[];
  } = { response: finalResponse, conversationId: activeConversationId };

  if (interactive) {
    const updatedMessages: ChatMessage[] = [
      ...messagesForAI,
      { role: "assistant" as const, content: finalResponse },
    ];
    result.messages = updatedMessages;
  }

  return result;
}
