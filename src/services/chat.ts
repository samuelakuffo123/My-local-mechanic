import { apiRequest } from "./api";
import type { User } from "../state/types";

export interface ChatMessage { id: string; threadId: string; senderId: string; body: string; createdAt: string; state: "sent" | "delivered" | "read" }
export const chatService = {
  createThread: (bookingId: string) => apiRequest<{ id: string }>("/chat/threads", { method: "POST", body: { bookingId } }),
  list: (threadId: string) => apiRequest<ChatMessage[]>(`/chat/threads/${encodeURIComponent(threadId)}/messages`),
  send: (input: { threadId: string; body: string; senderId?: string }, _user: User | null) =>
    apiRequest<ChatMessage>(`/chat/threads/${encodeURIComponent(input.threadId)}/messages`, {
      method: "POST",
      body: { body: input.body },
    }),
};
