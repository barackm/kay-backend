import { randomUUID } from "crypto";
import { conversationStore } from "./conversation-store.js";
import type {
  Conversation,
  ConversationMessage,
} from "./conversation-store.js";

export function createConversation(
  userId: string,
  title?: string
): Conversation {
  const conversationId = randomUUID();
  return conversationStore.createConversation(userId, conversationId, title);
}

export function getConversation(
  userId: string,
  conversationId: string
): Conversation | null {
  return conversationStore.getConversation(userId, conversationId);
}

export function listConversations(userId: string): Conversation[] {
  return conversationStore.listConversations(userId);
}

export function saveMessage(
  userId: string,
  conversationId: string,
  role: "user" | "assistant" | "system",
  content: string
): void {
  conversationStore.addMessage(userId, conversationId, role, content);
}

export function deleteConversation(
  userId: string,
  conversationId: string
): boolean {
  return conversationStore.deleteConversation(userId, conversationId);
}

export function updateConversationTitle(
  userId: string,
  conversationId: string,
  title: string
): void {
  conversationStore.updateTitle(userId, conversationId, title);
}

export function getConversationMessages(
  userId: string,
  conversationId: string
): ConversationMessage[] {
  const conversation = getConversation(userId, conversationId);
  if (!conversation) {
    return [];
  }
  return conversation.messages;
}
