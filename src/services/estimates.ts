import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { Estimate, EstimateLineItem, EstimateSummary } from "./apiTypes";

export interface EstimateService {
  submit(requestId: string, input: { items: EstimateLineItem[]; note?: string }): Promise<Estimate>;
  list(requestId: string): Promise<Estimate[]>;
  summary(requestId: string): Promise<EstimateSummary>;
  approve(id: string): Promise<Estimate>;
  reject(id: string, reason?: string): Promise<Estimate>;
}

const serverEstimates: EstimateService = {
  submit: (requestId, input) => apiRequest(`/service-requests/${requestId}/estimates`, { method: "POST", body: input }),
  list: async (requestId) => (await apiRequest<{ items: Estimate[] }>(`/service-requests/${requestId}/estimates`)).items,
  summary: (requestId) => apiRequest<EstimateSummary>(`/service-requests/${requestId}/estimate-summary`),
  approve: (id) => apiRequest<Estimate>(`/estimates/${id}/approve`, { method: "POST" }),
  reject: (id, reason) => apiRequest<Estimate>(`/estimates/${id}/reject`, { method: "POST", body: { reason } }),
};

const LOCAL_KEY = "mechnow-api:estimates";

function read(): Record<string, Estimate[]> {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "{}") as Record<string, Estimate[]>;
  } catch {
    return {};
  }
}

function write(value: Record<string, Estimate[]>) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(value));
}

const localEstimates: EstimateService = {
  submit: async (requestId, input) => {
    const store = read();
    const list = store[requestId] ?? [];
    const estimate: Estimate = {
      id: crypto.randomUUID(),
      requestId,
      providerId: "local-provider",
      revision: list.length + 1,
      status: "submitted",
      totalGhs: input.items.reduce((sum, item) => sum + item.unitPriceGhs * item.quantity, 0),
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
      decidedAt: null,
      items: input.items,
    };
    write({ ...store, [requestId]: [estimate, ...list] });
    return estimate;
  },
  list: async (requestId) => read()[requestId] ?? [],
  summary: async (requestId) => {
    const estimates = read()[requestId] ?? [];
    const approved = estimates.find((item) => item.status === "approved") ?? null;
    return {
      requestId,
      estimates,
      approvedEstimateId: approved?.id ?? null,
      approvedTotalGhs: approved?.totalGhs ?? 0,
      paidToDateGhs: 0,
      varianceGhs: 0,
    };
  },
  approve: async (id) => decide(id, "approved"),
  reject: async (id) => decide(id, "rejected"),
};

function decide(id: string, status: "approved" | "rejected") {
  const store = read();
  for (const requestId of Object.keys(store)) {
    const list = store[requestId];
    const index = list.findIndex((item) => item.id === id);
    if (index !== -1) {
      const updated = { ...list[index], status, decidedAt: new Date().toISOString() };
      store[requestId] = list.map((item, itemIndex) => (itemIndex === index ? updated : item));
      write(store);
      return updated;
    }
  }
  throw new Error("Estimate not found.");
}

export const estimateService: EstimateService = bridge(serverEstimates, localEstimates);
