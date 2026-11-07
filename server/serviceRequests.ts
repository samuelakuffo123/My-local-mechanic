import { all, get, run, tx } from "./db.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import { auditFrom } from "./audit.ts";
import { notify } from "./notifications.ts";
import { newId, nowIso, publicRef } from "./util.ts";
import { assertTransition, nextStatuses, type ActorRole, type RequestStatus } from "./stateMachine.ts";
import { eligibleProviders, getProviderForUser, getProviderById } from "./providers.ts";
import type { AuthContext } from "./http.ts";

export type RequestKind = "emergency" | "booking" | "tow";

export interface CreateRequestInput {
  vehicleId: string;
  kind: RequestKind;
  problem: string;
  location?: { label?: string; lat?: number; lng?: number };
  region?: string;
  providerId?: string;
}

function actorRoleFor(auth: AuthContext): ActorRole {
  if (auth.role === "admin") return "admin";
  if (auth.role === "driver") return "customer";
  return "provider";
}

const SELECT = `SELECT r.id, r.ref, r.customer_id as customerId, r.vehicle_id as vehicleId, r.provider_id as providerId,
  r.kind, r.problem, r.location_label as locationLabel, r.lat, r.lng, r.region, r.status, r.version,
  r.decline_count as declineCount, r.cancellation_reason as cancellationReason,
  r.created_at as createdAt, r.updated_at as updatedAt, r.accepted_at as acceptedAt,
  r.completed_at as completedAt, r.cancelled_at as cancelledAt FROM service_requests r`;

function hydrate(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return {
    id: String(row.id),
    ref: String(row.ref),
    customerId: String(row.customerId),
    vehicleId: String(row.vehicleId),
    providerId: (row.providerId as string) ?? null,
    kind: row.kind as RequestKind,
    problem: String(row.problem),
    location: { label: (row.locationLabel as string) ?? null, lat: row.lat as number | null, lng: row.lng as number | null },
    region: (row.region as string) ?? null,
    status: row.status as RequestStatus,
    version: Number(row.version),
    declineCount: Number(row.declineCount ?? 0),
    cancellationReason: (row.cancellationReason as string) ?? null,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    acceptedAt: (row.acceptedAt as string) ?? null,
    completedAt: (row.completedAt as string) ?? null,
    cancelledAt: (row.cancelledAt as string) ?? null,
  };
}

