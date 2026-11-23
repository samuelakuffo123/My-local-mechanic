import { all, get, run, tx } from "./db.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import { auditFrom } from "./audit.ts";
import { notify } from "./notifications.ts";
import { newId, nowIso } from "./util.ts";
import { getProviderForUser } from "./providers.ts";
import { getRequestRaw, listEvents } from "./serviceRequests.ts";
import type { AuthContext } from "./http.ts";

export type LineKind = "labour" | "part" | "diagnostic" | "transport" | "other";

export interface LineItemInput {
  kind: LineKind;
  description: string;
  quantity?: number;
  unitPriceGhs: number;
}

function validateItems(items: LineItemInput[]) {
  if (!Array.isArray(items) || items.length === 0) throw badRequest("Add at least one itemised line to the estimate.");
  for (const item of items) {
    if (!["labour", "part", "diagnostic", "transport", "other"].includes(item.kind)) throw badRequest("Invalid line item type.");
    if (!item.description?.trim()) throw badRequest("Every line needs a description.");
    if (!Number.isFinite(item.unitPriceGhs) || item.unitPriceGhs < 0) throw badRequest("Line prices must be zero or positive.");
    const qty = item.quantity ?? 1;
    if (!Number.isFinite(qty) || qty <= 0) throw badRequest("Line quantities must be positive.");
  }
}

