export type ConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type Conversation = {
  id: string;
  userId: string;
  title?: string;
  messages: ConversationMessage[];
  createdAt: Date;
  updatedAt: Date;
};

class ConversationStore {
  private store: Map<string, Map<string, Conversation>> = new Map();

  createConversation(
    userId: string,
    conversationId: string,
    title?: string
  ): Conversation {
    if (!this.store.has(userId)) {
      this.store.set(userId, new Map());
    }

    const userConversations = this.store.get(userId)!;

    if (userConversations.has(conversationId)) {
      throw new Error(`Conversation ${conversationId} already exists`);
    }

    const conversation: Conversation = {
      id: conversationId,
      userId,
      title,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    userConversations.set(conversationId, conversation);
    return conversation;
  }

  getConversation(userId: string, conversationId: string): Conversation | null {
    const userConversations = this.store.get(userId);
    if (!userConversations) {
      return null;
    }
    return userConversations.get(conversationId) || null;
  }

  listConversations(userId: string): Conversation[] {
    const userConversations = this.store.get(userId);
    if (!userConversations) {
      return [];
    }
    return Array.from(userConversations.values()).sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
  }

  addMessage(
    userId: string,
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string
  ): void {
    const conversation = this.getConversation(userId, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    conversation.messages.push({ role, content });
    conversation.updatedAt = new Date();
  }

  deleteConversation(userId: string, conversationId: string): boolean {
    const userConversations = this.store.get(userId);
    if (!userConversations) {
      return false;
    }
    return userConversations.delete(conversationId);
  }

  updateTitle(userId: string, conversationId: string, title: string): void {
    const conversation = this.getConversation(userId, conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    conversation.title = title;
    conversation.updatedAt = new Date();
  }
}

export const conversationStore = new ConversationStore();
