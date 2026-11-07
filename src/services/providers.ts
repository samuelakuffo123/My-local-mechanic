import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { ProviderProfile, RequestKind } from "./apiTypes";

export interface ProviderCredential {
  id: string;
  providerId: string;
  documentType: string;
  documentRef: string;
  expiresAt: string | null;
  status: string;
  verifiedAt: string | null;
  createdAt: string;
}

export interface ProviderApplyInput {
  businessName: string;
  type: "mechanic" | "tow" | "vendor";
  region?: string;
  serviceAreas?: string[];
}

export interface ProviderService {
  list(kind?: RequestKind, region?: string): Promise<ProviderProfile[]>;
  get(id: string): Promise<ProviderProfile | null>;
  me(): Promise<{ provider: ProviderProfile | null; credentials: ProviderCredential[] }>;
  apply(input: ProviderApplyInput): Promise<ProviderProfile>;
  setAvailability(available: boolean): Promise<ProviderProfile>;
  addCredential(input: { documentType: string; documentRef: string; expiresAt?: string }): Promise<{ id: string }>;
  adminList(status: string): Promise<ProviderProfile[]>;
  verify(id: string, decision: "verify" | "reject" | "suspend", note?: string): Promise<ProviderProfile>;
  expiringCredentials(days?: number): Promise<unknown[]>;
}

const serverProviders: ProviderService = {
  list: async (kind = "emergency", region) => {
    const params = new URLSearchParams({ kind });
    if (region) params.set("region", region);
    return (await apiRequest<{ items: ProviderProfile[] }>(`/providers?${params.toString()}`)).items;
  },
  get: async (id) => (await apiRequest<{ provider: ProviderProfile | null }>(`/providers/${id}`)).provider,
  me: () => apiRequest<{ provider: ProviderProfile | null; credentials: ProviderCredential[] }>("/providers/me"),
  apply: (input) => apiRequest<ProviderProfile>("/providers/apply", { method: "POST", body: input }),
  setAvailability: (available) => apiRequest<ProviderProfile>("/providers/me/availability", { method: "POST", body: { available } }),
  addCredential: (input) => apiRequest<{ id: string }>("/providers/me/credentials", { method: "POST", body: input }),
  adminList: async (status) => (await apiRequest<{ items: ProviderProfile[] }>(`/admin/providers?status=${encodeURIComponent(status)}`)).items,
  verify: (id, decision, note) => apiRequest<ProviderProfile>(`/admin/providers/${id}/verify`, { method: "POST", body: { decision, note } }),
  expiringCredentials: async (days = 30) => (await apiRequest<{ items: unknown[] }>(`/admin/credentials/expiring?days=${days}`)).items,
};

const LOCAL_KEY = "mechnow-api:provider-profile";

function readLocal(): ProviderProfile | null {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "null") as ProviderProfile | null;
  } catch {
    return null;
  }
}

const localProviders: ProviderService = {
  list: async () => {
    const provider = readLocal();
    return provider && provider.status === "verified" && provider.available ? [provider] : [];
  },
  get: async () => readLocal(),
  me: async () => ({ provider: readLocal(), credentials: [] }),
  apply: async (input) => {
    const provider: ProviderProfile = {
      id: readLocal()?.id ?? crypto.randomUUID(),
      userId: "local-user",
      type: input.type,
      businessName: input.businessName,
      region: input.region ?? null,
      serviceAreas: input.serviceAreas ?? [],
      specialisations: [],
      status: readLocal()?.status ?? "pending",
      available: readLocal()?.available ?? false,
      rating: 0,
      reliability: 0,
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(provider));
    return provider;
  },
  setAvailability: async (available) => {
    const provider = readLocal();
    if (!provider) throw new Error("Apply as a provider first.");
    const next = { ...provider, available };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return next;
  },
  addCredential: async () => ({ id: crypto.randomUUID() }),
  adminList: async () => (readLocal() ? [readLocal() as ProviderProfile] : []),
  verify: async (_id, decision) => {
    const provider = readLocal();
    if (!provider) throw new Error("No provider profile.");
    const status = decision === "verify" ? "verified" : decision === "reject" ? "rejected" : "suspended";
    const next = { ...provider, status } as ProviderProfile;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return next;
  },
  expiringCredentials: async () => [],
};

export const providerService: ProviderService = bridge(serverProviders, localProviders);
