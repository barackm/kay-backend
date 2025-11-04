import { prisma } from "../../db/client.js";
import type { AskServiceContext } from "./ask-service.js";

const CONFIRMATION_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// Store chat message
export async function addChatMessage(
  kaySessionId: string,
  role: "user" | "assistant" | "system",
  content: string
): Promise<void> {
  await prisma.chat.create({
    data: {
      kaySessionId,
      role,
      content,
    },
  });
}

// Get chat history for a kay session
export async function getChatHistory(
  kaySessionId: string,
  limit: number = 50
): Promise<ChatMessage[]> {
  const chats = await prisma.chat.findMany({
    where: { kaySessionId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  return chats.map((chat) => ({
    role: chat.role as "user" | "assistant" | "system",
    content: chat.content,
  }));
}

// Store pending confirmation as a system message
export async function storePendingConfirmation(
  token: string,
  kaySessionId: string,
  context: AskServiceContext
): Promise<void> {
  await prisma.chat.create({
    data: {
      kaySessionId,
      role: "system",
      content: JSON.stringify({
        type: "pending_confirmation",
        token,
        context,
        expiresAt: Date.now() + CONFIRMATION_EXPIRY_MS,
      }),
    },
  });
}

export async function getPendingConfirmation(
  token: string,
  kaySessionId: string
): Promise<{ token: string; context: AskServiceContext; expiresAt: number } | undefined> {
  const chats = await prisma.chat.findMany({
    where: {
      kaySessionId,
      role: "system",
      content: {
        contains: token,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (chats.length === 0) return undefined;

  try {
    const data = JSON.parse(chats[0].content);
    if (data.type === "pending_confirmation" && data.token === token) {
      if (Date.now() > data.expiresAt) {
        await deletePendingConfirmation(token, kaySessionId);
        return undefined;
      }
      return {
        token,
        context: data.context,
        expiresAt: data.expiresAt,
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

export async function deletePendingConfirmation(
  token: string,
  kaySessionId: string
): Promise<void> {
  await prisma.chat.deleteMany({
    where: {
      kaySessionId,
      role: "system",
      content: {
        contains: token,
      },
    },
  });
}

export async function cleanupExpiredConfirmations(): Promise<void> {
  // Cleanup happens in getPendingConfirmation
}

export async function deleteChatsByKaySession(kaySessionId: string): Promise<void> {
  await prisma.chat.deleteMany({
    where: { kaySessionId },
  });
}

// Clean up expired confirmations every 5 minutes
setInterval(() => {
  cleanupExpiredConfirmations().catch(console.error);
}, 5 * 60 * 1000);