function logEvent(requestId: string, from: string | null, to: string, auth: AuthContext | null, note?: string) {
  run(
    `INSERT INTO service_request_events (id, request_id, from_status, to_status, actor_id, actor_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), requestId, from, to, auth?.userId ?? null, auth?.role ?? null, note ?? null, nowIso()],
  );
}

export function createRequest(auth: AuthContext, input: CreateRequestInput) {
  if (auth.role !== "driver" && auth.role !== "admin") throw forbidden("Only vehicle owners can request service.");
  if (!input.problem?.trim() || input.problem.trim().length < 4) throw badRequest("Describe the problem so a provider can prepare.");
  if (!["emergency", "booking", "tow"].includes(input.kind)) throw badRequest("Choose a valid service type.");
  const vehicle = get<{ ownerId: string }>("SELECT owner_id as ownerId FROM vehicles WHERE id = ?", [input.vehicleId]);
  if (!vehicle) throw notFound("Select a vehicle first.");
  if (vehicle.ownerId !== auth.userId && auth.role !== "admin") throw forbidden("That vehicle is not on your account.");

  if (input.providerId) {
    const provider = getProviderById(input.providerId);
    if (!provider || provider.status !== "verified") throw conflict("That provider is not available for dispatch.");
  }

  const id = newId();
  const reference = publicRef(input.kind === "tow" ? "TW" : "MN");
  const timestamp = nowIso();
  tx(() => {
    run(
      `INSERT INTO service_requests (id, ref, customer_id, vehicle_id, provider_id, kind, problem, location_label, lat, lng, region, status, version, decline_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'requested', 0, 0, ?, ?)`,
      [
        id,
        reference,
        auth.userId,
        input.vehicleId,
        input.providerId ?? null,
        input.kind,
        input.problem.trim(),
        input.location?.label ?? null,
        input.location?.lat ?? null,
        input.location?.lng ?? null,
        input.region ?? null,
        timestamp,
        timestamp,
      ],
    );
    logEvent(id, null, "requested", auth, "Request created");
    auditFrom(auth, "request.create", "service_request", id, { kind: input.kind });
  });

  const eligible = input.providerId ? [] : eligibleProviders(input.kind, input.region ?? null);
  return { request: getRequestRaw(id), eligibleProviderIds: eligible.map((provider) => provider.id) };
}

export function getRequestRaw(id: string) {
  return hydrate(get<Record<string, unknown>>(`${SELECT} WHERE r.id = ?`, [id]));
}

function assertCanView(auth: AuthContext, request: NonNullable<ReturnType<typeof getRequestRaw>>) {
  if (auth.role === "admin") return;
  if (auth.role === "driver") {
    if (request.customerId !== auth.userId) throw forbidden();
    return;
  }
  const provider = getProviderForUser(auth.userId);
  // Providers can see unassigned requests in their lane, plus their own jobs.
  if (request.providerId && provider && request.providerId !== provider.id) throw forbidden();
  if (!provider) throw forbidden();
}

export function getRequest(auth: AuthContext, id: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  assertCanView(auth, request);
  const provider = request.providerId ? getProviderById(request.providerId) : null;
  return { ...request, provider, eligibleProviderIds: provider ? [] : eligibleProviders(request.kind, request.region).map((row) => row.id) };
}

export function listRequests(auth: AuthContext) {
  let rows: Record<string, unknown>[];
  if (auth.role === "admin") {
    rows = all(`${SELECT} ORDER BY r.created_at DESC LIMIT 200`);
  } else if (auth.role === "driver") {
    rows = all(`${SELECT} WHERE r.customer_id = ? ORDER BY r.created_at DESC`, [auth.userId]);
  } else {
    const provider = getProviderForUser(auth.userId);
    if (!provider) return { items: [] };
    rows = all(`${SELECT} WHERE r.provider_id = ? OR (r.provider_id IS NULL AND r.kind = ?) ORDER BY r.created_at DESC LIMIT 100`, [
      provider.id,
      provider.type === "tow" ? "tow" : "emergency",
    ]);
  }
  return { items: rows.map(hydrate) };
}

function requireProvider(request: NonNullable<ReturnType<typeof getRequestRaw>>, auth: AuthContext) {
  const provider = getProviderForUser(auth.userId);
  if (!provider) throw forbidden("Create a provider profile first.");
  if (provider.status !== "verified") throw conflict("Your provider account is not verified.");
  if (request.providerId && request.providerId !== provider.id) throw conflict("This job is assigned to another provider.");
  return provider;
}

export function assignProvider(auth: AuthContext, id: string, providerId: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (request.status !== "requested") throw conflict("A provider can only be assigned while the request is open.");
  const provider = getProviderById(providerId);
  if (!provider || provider.status !== "verified") throw conflict("That provider is not verified.");
  run("UPDATE service_requests SET provider_id = ?, updated_at = ? WHERE id = ?", [providerId, nowIso(), id]);
  logEvent(id, request.status, request.status, auth, `Assigned to ${provider.businessName}`);
  notify(provider.userId, "New job assigned", `${request.ref}: ${request.problem}`);
  return getRequestRaw(id);
}

export function acceptRequest(auth: AuthContext, id: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  if (request.status !== "requested") throw conflict("This request is no longer open.");
  const provider = requireProvider(request, auth);
  if (request.providerId && request.providerId !== provider.id) throw conflict("This job is assigned to another provider.");
  const check = assertTransition("requested", "accepted", "provider");
  if (!check.ok) throw conflict(check.reason);
  tx(() => {
    run(
      "UPDATE service_requests SET provider_id = ?, status = 'accepted', version = version + 1, accepted_at = ?, updated_at = ? WHERE id = ?",
      [provider.id, nowIso(), nowIso(), id],
    );
    logEvent(id, "requested", "accepted", auth, "Provider accepted");
    auditFrom(auth, "request.accept", "service_request", id);
    notify(request.customerId, "Provider accepted your request", `${request.ref}: ${provider.businessName} is preparing to help.`);
  });
  return getRequestRaw(id);
}

export function declineRequest(auth: AuthContext, id: string, reason?: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const provider = requireProvider(request, auth);
  if (request.status !== "requested" || (request.providerId && request.providerId !== provider.id)) {
    throw conflict("You cannot decline this job.");
  }
  tx(() => {
    run(
      "UPDATE service_requests SET provider_id = NULL, decline_count = decline_count + 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    logEvent(id, request.status, request.status, auth, `Declined: ${reason ?? "no reason given"}`);
    auditFrom(auth, "request.decline", "service_request", id, { reason });
    notify(request.customerId, "Provider unavailable", `We're finding another provider for ${request.ref}.`);
  });
  return getRequestRaw(id);
}

