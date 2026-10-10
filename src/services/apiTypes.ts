import type { Role, User, Vehicle } from "../state/types";

// Data-transfer shapes returned by the MechNow backend. Kept close to the
// UI-facing types in state/types.ts, with a small amount of normalisation
// (for example isPrimary -> primary) so screens do not depend on wire naming.

export type { Role, User, Vehicle };

export interface Session {
  token: string;
  user: User;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  type: "mechanic" | "tow" | "vendor";
  businessName: string;
  region: string | null;
  serviceAreas: string[];
  specialisations: string[];
  status: "pending" | "verified" | "rejected" | "suspended";
  available: boolean;
  rating: number;
  reliability: number;
}

export type RequestKind = "emergency" | "booking" | "tow";

export type RequestStatus =
  | "requested"
  | "accepted"
  | "enRoute"
  | "arrived"
  | "diagnosing"
  | "awaitingApproval"
  | "repairing"
  | "awaitingParts"
  | "completed"
  | "cancelled";

export interface ServiceRequest {
  id: string;
  ref: string;
  customerId: string;
  vehicleId: string;
  providerId: string | null;
  kind: RequestKind;
  problem: string;
  location: { label: string | null; lat: number | null; lng: number | null };
  region: string | null;
  status: RequestStatus;
  version: number;
  declineCount: number;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  provider?: ProviderProfile | null;
}

export type LineKind = "labour" | "part" | "diagnostic" | "transport" | "other";

export interface EstimateLineItem {
  id?: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unitPriceGhs: number;
}

export interface Estimate {
  id: string;
  requestId: string;
  providerId: string;
  revision: number;
  status: "submitted" | "approved" | "rejected" | "superseded";
  totalGhs: number;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  items: EstimateLineItem[];
}

export interface EstimateSummary {
  requestId: string;
  estimates: (Estimate | null)[];
  approvedEstimateId: string | null;
  approvedTotalGhs: number;
  paidToDateGhs: number;
  varianceGhs: number;
}

export type PaymentMethod = "momo" | "cash" | "card";

export interface Payment {
  id: string;
  requestId: string;
  customerId: string;
  providerId: string | null;
  amountGhs: number;
  method: PaymentMethod;
  status: "pending" | "paid" | "failed" | "refunded" | "partially_refunded";
  providerName: string;
  providerRef: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface Dispute {
  id: string;
  requestId: string;
  raisedBy: string;
  category: string;
  description: string;
  status: "open" | "investigating" | "resolved" | "rejected";
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface RequestEvent {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  actorId: string | null;
  actorRole: string | null;
  note: string | null;
  createdAt: string;
}

export interface PlatformMetrics {
  users: number;
  providers: { total: number; verified: number; pending: number; available: number };
  requests: { total: number; open: number; completed: number; cancelled: number };
  disputes: { open: number; total: number };
  payments: { paidCount: number; paidValueGhs: number };
  generatedAt: string;
}

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm?: number;
  primary?: boolean;
}
