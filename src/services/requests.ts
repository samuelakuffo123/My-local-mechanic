import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { RequestEvent, RequestKind, RequestStatus, ServiceRequest } from "./apiTypes";

export interface CreateRequestInput {
  vehicleId: string;
  kind: RequestKind;
  problem: string;
  location?: { label?: string; lat?: number; lng?: number };
  region?: string;
  providerId?: string;
}

export interface RequestService {
  create(input: CreateRequestInput): Promise<{ request: ServiceRequest; eligibleProviderIds: string[] }>;
  list(): Promise<ServiceRequest[]>;
  get(id: string): Promise<ServiceRequest>;
  assign(id: string, providerId: string): Promise<ServiceRequest>;
  accept(id: string): Promise<ServiceRequest>;
  decline(id: string, reason?: string): Promise<ServiceRequest>;
  transition(id: string, to: RequestStatus, note?: string): Promise<ServiceRequest>;
  cancel(id: string, reason: string): Promise<ServiceRequest>;
  events(id: string): Promise<RequestEvent[]>;
  actions(id: string): Promise<RequestStatus[]>;
}

const serverRequests: RequestService = {
  create: (input) => apiRequest("/service-requests", { method: "POST", body: input }),
  list: async () => (await apiRequest<{ items: ServiceRequest[] }>("/service-requests")).items,
  get: (id) => apiRequest<ServiceRequest>(`/service-requests/${id}`),
  assign: (id, providerId) => apiRequest<ServiceRequest>(`/service-requests/${id}/assign`, { method: "POST", body: { providerId } }),
  accept: (id) => apiRequest<ServiceRequest>(`/service-requests/${id}/accept`, { method: "POST" }),
  decline: (id, reason) => apiRequest<ServiceRequest>(`/service-requests/${id}/decline`, { method: "POST", body: { reason } }),
  transition: (id, to, note) => apiRequest<ServiceRequest>(`/service-requests/${id}/transition`, { method: "POST", body: { to, note } }),
  cancel: (id, reason) => apiRequest<ServiceRequest>(`/service-requests/${id}/cancel`, { method: "POST", body: { reason } }),
  events: async (id) => (await apiRequest<{ items: RequestEvent[] }>(`/service-requests/${id}/events`)).items,
  actions: async (id) => (await apiRequest<{ actions: RequestStatus[] }>(`/service-requests/${id}/actions`)).actions,
};

const LOCAL_KEY = "mechnow-api:requests";

function read(): ServiceRequest[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as ServiceRequest[];
  } catch {
    return [];
  }
}

function write(items: ServiceRequest[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function reference() {
  return `MN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const localRequests: RequestService = {
  create: async (input) => {
    const now = new Date().toISOString();
    const request: ServiceRequest = {
      id: crypto.randomUUID(),
      ref: reference(),
      customerId: "local-user",
      vehicleId: input.vehicleId,
      providerId: input.providerId ?? null,
      kind: input.kind,
      problem: input.problem,
      location: { label: input.location?.label ?? null, lat: input.location?.lat ?? null, lng: input.location?.lng ?? null },
      region: input.region ?? null,
      status: "requested",
      version: 0,
      declineCount: 0,
      cancellationReason: null,
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
      completedAt: null,
      cancelledAt: null,
    };
    write([...read(), request]);
    return { request, eligibleProviderIds: [] };
  },
  list: async () => read(),
  get: async (id) => {
    const found = read().find((item) => item.id === id);
    if (!found) throw new Error("Request not found.");
    return found;
  },
  assign: async (id, providerId) => patch(id, { providerId }),
  accept: async (id) => patch(id, { status: "accepted" }),
  decline: async (id) => patch(id, { providerId: null }),
  transition: async (id, to) => patch(id, { status: to }),
  cancel: async (id, reason) => patch(id, { status: "cancelled", cancellationReason: reason }),
  events: async () => [],
  actions: async () => [],
};

function patch(id: string, changes: Partial<ServiceRequest>) {
  const items = read();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Request not found.");
  const updated = { ...items[index], ...changes, updatedAt: new Date().toISOString() };
  items[index] = updated;
  write(items);
  return updated;
}

export const requestService: RequestService = bridge(serverRequests, localRequests);
