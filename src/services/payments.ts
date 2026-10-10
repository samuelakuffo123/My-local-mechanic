import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { Payment, PaymentMethod } from "./apiTypes";

export interface PaymentIntentInput {
  requestId: string;
  amountGhs: number;
  method: PaymentMethod;
  idempotencyKey: string;
  customerPhone?: string;
}

export interface PaymentService {
  createIntent(input: PaymentIntentInput): Promise<{ payment: Payment; reused: boolean; devAuthorizationUrl?: string }>;
  list(requestId?: string): Promise<Payment[]>;
  get(id: string): Promise<Payment>;
  confirmDev(id: string): Promise<Payment>;
  refund(id: string, amountGhs: number, reason: string): Promise<{ id: string; status: string }>;
}

const serverPayments: PaymentService = {
  createIntent: (input) => apiRequest("/payments/intent", { method: "POST", body: input }),
  list: async (requestId) => (await apiRequest<{ items: Payment[] }>(requestId ? `/payments?requestId=${encodeURIComponent(requestId)}` : "/payments")).items,
  get: (id) => apiRequest<Payment>(`/payments/${id}`),
  confirmDev: (id) => apiRequest<Payment>(`/payments/${id}/confirm-dev`, { method: "POST" }),
  refund: (id, amountGhs, reason) => apiRequest(`/payments/${id}/refund`, { method: "POST", body: { amountGhs, reason } }),
};

const LOCAL_KEY = "mechnow-api:payments";

function read(): Payment[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as Payment[];
  } catch {
    return [];
  }
}

function write(items: Payment[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

const localPayments: PaymentService = {
  createIntent: async (input) => {
    const items = read();
    const existing = items.find((item) => item.id === input.idempotencyKey);
    if (existing) return { payment: existing, reused: true };
    const payment: Payment = {
      id: input.idempotencyKey,
      requestId: input.requestId,
      customerId: "local-user",
      providerId: null,
      amountGhs: input.amountGhs,
      method: input.method,
      status: "pending",
      providerName: "local",
      providerRef: null,
      createdAt: new Date().toISOString(),
      verifiedAt: null,
    };
    write([...items, payment]);
    return { payment, reused: false, devAuthorizationUrl: `/dev/payments/authorize?ref=${encodeURIComponent(input.idempotencyKey)}` };
  },
  list: async (requestId) => (requestId ? read().filter((item) => item.requestId === requestId) : read()),
  get: async (id) => {
    const found = read().find((item) => item.id === id);
    if (!found) throw new Error("Payment not found.");
    return found;
  },
  confirmDev: async (id) => {
    const items = read();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Payment not found.");
    const updated = { ...items[index], status: "paid" as const, verifiedAt: new Date().toISOString() };
    items[index] = updated;
    write(items);
    return updated;
  },
  refund: async (id, amountGhs) => {
    const items = read();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) throw new Error("Payment not found.");
    const status = items[index].amountGhs <= amountGhs ? "refunded" : "partially_refunded";
    items[index] = { ...items[index], status };
    write(items);
    return { id: crypto.randomUUID(), status: "processed" };
  },
};

export const paymentService: PaymentService = bridge(serverPayments, localPayments);