export function transition(auth: AuthContext, id: string, to: RequestStatus, note?: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const actorRole = actorRoleFor(auth);
  if (actorRole === "provider") requireProvider(request, auth);
  if (actorRole === "customer" && request.customerId !== auth.userId) throw forbidden();

  const check = assertTransition(request.status, to, actorRole);
  if (!check.ok) throw conflict(check.reason);

  // Require an approved estimate before a job may enter "repairing".
  if (to === "repairing") {
    const approved = get("SELECT id FROM estimates WHERE request_id = ? AND status = 'approved'", [id]);
    if (!approved) throw conflict("The customer must approve an itemised estimate before repair work starts.");
  }

  tx(() => {
    const completedAt = to === "completed" ? nowIso() : null;
    run(
      `UPDATE service_requests SET status = ?, version = version + 1, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`,
      [to, nowIso(), completedAt, id],
    );
    logEvent(id, request.status, to, auth, note);
    auditFrom(auth, "request.transition", "service_request", id, { from: request.status, to });
    const pretty = to.replace(/([A-Z])/g, " $1").toLowerCase();
    if (actorRole === "provider") notify(request.customerId, "Job update", `${request.ref} is now ${pretty}.`);
    if (to === "completed") notify(request.customerId, "Job completed", `${request.ref} is complete. Review the invoice and pay.`);
  });
  return getRequestRaw(id);
}

export function cancelRequest(auth: AuthContext, id: string, reason: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const actorRole = actorRoleFor(auth);
  if (actorRole === "customer" && request.customerId !== auth.userId) throw forbidden();
  if (request.status === "completed" || request.status === "cancelled") throw conflict("This job can no longer be cancelled.");
  if (actorRole === "provider") {
    // A provider may only cancel before repair begins.
    if (!["accepted", "enRoute", "arrived", "diagnosing", "awaitingApproval"].includes(request.status)) {
      throw conflict("Work has started; raise a dispute instead of cancelling.");
    }
    requireProvider(request, auth);
  }
  tx(() => {
    run(
      "UPDATE service_requests SET status = 'cancelled', cancellation_reason = ?, cancelled_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
      [reason || "No reason given", nowIso(), nowIso(), id],
    );
    logEvent(id, request.status, "cancelled", auth, reason);
    auditFrom(auth, "request.cancel", "service_request", id, { reason });
  });
  return getRequestRaw(id);
}

export function listEvents(auth: AuthContext, id: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  assertCanView(auth, request);
  return all(
    `SELECT id, from_status as fromStatus, to_status as toStatus, actor_id as actorId, actor_role as actorRole,
            note, created_at as createdAt FROM service_request_events WHERE request_id = ? ORDER BY created_at ASC`,
    [id],
  );
}

export function availableActions(auth: AuthContext, id: string) {
  const request = getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  return nextStatuses(request.status, actorRoleFor(auth));
}

export function serviceHistory(auth: AuthContext, vehicleId: string) {
  const vehicle = get<{ ownerId: string }>("SELECT owner_id as ownerId FROM vehicles WHERE id = ?", [vehicleId]);
  if (!vehicle) throw notFound("Vehicle not found.");
  if (vehicle.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  const requests = all<Record<string, unknown>>(
    `${SELECT} WHERE r.vehicle_id = ? AND r.status = 'completed' ORDER BY r.completed_at DESC`,
    [vehicleId],
  ).map(hydrate);
  return requests.map((request) => {
    const estimate = get(
      `SELECT id, total_ghs as totalGhs, revision, status, decided_at as decidedAt FROM estimates
       WHERE request_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1`,
      [request!.id],
    );
    const payment = get(
      `SELECT id, amount_ghs as amountGhs, status, method, verified_at as verifiedAt FROM payments
       WHERE request_id = ? ORDER BY created_at DESC LIMIT 1`,
      [request!.id],
    );
    return { request, approvedEstimate: estimate ?? null, payment: payment ?? null };
  });
}