export async function submitEstimate(auth: AuthContext, requestId: string, input: { items: LineItemInput[]; note?: string }) {
  const request = await getRequestRaw(requestId);
  if (!request) throw notFound("Request not found.");
  const provider = await getProviderForUser(auth.userId);
  if (!provider) throw forbidden("Create a provider profile first.");
  if (provider.status !== "verified") throw forbidden("Your provider account is not verified yet.");
  if (request.providerId !== provider.id) throw forbidden("You are not assigned to this request.");
  if (!["diagnosing", "awaitingApproval", "repairing", "awaitingParts"].includes(request.status)) {
    throw conflict("An estimate can be submitted after diagnosis and before completion.");
  }
  validateItems(input.items);
  const total = input.items.reduce((sum, item) => sum + item.unitPriceGhs * (item.quantity ?? 1), 0);

  return await tx(async () => {
    // Any previously submitted (not yet decided) estimate is superseded.
    await run("UPDATE estimates SET status = 'superseded' WHERE request_id = ? AND status = 'submitted'", [requestId]);
    const last = await get<{ revision: number }>(`SELECT MAX(revision) as "revision" FROM estimates WHERE request_id = ?`, [requestId]);
    const revision = Number(last?.revision ?? 0) + 1;
    const id = newId();
    await run(
      `INSERT INTO estimates (id, request_id, provider_id, revision, status, total_ghs, note, created_at)
       VALUES (?, ?, ?, ?, 'submitted', ?, ?, ?)`,
      [id, requestId, provider.id, revision, total, input.note ?? null, nowIso()],
    );
    for (const item of input.items) {
      await run(
        `INSERT INTO estimate_line_items (id, estimate_id, kind, description, quantity, unit_price_ghs) VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), id, item.kind, item.description.trim(), item.quantity ?? 1, item.unitPriceGhs],
      );
    }
    await auditFrom(auth, "estimate.submit", "estimate", id, { requestId, revision, total });
    await notify(request.customerId, "Estimate ready for approval", `${request.ref}: GHS ${total.toFixed(2)} awaiting your approval.`);
    return await getEstimateById(id);
  });
}

interface EstimateRow {
  id: string;
  requestId: string;
  providerId: string;
  revision: number;
  status: string;
  totalGhs: number;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
}

interface EstimateLineRow {
  id: string;
  kind: string;
  description: string;
  quantity: number;
  unitPriceGhs: number;
}

export async function getEstimateById(id: string) {
  const row = await get<EstimateRow>(
    `SELECT id, request_id as "requestId", provider_id as "providerId", revision, status, total_ghs as "totalGhs",
            note, created_at as "createdAt", decided_at as "decidedAt", decided_by as "decidedBy", decision_reason as "decisionReason"
     FROM estimates WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  const items = await all<EstimateLineRow>(
    `SELECT id, kind, description, quantity, unit_price_ghs as "unitPriceGhs" FROM estimate_line_items WHERE estimate_id = ?`,
    [id],
  );
  return { ...row, items };
}

async function assertCanView(auth: AuthContext, requestId: string, customerId: string, providerId: string) {
  if (auth.role === "admin") return;
  if (auth.role === "driver") {
    if (customerId !== auth.userId) throw forbidden();
    return;
  }
  const provider = await getProviderForUser(auth.userId);
  if (!provider || provider.id !== providerId) throw forbidden();
}

export async function listEstimates(auth: AuthContext, requestId: string) {
  const request = await getRequestRaw(requestId);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, requestId, request.customerId, request.providerId ?? "");
  const ids = await all<{ id: string }>("SELECT id FROM estimates WHERE request_id = ? ORDER BY revision DESC", [requestId]);
  return Promise.all(ids.map(async (row) => await getEstimateById(row.id)));
}

export async function getEstimateSummary(auth: AuthContext, requestId: string) {
  const request = await getRequestRaw(requestId);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, requestId, request.customerId, request.providerId ?? "");
  const estimates = await listEstimates(auth, requestId);
  const approved = estimates.find((estimate) => estimate?.status === "approved") ?? null;
  const paid = await get<{ amountGhs: number }>(
    `SELECT COALESCE(SUM(amount_ghs), 0) as "amountGhs" FROM payments WHERE request_id = ? AND status = 'paid'`,
    [requestId],
  );
  const approvedTotal = approved?.totalGhs ?? 0;
  const invoiced = Number(paid?.amountGhs ?? 0);
  return {
    requestId,
    estimates,
    approvedEstimateId: approved?.id ?? null,
    approvedTotalGhs: approvedTotal,
    paidToDateGhs: invoiced,
    // Positive variance means the customer was billed more than the approved estimate.
    varianceGhs: Number((invoiced - approvedTotal).toFixed(2)),
  };
}

export async function approveEstimate(auth: AuthContext, estimateId: string) {
  const estimate = await getEstimateById(estimateId);
  if (!estimate) throw notFound("Estimate not found.");
  const request = await getRequestRaw(String(estimate.requestId));
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (estimate.status !== "submitted") throw conflict("This estimate is no longer awaiting approval.");

  await tx(async () => {
    await run(
      `UPDATE estimates SET status = 'approved', decided_at = ?, decided_by = ?, decision_reason = NULL WHERE id = ?`,
      [nowIso(), auth.userId, estimateId],
    );
    await run("UPDATE estimates SET status = 'superseded' WHERE request_id = ? AND id <> ? AND status = 'submitted'", [request.id, estimateId]);
    // Consequential transition: an approved estimate unblocks repair.
    if (request.status === "awaitingApproval" || request.status === "diagnosing") {
      await run("UPDATE service_requests SET status = 'repairing', version = version + 1, updated_at = ? WHERE id = ?", [nowIso(), request.id]);
      await run(
        `INSERT INTO service_request_events (id, request_id, from_status, to_status, actor_id, actor_role, note, created_at)
         VALUES (?, ?, ?, 'repairing', ?, 'customer', 'Customer approved the estimate', ?)`,
        [newId(), request.id, request.status, auth.userId, nowIso()],
      );
    }
    await auditFrom(auth, "estimate.approve", "estimate", estimateId, { requestId: request.id, total: estimate.totalGhs });
    const providerUser = request.providerId
      ? await get<{ userId: string }>(`SELECT user_id as "userId" FROM providers WHERE id = ?`, [request.providerId])
      : undefined;
    if (providerUser?.userId) {
      await notify(providerUser.userId, "Estimate approved", `${request.ref}: GHS ${Number(estimate.totalGhs).toFixed(2)} approved. Start work.`);
    }
    await notify(request.customerId, "Estimate approved", `You approved ${request.ref}. Repair work can begin.`);
  });
  return await getEstimateById(estimateId);
}

export async function rejectEstimate(auth: AuthContext, estimateId: string, reason?: string) {
  const estimate = await getEstimateById(estimateId);
  if (!estimate) throw notFound("Estimate not found.");
  const request = await getRequestRaw(String(estimate.requestId));
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (estimate.status !== "submitted") throw conflict("This estimate is no longer awaiting a decision.");
  await run(
    `UPDATE estimates SET status = 'rejected', decided_at = ?, decided_by = ?, decision_reason = ? WHERE id = ?`,
    [nowIso(), auth.userId, reason ?? null, estimateId],
  );
  await auditFrom(auth, "estimate.reject", "estimate", estimateId, { requestId: request.id, reason });
  return await getEstimateById(estimateId);
}

export async function eventsFor(auth: AuthContext, requestId: string) {
  return await listEvents(auth, requestId);
}
