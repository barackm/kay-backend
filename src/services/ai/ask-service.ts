import type { AskRequest, AskResponse } from "../../types/ask.js";
import type { StoredToken } from "../../types/oauth.js";
import {
  createChatCompletion,
  isOpenAIConfigured,
  type ChatMessage,
} from "./openai-service.js";
import { getSystemPrompt, getInteractivePrompt } from "./prompt-service.js";
import { MCPJiraService } from "../mcp/mcp-jira-service.js";
import { convertMCPToolsToOpenAI } from "../../utils/mcp-tools.js";
import { ENV } from "../../config/env.js";
import { refreshAccessTokenIfNeeded } from "../auth/token-service.js";
import {
  getKayConnectionStatusTool,
  executeKayConnectionStatus,
} from "./kay-tools.js";
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
  jiraProjects?: Array<{ key: string; name: string }>;
  confluenceSpaces?: Array<{ key: string; name: string }>;
  sessionToken?: string;
}

export class AskService {
  private jiraService: MCPJiraService | null = null;

  private async fetchUserProjects(
    context: AskServiceContext
  ): Promise<Array<{ key: string; name: string }>> {
    const jiraResource = context.atlassianTokens.resources.find((r) =>
      r.url.includes("atlassian.net")
    );

    if (!jiraResource) {
      return [];
    }

    let accessToken: string;
    try {
      accessToken = await refreshAccessTokenIfNeeded(context.atlassianTokens);
    } catch (error) {
      return [];
    }

    try {
      const response = await fetch(
        `${jiraResource.url}/rest/api/3/project/search?maxResults=100`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        return [];
      }

      const data = await response.json();

      if (!data.values || !Array.isArray(data.values)) {
        return [];
      }

      const projects = data.values.map(
        (project: { key: string; name: string }) => ({
          key: project.key,
          name: project.name,
        })
      );
      return projects;
    } catch (error) {
      return [];
    }
  }

  private async getJiraService(
    context: AskServiceContext
  ): Promise<MCPJiraService | null> {
    if (!ENV.MCP_JIRA_ENABLED) {
      return null;
    }

    if (this.jiraService) {
      await this.jiraService.disconnect();
    }

    try {
      this.jiraService = new MCPJiraService();
      await this.jiraService.initialize(context.atlassianTokens);
    } catch (error) {
      return null;
    }

    return this.jiraService;
  }

