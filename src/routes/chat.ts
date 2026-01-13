import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MCPServerRegistry } from "../services/mcp/server-registry.js";
import { createChatResponse } from "../services/ai/chat.js";
import {
  createConversation,
  getConversation,
  listConversations,
  deleteConversation,
} from "../services/ai/conversation.js";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const ChatRequestSchema = z
  .object({
    message: z.string().optional().openapi({
      description: "Single message for one-shot request",
      example: "What tools are available in Jira?",
    }),
    messages: z.array(MessageSchema).optional().openapi({
      description: "Conversation history for interactive chat",
    }),
  })
  .openapi("ChatRequest");

const ChatResponseSchema = z
  .object({
    response: z.string(),
    conversationId: z.string().uuid().optional().openapi({
      description:
        "Conversation ID (returned when a new conversation is created or existing one is used)",
    }),
    messages: z.array(MessageSchema).optional().openapi({
      description:
        "Conversation history (returned when interactive=true). Send this back on next request to continue the conversation.",
    }),
  })
  .openapi("ChatResponse");

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const askRoute = createRoute({
  method: "post",
  path: "/ask",
  tags: ["Chat"],
  summary: "Ask Kay AI Assistant",
  description:
    "Chat with Kay AI assistant. Can interact with Jira, Bitbucket, Confluence, and k-mesh services. Use ?interactive=true for streaming conversation. Provide conversationId to continue an existing conversation.",
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      interactive: z.enum(["true", "false"]).optional().openapi({
        description:
          "If true, returns streaming response for interactive conversation",
        default: "false",
      }),
      conversationId: z.string().uuid().optional().openapi({
        description:
          "Optional conversation ID to continue an existing conversation",
      }),
    }),
    body: {
      content: {
        "application/json": {
          schema: ChatRequestSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: "AI response",
      content: {
        "application/json": {
          schema: ChatResponseSchema,
        },
        "text/event-stream": {
          schema: z.string().openapi({
            description: "Streaming response when interactive=true",
          }),
        },
      },
    },
    400: {
      description: "Bad request",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
    },
  },
});

export function createChatRouter(registry: MCPServerRegistry) {
  const router = new OpenAPIHono();

  router.openapi(askRoute, async (c) => {
    try {
      const user = c.get("user");
      const interactive = c.req.query("interactive") === "true";
      const conversationId = c.req.query("conversationId");

      const body = c.req.valid("json");
      const request = ChatRequestSchema.parse(body);

      const result = await createChatResponse(
        registry,
        { id: user.id, email: user.email, token: user.token },
        request,
        interactive,
        conversationId
      );

      if (typeof result === "object" && "response" in result) {
        const responseBody: {
          response: string;
          conversationId?: string;
          messages?: Array<{ role: "user" | "assistant"; content: string }>;
        } = {
          response: result.response as string,
        };
        if (result.conversationId) {
          responseBody.conversationId = result.conversationId as string;
        }
        if (result.messages) {
          responseBody.messages = result.messages as Array<{
            role: "user" | "assistant";
            content: string;
          }>;
        }
        return c.json(responseBody, 200);
      }

      return c.json({ error: "Unexpected response type" }, 500);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        error instanceof Error &&
          error.message === "message or messages is required"
          ? 400
          : 500
      );
    }
  });

  const createConversationRoute = createRoute({
    method: "post",
    path: "/conversations",
    tags: ["Chat"],
    summary: "Create a new conversation",
    description: "Create a new conversation thread",
    security: [{ bearerAuth: [] }],
    request: {
      body: {
        content: {
          "application/json": {
            schema: z
              .object({
                title: z.string().optional().openapi({
                  description: "Optional conversation title",
                }),
              })
              .openapi("CreateConversationRequest"),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Conversation created",
        content: {
          "application/json": {
            schema: z
              .object({
                id: z.string().uuid(),
                title: z.string().nullable(),
                createdAt: z.string().datetime(),
              })
              .openapi("ConversationResponse"),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  });

  router.openapi(createConversationRoute, async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      const conversation = createConversation(user.id, body.title);

      return c.json({
        id: conversation.id,
        title: conversation.title || null,
        createdAt: conversation.createdAt.toISOString(),
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  const listConversationsRoute = createRoute({
    method: "get",
    path: "/conversations",
    tags: ["Chat"],
    summary: "List user's conversations",
    description: "Get all conversations for the authenticated user",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "List of conversations",
        content: {
          "application/json": {
            schema: z
              .array(
                z
                  .object({
                    id: z.string().uuid(),
                    title: z.string().nullable(),
                    updatedAt: z.string().datetime(),
                    messageCount: z.number(),
                  })
                  .openapi("ConversationListItem")
              )
              .openapi("ConversationListResponse"),
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  });

  router.openapi(listConversationsRoute, async (c) => {
    try {
      const user = c.get("user");
      const conversations = listConversations(user.id);

      return c.json(
        conversations.map((conv) => ({
          id: conv.id,
          title: conv.title || null,
          updatedAt: conv.updatedAt.toISOString(),
          messageCount: conv.messages.length,
        }))
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  const getConversationRoute = createRoute({
    method: "get",
    path: "/conversations/{id}",
    tags: ["Chat"],
    summary: "Get conversation with messages",
    description: "Get a specific conversation with all its messages",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({
          description: "Conversation ID",
        }),
      }),
    },
    responses: {
      200: {
        description: "Conversation with messages",
        content: {
          "application/json": {
            schema: z
              .object({
                id: z.string().uuid(),
                title: z.string().nullable(),
                messages: z.array(
                  z
                    .object({
                      role: z.enum(["user", "assistant", "system"]),
                      content: z.string(),
                    })
                    .openapi("Message")
                ),
                createdAt: z.string().datetime(),
                updatedAt: z.string().datetime(),
              })
              .openapi("ConversationWithMessages"),
          },
        },
      },
      404: {
        description: "Conversation not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  });

  router.openapi(getConversationRoute, async (c) => {
    try {
      const user = c.get("user");
      const { id } = c.req.valid("param");
      const conversation = getConversation(user.id, id);

      if (!conversation) {
        return c.json({ error: "Conversation not found" }, 404);
      }

      return c.json({
        id: conversation.id,
        title: conversation.title || null,
        messages: conversation.messages,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  const deleteConversationRoute = createRoute({
    method: "delete",
    path: "/conversations/{id}",
    tags: ["Chat"],
    summary: "Delete a conversation",
    description: "Delete a conversation and all its messages",
    security: [{ bearerAuth: [] }],
    request: {
      params: z.object({
        id: z.string().uuid().openapi({
          description: "Conversation ID",
        }),
      }),
    },
    responses: {
      200: {
        description: "Conversation deleted",
        content: {
          "application/json": {
            schema: z
              .object({
                success: z.boolean(),
              })
              .openapi("DeleteConversationResponse"),
          },
        },
      },
      404: {
        description: "Conversation not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      500: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  });

  router.openapi(deleteConversationRoute, async (c) => {
    try {
      const user = c.get("user");
      const { id } = c.req.valid("param");
      const deleted = deleteConversation(user.id, id);

      if (!deleted) {
        return c.json({ error: "Conversation not found" }, 404);
      }

      return c.json({ success: true });
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Unknown error" },
        500
      );
    }
  });

  return router;
}
