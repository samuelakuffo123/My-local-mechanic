import { mockRequest, readPersisted, writePersisted } from "./mockApi";
import type { User } from "../state/types";
import { requireRole } from "./authorization";
export interface ChatMessage { id: string; threadId: string; senderId: string; body: string; createdAt: string; state: "sent" | "delivered" | "read" }
export const chatService = {
  list: (threadId: string) => mockRequest(() => readPersisted<ChatMessage[]>("messages", []).filter((item) => item.threadId === threadId)),
  send: (input: Omit<ChatMessage, "id" | "createdAt" | "state">, user: User | null) => mockRequest(() => {
    requireRole(user, ["driver", "mechanic", "tow", "vendor", "admin"]);
    const messages = readPersisted<ChatMessage[]>("messages", []);
    const message: ChatMessage = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString(), state: "sent" };
    writePersisted("messages", [...messages, message]);
    return message;
  }),
};
