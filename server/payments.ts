import { all, get, run, tx } from "./db.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import { auditFrom, writeAudit } from "./audit.ts";
import { notify } from "./notifications.ts";
import { devPaymentsEnabled } from "./config.ts";
import { addMinutes, newId, nowIso } from "./util.ts";
import { getGateway } from "./paymentGateway.ts";
import { getRequestRaw } from "./serviceRequests.ts";
import { getEstimateSummary } from "./estimates.ts";
import type { AuthContext } from "./http.ts";

export type PaymentMethod = "momo" | "cash" | "card";

function hydrate(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    id: String(row.id),
    requestId: String(row.requestId),
    customerId: String(row.customerId),
    providerId: (row.providerId as string) ?? null,
    amountGhs: Number(row.amountGhs),
    method: row.method as PaymentMethod,
    status: String(row.status),
    providerName: String(row.providerName),
    providerRef: (row.providerRef as string) ?? null,
    createdAt: String(row.createdAt),
    verifiedAt: (row.verifiedAt as string) ?? null,
  };
}

const SELECT = `SELECT id, request_id as requestId, customer_id as customerId, provider_id as providerId,
  amount_ghs as amountGhs, method, status, provider_name as providerName, provider_ref as providerRef,
  created_at as createdAt, verified_at as verifiedAt FROM payments`;

export function getPaymentRaw(id: string) {
  return hydrate(get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id]));
}

