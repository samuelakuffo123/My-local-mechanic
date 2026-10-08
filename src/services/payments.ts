import { mockRequest, readPersisted, writePersisted } from "./mockApi";
import type { User } from "../state/types";
import { requireRole } from "./authorization";
export interface Payment { id: string; amountGhs: number; status: "pending" | "paid" | "failed"; idempotencyKey: string }
export const paymentService = {
  pay: (amountGhs: number, idempotencyKey: string, user: User | null) => mockRequest(() => {
    requireRole(user, ["driver", "mechanic", "tow", "vendor"]);
    const payments = readPersisted<Payment[]>("payments", []);
    const existing = payments.find((item) => item.idempotencyKey === idempotencyKey);
    if (existing) return existing;
    const payment: Payment = { id: crypto.randomUUID(), amountGhs, status: "paid", idempotencyKey };
    writePersisted("payments", [...payments, payment]);
    return payment;
  }, { failureRate: .08 }),
};