  async processRequest(context: AskServiceContext): Promise<AskResponse> {
    const { request } = context;

    if (request.interactive && request.session_id) {
      return this.handleInteractiveTurn(context);
    }

    if (request.interactive) {
      return this.startInteractiveSession(context);
    }

    if (request.confirm) {
      return this.handleConfirmationRequest(context);
    }

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

      const projects = context.jiraProjects || [];
      const confluenceSpaces = context.confluenceSpaces || [];

      const userInfo = {
        name: context.atlassianTokens.user.name,
        email: context.atlassianTokens.user.email,
        accountId: context.accountId,
        projects,
        confluenceSpaces,
      };

      const jiraService = await this.getJiraService(context);
      const mcpTools = jiraService ? await jiraService.getTools() : [];
      const kayTool = getKayConnectionStatusTool();
      const allTools = [...mcpTools, kayTool];
      const tools =
        allTools.length > 0 ? convertMCPToolsToOpenAI(allTools) : undefined;

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: getSystemPrompt(
            userInfo,
            mcpTools.map((t) => {
              const tool: { name: string; description?: string } = {
                name: t.name,
              };
              if (t.description) {
                tool.description = t.description;
              }
              return tool;
            })
          ),
        },
        {
          role: "user",
          content: context.request.prompt,
        },
      ];

      const result = await this.processWithTools(
        messages,
        tools,
        jiraService,
        false
      );

      return {
        status: "completed",
        message: result.message,
        data: {
          prompt: context.request.prompt,
          response: result.message,
          toolCalls: result.toolCalls,
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
    const confirmationToken = this.generateConfirmationToken();

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

    dbStoreInteractiveSession(sessionId, context.accountId, context, []);

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

    const session = dbGetInteractiveSession(context.request.session_id);
    if (!session) {
      return {
        status: "error",
        message: "Invalid or expired session_id",
      };
    }

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
  ): Promise<{ message: string; data?: unknown; toolCalls?: unknown }> {
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

      const projects = context.jiraProjects || [];
      const confluenceSpaces = context.confluenceSpaces || [];

      const userInfo = {
        name: context.atlassianTokens.user.name,
        email: context.atlassianTokens.user.email,
        accountId: context.accountId,
        projects,
        confluenceSpaces,
      };

      const jiraService = await this.getJiraService(context);
      const mcpTools = jiraService ? await jiraService.getTools() : [];
      const kayTool = getKayConnectionStatusTool();
      const allTools = [...mcpTools, kayTool];
      const tools =
        allTools.length > 0 ? convertMCPToolsToOpenAI(allTools) : undefined;

      const messages: ChatMessage[] = [
        {
          role: "system",
          content: getInteractivePrompt(
            userInfo,
            mcpTools.map((t) => {
              const tool: { name: string; description?: string } = {
                name: t.name,
              };
              if (t.description) {
                tool.description = t.description;
              }
              return tool;
            })
          ),
        },
        ...history.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
        {
          role: "user",
          content: context.request.prompt,
        },
      ];

      const result = await this.processWithTools(
        messages,
        tools,
        jiraService,
        true,
        5,
        context.sessionToken
      );

      const updatedHistory = [
        ...history,
        { role: "user", content: context.request.prompt },
        { role: "assistant", content: result.message },
      ];
      updateInteractiveSessionHistory(sessionId, updatedHistory);

      return {
        message: result.message,
        data: {
          prompt: context.request.prompt,
        },
        toolCalls: result.toolCalls,
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

  private async processWithTools(
    messages: ChatMessage[],
    tools:
      | Array<{
          type: "function";
          function: {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
          };
        }>
      | undefined,
    jiraService: MCPJiraService | null,
    isInteractive: boolean,
    maxIterations = 5,
    sessionToken?: string
  ): Promise<{ message: string; toolCalls: unknown[] }> {
    let currentMessages = [...messages];
    let iteration = 0;
    const allToolCalls: Array<{
      name: string;
      arguments: Record<string, unknown>;
      result: unknown;
    }> = [];

    while (iteration < maxIterations) {
      const completionOptions: {
        messages: ChatMessage[];
        tools?: Array<{
          type: "function";
          function: {
            name: string;
            description?: string;
            parameters?: Record<string, unknown>;
          };
        }>;
      } = {
        messages: currentMessages,
      };

      if (tools) {
        completionOptions.tools = tools;
        console.log(
          `[DEBUG] Passing ${tools.length} tools to OpenAI:`,
          tools.map((t) => t.function.name)
        );
      } else {
        console.log(`[DEBUG] No tools available to pass to OpenAI`);
      }

      const result = await createChatCompletion(completionOptions);

      if (result.toolCalls.length > 0) {
        console.log(
          `[DEBUG] OpenAI requested ${result.toolCalls.length} tool calls:`,
          result.toolCalls.map((tc) => tc.name)
        );
      }

      if (result.content && result.finishReason !== "tool_calls") {
        return {
          message: result.content,
          toolCalls: allToolCalls.length > 0 ? allToolCalls : [],
        };
      }

      if (result.toolCalls.length > 0) {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.content || "",
          tool_calls: result.toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })),
        };
        currentMessages.push(assistantMessage);

        for (const toolCall of result.toolCalls) {
          try {
            let toolResult;

            if (toolCall.name === "kay_connections_status") {
              if (!sessionToken) {
                throw new Error(
                  "Session token required for kay_connections_status tool"
                );
              }
              const statusResult = await executeKayConnectionStatus(
                sessionToken,
                toolCall.arguments
              );
              toolResult = {
                content: [{ type: "text", text: JSON.stringify(statusResult) }],
                isError: false,
              };
            } else if (jiraService) {
              toolResult = await jiraService.callTool(
                toolCall.name,
                toolCall.arguments
              );
            } else {
              throw new Error(`Tool ${toolCall.name} not available`);
            }
            const resultContent = toolResult.content
              .map((item) => {
                if (item.text) return item.text;
                if (item.data) return JSON.stringify(item.data);
                return "";
              })
              .join("\n");

            allToolCalls.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: toolResult.isError
                ? { error: resultContent }
                : resultContent,
            });

            currentMessages.push({
              role: "tool",
              content: toolResult.isError
                ? `Error: ${resultContent}`
                : resultContent,
              tool_call_id: toolCall.id,
            });
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error";
            allToolCalls.push({
              name: toolCall.name,
              arguments: toolCall.arguments,
              result: { error: errorMessage },
            });

            currentMessages.push({
              role: "tool",
              content: `Error executing ${toolCall.name}: ${errorMessage}`,
              tool_call_id: toolCall.id,
            });
          }
        }

        iteration++;
        continue;
      }

      return {
        message:
          "I'm having trouble processing your request. Could you please rephrase it?",
        toolCalls: allToolCalls,
      };
    }

    return {
      message:
        "I've reached the maximum number of tool calls. Here's what I was able to accomplish so far.",
      toolCalls: allToolCalls,
    };
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

    const pending = getPendingConfirmation(context.request.confirmation_token);

    if (!pending) {
      return {
        status: "error",
        message: "Invalid or expired confirmation token",
      };
    }

    if (pending.account_id !== context.accountId) {
      return {
        status: "error",
        message: "Confirmation token does not belong to this account",
      };
    }

    const pendingAction = pending.context;

    if (!context.approved) {
      deletePendingConfirmation(context.request.confirmation_token);

      return {
        status: "completed",
        message: "Action cancelled by user",
      };
    }

    const result = await this.executeAction(pendingAction);

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
    const jiraService = await this.getJiraService(context);

    if (!jiraService) {
      return {
        executed: false,
        error: "MCP Jira service not available",
        timestamp: Date.now(),
        prompt: context.request.prompt,
      };
    }

    const userInfo = {
      name: context.atlassianTokens.user.name,
      email: context.atlassianTokens.user.email,
      accountId: context.accountId,
    };

    const mcpTools = await jiraService.getTools();
    const tools = convertMCPToolsToOpenAI(mcpTools);

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: getSystemPrompt(
          userInfo,
          mcpTools.map((t) => {
            const tool: { name: string; description?: string } = {
              name: t.name,
            };
            if (t.description) {
              tool.description = t.description;
            }
            return tool;
          })
        ),
      },
      {
        role: "user",
        content: `Execute this action: ${context.request.prompt}`,
      },
    ];

    try {
      const result = await this.processWithTools(
        messages,
        tools,
        jiraService,
        false,
        10
      );

      return {
        executed: true,
        timestamp: Date.now(),
        prompt: context.request.prompt,
        result: result.message,
        toolCalls: result.toolCalls,
      };
    } catch (error) {
      return {
        executed: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: Date.now(),
        prompt: context.request.prompt,
      };
    }
  }

  private generateConfirmationToken(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}
