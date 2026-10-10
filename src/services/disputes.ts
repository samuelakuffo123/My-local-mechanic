import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { Dispute } from "./apiTypes";

export interface DisputeService {
  create(requestId: string, input: { category: string; description: string }): Promise<Dispute>;
  list(status?: string): Promise<Dispute[]>;
  resolve(id: string, input: { status: "resolved" | "rejected" | "investigating"; resolution?: string }): Promise<Dispute>;
}

const serverDisputes: DisputeService = {
  create: (requestId, input) => apiRequest(`/service-requests/${requestId}/disputes`, { method: "POST", body: input }),
  list: async (status) => (await apiRequest<{ items: Dispute[] }>(status ? `/disputes?status=${encodeURIComponent(status)}` : "/disputes")).items,
  resolve: (id, input) => apiRequest<Dispute>(`/disputes/${id}/resolve`, { method: "POST", body: input }),
};

const LOCAL_KEY = "mechnow-api:disputes";

function read(): Dispute[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as Dispute[];
  } catch {
    return [];
  }
}

const localDisputes: DisputeService = {
  create: async (requestId, input) => {
    const dispute: Dispute = {
      id: crypto.randomUUID(),
      requestId,
      raisedBy: "local-user",
      category: input.category,
      description: input.description,
      status: "open",
      resolution: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify([dispute, ...read()]));
    return dispute;
  },
  list: async (status) => (status ? read().filter((item) => item.status === status) : read()),
  resolve: async (id, input) => {
    const items = read();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Dispute not found.");
    const updated: Dispute = { ...items[index], status: input.status, resolution: input.resolution ?? null, resolvedAt: new Date().toISOString() };
    items[index] = updated;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
    return updated;
  },
};

export const disputeService: DisputeService = bridge(serverDisputes, localDisputes);