export async function createIntent(
  auth: AuthContext,
  input: { requestId: string; amountGhs: number; method: PaymentMethod; idempotencyKey: string; customerPhone?: string },
) {
  if (!input.idempotencyKey?.trim()) throw badRequest("An idempotency key is required.");
  if (!Number.isFinite(input.amountGhs) || input.amountGhs <= 0) throw badRequest("Enter a valid amount.");
  if (!["momo", "cash", "card"].includes(input.method)) throw badRequest("Choose a valid payment method.");

  const existing = get<Record<string, unknown>>(`${SELECT} WHERE idempotency_key = ?`, [input.idempotencyKey]);
  if (existing) return { payment: hydrate(existing), reused: true };

  const request = getRequestRaw(input.requestId);
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (!["completed", "repairing", "awaitingParts"].includes(request.status)) {
    throw conflict("Payment opens once the provider has completed the work.");
  }

  // Never bill more than the customer approved without a fresh approved estimate.
  if (auth.role !== "admin") {
    const summary = getEstimateSummary(auth, input.requestId);
    if (summary.approvedTotalGhs > 0 && input.amountGhs > summary.approvedTotalGhs + 0.01) {
      throw conflict("This amount exceeds the approved estimate. Ask the provider to submit an approved revision first.");
    }
  }

  const gateway = getGateway();
  const charge = await gateway.createCharge({
    amountGhs: input.amountGhs,
    reference: input.idempotencyKey,
    customerPhone: input.customerPhone ?? (get<{ phone: string }>("SELECT phone FROM users WHERE id = ?", [auth.userId])?.phone ?? ""),
    method: input.method,
    description: `MechNow ${request.ref}`,
  });

  const payment = tx(() => {
    const id = newId();
    run(
      `INSERT INTO payments (id, request_id, customer_id, provider_id, amount_ghs, method, status, provider_name, provider_ref, idempotency_key, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        input.requestId,
        auth.userId,
        request.providerId,
        input.amountGhs,
        input.method,
        charge.status === "paid" ? "paid" : "pending",
        charge.providerName,
        charge.providerRef,
        input.idempotencyKey,
        nowIso(),
      ],
    );
    writeAudit({ actorId: auth.userId, actorRole: auth.role, action: "payment.intent", entityType: "payment", entityId: id, metadata: { amount: input.amountGhs, method: input.method } });
    return getPaymentRaw(id);
  });

  return { payment, reused: false, devAuthorizationUrl: charge.devAuthorizationUrl };
}

function markPaid(paymentId: string, providerRef: string, actor: AuthContext | null) {
  const payment = getPaymentRaw(paymentId);
  if (!payment) throw notFound("Payment not found.");
  if (payment.status === "paid") return payment;
  if (payment.providerRef && providerRef && payment.providerRef !== providerRef) {
    throw conflict("Payment reference mismatch.");
  }
  tx(() => {
    run("UPDATE payments SET status = 'paid', verified_at = ? WHERE id = ? AND status <> 'paid'", [nowIso(), paymentId]);
    run("UPDATE service_requests SET updated_at = ? WHERE id = ?", [nowIso(), payment.requestId]);
    writeAudit({ actorId: actor?.userId ?? null, actorRole: actor?.role ?? "system", action: "payment.verified", entityType: "payment", entityId: paymentId, metadata: { providerRef } });
    notify(payment.customerId, "Payment confirmed", `We received GHS ${payment.amountGhs.toFixed(2)} for your service.`);
    const request = getRequestRaw(payment.requestId);
    if (request?.providerId) {
      const providerUser = get<{ userId: string }>("SELECT user_id as userId FROM providers WHERE id = ?", [request.providerId]);
      if (providerUser?.userId) notify(providerUser.userId, "Payment received", `GHS ${payment.amountGhs.toFixed(2)} for ${request.ref}.`);
    }
  });
  return getPaymentRaw(paymentId);
}

export function confirmDevPayment(auth: AuthContext, paymentId: string) {
  if (!devPaymentsEnabled) throw forbidden("Dev payment confirmation is disabled.");
  const payment = getPaymentRaw(paymentId);
  if (!payment) throw notFound("Payment not found.");
  if (payment.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  return markPaid(paymentId, payment.providerRef ?? "", auth);
}

export function handleWebhook(provider: string, rawBody: string, signature: string | undefined) {
  const gateway = getGateway();
  if (gateway.name !== provider) throw notFound("Unknown payment provider.");
  if (!gateway.verifyWebhook(rawBody, signature)) throw forbidden("Invalid webhook signature.");
  const parsed = gateway.parseWebhook(rawBody);
  if (!parsed.providerRef) throw badRequest("Webhook payload missing reference.");
  const payment = get<{ id: string }>("SELECT id FROM payments WHERE provider_ref = ?", [parsed.providerRef]);
  if (!payment) return { acknowledged: true, matched: false };
  if (parsed.status === "paid") markPaid(payment.id, parsed.providerRef, null);
  return { acknowledged: true, matched: true };
}

export function getPayment(auth: AuthContext, id: string) {
  const payment = getPaymentRaw(id);
  if (!payment) throw notFound("Payment not found.");
  if (payment.customerId !== auth.userId && auth.role !== "admin") {
    const provider = get<{ id: string }>("SELECT id FROM providers WHERE user_id = ?", [auth.userId]);
    if (!provider || payment.providerId !== provider.id) throw forbidden();
  }
  return payment;
}

export function listPayments(auth: AuthContext, requestId?: string) {
  const clause = requestId ? "WHERE request_id = ?" : "";
  const params = requestId ? [requestId] : [];
  const rows = all<Record<string, unknown>>(`${SELECT} ${clause} ORDER BY created_at DESC LIMIT 200`, params);
  return rows
    .map(hydrate)
    .filter((payment) => {
      if (!payment) return false;
      if (auth.role === "admin") return true;
      if (auth.role === "driver") return payment.customerId === auth.userId;
      return true;
    });
}

export function requestRefund(auth: AuthContext, paymentId: string, amountGhs: number, reason: string) {
  const payment = getPaymentRaw(paymentId);
  if (!payment) throw notFound("Payment not found.");
  if (!reason?.trim()) throw badRequest("A reason is required for a refund.");
  if (!Number.isFinite(amountGhs) || amountGhs <= 0) throw badRequest("Enter a valid refund amount.");
  if (payment.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  const refunded = Number(
    (get<{ total: number }>("SELECT COALESCE(SUM(amount_ghs),0) as total FROM refunds WHERE payment_id = ? AND status = 'processed'", [paymentId])?.total) ?? 0,
  );
  if (amountGhs + refunded > payment.amountGhs + 0.01) throw conflict("Refund exceeds the paid amount.");

  const gateway = getGateway();
  const id = newId();
  run(
    `INSERT INTO refunds (id, payment_id, amount_ghs, reason, status, actor_id, created_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [id, paymentId, amountGhs, reason.trim(), auth.userId, nowIso()],
  );

  return (async () => {
    let status = "failed";
    try {
      const result = await gateway.refund({ providerRef: payment.providerRef ?? "", amountGhs, reason });
      status = result.status === "processed" ? "processed" : "failed";
    } catch {
      status = "failed";
    }
    tx(() => {
      run("UPDATE refunds SET status = ? WHERE id = ?", [status, id]);
      if (status === "processed") {
        const totalRefunded = refunded + amountGhs;
        const nextStatus = totalRefunded >= payment.amountGhs - 0.01 ? "refunded" : "partially_refunded";
        run("UPDATE payments SET status = ? WHERE id = ?", [nextStatus, paymentId]);
      }
      writeAudit({ actorId: auth.userId, actorRole: auth.role, action: "payment.refund", entityType: "payment", entityId: paymentId, metadata: { amountGhs, reason, status } });
    });
    return { id, paymentId, amountGhs, status };
  })();
}

// Used by scheduled jobs/tests: an unpaid intent expires if never verified.
export function pendingExpiryCutoff(minutes = 30) {
  return addMinutes(new Date(), -minutes).toISOString();
}
