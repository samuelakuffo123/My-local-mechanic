import { apiRequest } from "./api";
import type { User } from "../state/types";
export interface Payment { id: string; amountGhs: number; status: "pending" | "paid" | "failed"; idempotencyKey: string }
export const paymentService = {
  list: () => apiRequest<Payment[]>("/payments"),
  pay: (amountGhs: number, idempotencyKey: string, _user: User | null) =>
    apiRequest<Payment>("/payments", { method: "POST", body: { amountGhs, idempotencyKey } }),
};
