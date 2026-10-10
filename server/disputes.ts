import { all, get, run } from "./db.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import { auditFrom } from "./audit.ts";
import { notify } from "./notifications.ts";
import { newId, nowIso } from "./util.ts";
import { getRequestRaw } from "./serviceRequests.ts";
import type { AuthContext } from "./http.ts";

export function createDispute(auth: AuthContext, requestId: string, input: { category: string; description: string }) {
  const request = getRequestRaw(requestId);
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (!input.description?.trim() || input.description.trim().length < 10) throw badRequest("Describe the problem in at least 10 characters.");
  if (!["overcharge", "poor_work", "no_show", "unauthorised_work", "parts", "other"].includes(input.category)) {
    throw badRequest("Choose a valid dispute category.");
  }
  const id = newId();
  run(
    `INSERT INTO disputes (id, request_id, raised_by, category, description, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    [id, requestId, auth.userId, input.category, input.description.trim(), nowIso()],
  );
  auditFrom(auth, "dispute.create", "dispute", id, { requestId, category: input.category });
  return getDispute(id);
}

function hydrate(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    id: String(row.id),
    requestId: String(row.requestId),
    raisedBy: String(row.raisedBy),
    category: String(row.category),
    description: String(row.description),
    status: String(row.status),
    resolution: (row.resolution as string) ?? null,
    createdAt: String(row.createdAt),
    resolvedAt: (row.resolvedAt as string) ?? null,
    resolvedBy: (row.resolvedBy as string) ?? null,
  };
}

const SELECT = `SELECT id, request_id as requestId, raised_by as raisedBy, category, description, status,
  resolution, created_at as createdAt, resolved_at as resolvedAt, resolved_by as resolvedBy FROM disputes`;

export function getDispute(id: string) {
  return hydrate(get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id]));
}

export function listDisputes(auth: AuthContext, status?: string) {
  if (auth.role === "admin") {
    return all<Record<string, unknown>>(
      status ? `${SELECT} WHERE status = ? ORDER BY created_at DESC` : `${SELECT} ORDER BY created_at DESC`,
      status ? [status] : [],
    ).map(hydrate);
  }
  return all<Record<string, unknown>>(`${SELECT} WHERE raised_by = ? ORDER BY created_at DESC`, [auth.userId]).map(hydrate);
}

export function resolveDispute(auth: AuthContext, id: string, input: { status: "resolved" | "rejected" | "investigating"; resolution?: string }) {
  if (auth.role !== "admin") throw forbidden("Only trust & safety can resolve disputes.");
  const dispute = getDispute(id);
  if (!dispute) throw notFound("Dispute not found.");
  run(
    `UPDATE disputes SET status = ?, resolution = ?, resolved_at = ?, resolved_by = ? WHERE id = ?`,
    [input.status, input.resolution ?? null, input.status === "investigating" ? null : nowIso(), auth.userId, id],
  );
  auditFrom(auth, "dispute.resolve", "dispute", id, { status: input.status, resolution: input.resolution });
  if (input.status !== "investigating") {
    notify(dispute.raisedBy, "Dispute updated", `Your dispute is now ${input.status}. ${input.resolution ?? ""}`.trim());
  }
  return getDispute(id);
}
