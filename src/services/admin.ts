import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { PlatformMetrics, Role, ServiceRequest, User } from "./apiTypes";

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface DispatchRow {
  ref: string;
  kind: string;
  status: string;
  region: string | null;
  declineCount: number;
  createdAt: string;
  providerName: string | null;
}

export interface AdminService {
  metrics(): Promise<PlatformMetrics>;
  dispatch(): Promise<DispatchRow[]>;
  audit(limit?: number): Promise<AuditLogEntry[]>;
  users(role?: Role): Promise<User[]>;
  requests(status?: string): Promise<ServiceRequest[]>;
  suspendExpired(): Promise<{ suspended: number }>;
}

const serverAdmin: AdminService = {
  metrics: () => apiRequest<PlatformMetrics>("/admin/metrics"),
  dispatch: async () => (await apiRequest<{ items: DispatchRow[] }>("/admin/dispatch")).items,
  audit: async (limit = 100) => (await apiRequest<{ items: AuditLogEntry[] }>(`/admin/audit?limit=${limit}`)).items,
  users: async (role) => (await apiRequest<{ items: User[] }>(role ? `/admin/users?role=${encodeURIComponent(role)}` : "/admin/users")).items,
  requests: async (status) => (await apiRequest<{ items: ServiceRequest[] }>(status ? `/admin/requests?status=${encodeURIComponent(status)}` : "/admin/requests")).items,
  suspendExpired: () => apiRequest<{ suspended: number }>("/admin/credentials/suspend-expired", { method: "POST" }),
};

const emptyMetrics: PlatformMetrics = {
  users: 0,
  providers: { total: 0, verified: 0, pending: 0, available: 0 },
  requests: { total: 0, open: 0, completed: 0, cancelled: 0 },
  disputes: { open: 0, total: 0 },
  payments: { paidCount: 0, paidValueGhs: 0 },
  generatedAt: new Date().toISOString(),
};

const localAdmin: AdminService = {
  metrics: async () => emptyMetrics,
  dispatch: async () => [],
  audit: async () => [],
  users: async () => [],
  requests: async () => [],
  suspendExpired: async () => ({ suspended: 0 }),
};

export const adminService: AdminService = bridge(serverAdmin, localAdmin);
