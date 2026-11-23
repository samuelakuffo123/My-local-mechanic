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

const SELECT = `SELECT r.id, r.ref, r.customer_id as "customerId", r.vehicle_id as "vehicleId", r.provider_id as "providerId",
  r.kind, r.problem, r.location_label as "locationLabel", r.lat, r.lng, r.region, r.status, r.version,
  r.decline_count as "declineCount", r.cancellation_reason as "cancellationReason",
  r.provider_lat as "providerLat", r.provider_lng as "providerLng", r.provider_location_at as "providerLocationAt",
  r.created_at as "createdAt", r.updated_at as "updatedAt", r.accepted_at as "acceptedAt",
  r.completed_at as "completedAt", r.cancelled_at as "cancelledAt" FROM service_requests r`;

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
    providerLocation:
      row.providerLat != null && row.providerLng != null
        ? {
            lat: Number(row.providerLat),
            lng: Number(row.providerLng),
            updatedAt: (row.providerLocationAt as string) ?? String(row.updatedAt),
          }
        : null,
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

async function logEvent(requestId: string, from: string | null, to: string, auth: AuthContext | null, note?: string) {
  await run(
    `INSERT INTO service_request_events (id, request_id, from_status, to_status, actor_id, actor_role, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), requestId, from, to, auth?.userId ?? null, auth?.role ?? null, note ?? null, nowIso()],
  );
}

export async function createRequest(auth: AuthContext, input: CreateRequestInput) {
  if (auth.role !== "driver" && auth.role !== "admin") throw forbidden("Only vehicle owners can request service.");
  if (!input.problem?.trim() || input.problem.trim().length < 4) throw badRequest("Describe the problem so a provider can prepare.");
  if (!["emergency", "booking", "tow"].includes(input.kind)) throw badRequest("Choose a valid service type.");
  const vehicle = await get<{ ownerId: string }>(`SELECT owner_id as "ownerId" FROM vehicles WHERE id = ?`, [input.vehicleId]);
  if (!vehicle) throw notFound("Select a vehicle first.");
  if (vehicle.ownerId !== auth.userId && auth.role !== "admin") throw forbidden("That vehicle is not on your account.");

  if (input.providerId) {
    const provider = await getProviderById(input.providerId);
    if (!provider || provider.status !== "verified") throw conflict("That provider is not available for dispatch.");
  }

  const id = newId();
  const reference = publicRef(input.kind === "tow" ? "TW" : "MN");
  const timestamp = nowIso();
  await tx(async () => {
    await run(
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
    await logEvent(id, null, "requested", auth, "Request created");
    await auditFrom(auth, "request.create", "service_request", id, { kind: input.kind });
  });

  const eligible = input.providerId ? [] : await eligibleProviders(input.kind, input.region ?? null);
  return { request: await getRequestRaw(id), eligibleProviderIds: eligible.map((provider) => provider.id) };
}

export async function getRequestRaw(id: string) {
  return hydrate(await get<Record<string, unknown>>(`${SELECT} WHERE r.id = ?`, [id]));
}

async function assertCanView(auth: AuthContext, request: NonNullable<Awaited<ReturnType<typeof getRequestRaw>>>) {
  if (auth.role === "admin") return;
  if (auth.role === "driver") {
    if (request.customerId !== auth.userId) throw forbidden();
    return;
  }
  const provider = await getProviderForUser(auth.userId);
  // Providers can see unassigned requests in their lane, plus their own jobs.
  if (request.providerId && provider && request.providerId !== provider.id) throw forbidden();
  if (!provider) throw forbidden();
}

export async function getRequest(auth: AuthContext, id: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, request);
  const provider = request.providerId ? await getProviderById(request.providerId) : null;
  return { ...request, provider, eligibleProviderIds: provider ? [] : (await eligibleProviders(request.kind, request.region)).map((row) => row.id) };
}

export async function listRequests(auth: AuthContext) {
  let rows: Record<string, unknown>[];
  if (auth.role === "admin") {
    rows = await all(`${SELECT} ORDER BY r.created_at DESC LIMIT 200`);
  } else if (auth.role === "driver") {
    rows = await all(`${SELECT} WHERE r.customer_id = ? ORDER BY r.created_at DESC`, [auth.userId]);
  } else {
    const provider = await getProviderForUser(auth.userId);
    if (!provider) return { items: [] };
    // Mechanics work both emergency call-outs and scheduled bookings; tow
    // operators only see tow jobs; vendors do not receive service requests.
    const kinds = provider.type === "tow" ? ["tow"] : provider.type === "mechanic" ? ["emergency", "booking"] : [];
    if (kinds.length === 0) return { items: [] };
    rows = await all(`${SELECT} WHERE r.provider_id = ? OR (r.provider_id IS NULL AND r.kind IN (${kinds.map(() => "?").join(",")})) ORDER BY r.created_at DESC LIMIT 100`, [
      provider.id,
      ...kinds,
    ]);
  }
  return { items: rows.map(hydrate) };
}

async function requireProvider(request: NonNullable<Awaited<ReturnType<typeof getRequestRaw>>>, auth: AuthContext) {
  const provider = await getProviderForUser(auth.userId);
  if (!provider) throw forbidden("Create a provider profile first.");
  if (provider.status !== "verified") throw conflict("Your provider account is not verified.");
  if (request.providerId && request.providerId !== provider.id) throw conflict("This job is assigned to another provider.");
  return provider;
}

export async function assignProvider(auth: AuthContext, id: string, providerId: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  if (request.customerId !== auth.userId && auth.role !== "admin") throw forbidden();
  if (request.status !== "requested") throw conflict("A provider can only be assigned while the request is open.");
  const provider = await getProviderById(providerId);
  if (!provider || provider.status !== "verified") throw conflict("That provider is not verified.");
  await run("UPDATE service_requests SET provider_id = ?, updated_at = ? WHERE id = ?", [providerId, nowIso(), id]);
  await logEvent(id, request.status, request.status, auth, `Assigned to ${provider.businessName}`);
  await notify(provider.userId, "New job assigned", `${request.ref}: ${request.problem}`);
  return await getRequestRaw(id);
}

export async function acceptRequest(auth: AuthContext, id: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  if (request.status !== "requested") throw conflict("This request is no longer open.");
  const provider = await requireProvider(request, auth);
  if (request.providerId && request.providerId !== provider.id) throw conflict("This job is assigned to another provider.");
  const check = assertTransition("requested", "accepted", "provider");
  if (!check.ok) throw conflict(check.reason);
  await tx(async () => {
    await run(
      "UPDATE service_requests SET provider_id = ?, status = 'accepted', version = version + 1, accepted_at = ?, updated_at = ? WHERE id = ?",
      [provider.id, nowIso(), nowIso(), id],
    );
    await logEvent(id, "requested", "accepted", auth, "Provider accepted");
    await auditFrom(auth, "request.accept", "service_request", id);
    await notify(request.customerId, "Provider accepted your request", `${request.ref}: ${provider.businessName} is preparing to help.`);
  });
  return await getRequestRaw(id);
}

export async function declineRequest(auth: AuthContext, id: string, reason?: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const provider = await requireProvider(request, auth);
  if (request.status !== "requested" || (request.providerId && request.providerId !== provider.id)) {
    throw conflict("You cannot decline this job.");
  }
  await tx(async () => {
    await run(
      "UPDATE service_requests SET provider_id = NULL, decline_count = decline_count + 1, updated_at = ? WHERE id = ?",
      [nowIso(), id],
    );
    await logEvent(id, request.status, request.status, auth, `Declined: ${reason ?? "no reason given"}`);
    await auditFrom(auth, "request.decline", "service_request", id, { reason });
    await notify(request.customerId, "Provider unavailable", `We're finding another provider for ${request.ref}.`);
  });
  return await getRequestRaw(id);
}

export async function transition(auth: AuthContext, id: string, to: RequestStatus, note?: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const actorRole = actorRoleFor(auth);
  if (actorRole === "provider") await requireProvider(request, auth);
  if (actorRole === "customer" && request.customerId !== auth.userId) throw forbidden();

  const check = assertTransition(request.status, to, actorRole);
  if (!check.ok) throw conflict(check.reason);

  // Require an approved estimate before a job may enter "repairing".
  if (to === "repairing") {
    const approved = await get("SELECT id FROM estimates WHERE request_id = ? AND status = 'approved'", [id]);
    if (!approved) throw conflict("The customer must approve an itemised estimate before repair work starts.");
  }

  await tx(async () => {
    const completedAt = to === "completed" ? nowIso() : null;
    await run(
      `UPDATE service_requests SET status = ?, version = version + 1, updated_at = ?, completed_at = COALESCE(?, completed_at) WHERE id = ?`,
      [to, nowIso(), completedAt, id],
    );
    await logEvent(id, request.status, to, auth, note);
    await auditFrom(auth, "request.transition", "service_request", id, { from: request.status, to });
    const pretty = to.replace(/([A-Z])/g, " $1").toLowerCase();
    if (actorRole === "provider") await notify(request.customerId, "Job update", `${request.ref} is now ${pretty}.`);
    if (to === "completed") await notify(request.customerId, "Job completed", `${request.ref} is complete. Review the invoice and pay.`);
  });
  return await getRequestRaw(id);
}

export async function cancelRequest(auth: AuthContext, id: string, reason: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  const actorRole = actorRoleFor(auth);
  if (actorRole === "customer" && request.customerId !== auth.userId) throw forbidden();
  if (request.status === "completed" || request.status === "cancelled") throw conflict("This job can no longer be cancelled.");
  if (actorRole === "provider") {
    // A provider may only cancel before repair begins.
    if (!["accepted", "enRoute", "arrived", "diagnosing", "awaitingApproval"].includes(request.status)) {
      throw conflict("Work has started; raise a dispute instead of cancelling.");
    }
    await requireProvider(request, auth);
  }
  await tx(async () => {
    await run(
      "UPDATE service_requests SET status = 'cancelled', cancellation_reason = ?, cancelled_at = ?, version = version + 1, updated_at = ? WHERE id = ?",
      [reason || "No reason given", nowIso(), nowIso(), id],
    );
    await logEvent(id, request.status, "cancelled", auth, reason);
    await auditFrom(auth, "request.cancel", "service_request", id, { reason });
  });
  return await getRequestRaw(id);
}

export async function listEvents(auth: AuthContext, id: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, request);
  return await all(
    `SELECT id, from_status as "fromStatus", to_status as "toStatus", actor_id as "actorId", actor_role as "actorRole",
            note, created_at as "createdAt" FROM service_request_events WHERE request_id = ? ORDER BY created_at ASC`,
    [id],
  );
}

export async function availableActions(auth: AuthContext, id: string) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, request);
  return nextStatuses(request.status, actorRoleFor(auth));
}

export async function serviceHistory(auth: AuthContext, vehicleId: string) {
  const vehicle = await get<{ ownerId: string }>(`SELECT owner_id as "ownerId" FROM vehicles WHERE id = ?`, [vehicleId]);
  if (!vehicle) throw notFound("Vehicle not found.");
  if (vehicle.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  const requests = (await all<Record<string, unknown>>(
    `${SELECT} WHERE r.vehicle_id = ? AND r.status = 'completed' ORDER BY r.completed_at DESC`,
    [vehicleId],
  )).map(hydrate);
  return Promise.all(requests.map(async (request) => {
    const estimate = await get(
      `SELECT id, total_ghs as "totalGhs", revision, status, decided_at as "decidedAt" FROM estimates
       WHERE request_id = ? AND status = 'approved' ORDER BY revision DESC LIMIT 1`,
      [request!.id],
    );
    const payment = await get(
      `SELECT id, amount_ghs as "amountGhs", status, method, verified_at as "verifiedAt" FROM payments
       WHERE request_id = ? ORDER BY created_at DESC LIMIT 1`,
      [request!.id],
    );
    return { request, approvedEstimate: estimate ?? null, payment: payment ?? null };
  }));
}

export async function updateRequestLocation(
  auth: AuthContext,
  id: string,
  location: { label?: string; lat?: number; lng?: number },
) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  await assertCanView(auth, request);
  if (auth.role === "driver" && request.customerId !== auth.userId) throw forbidden();
  if (request.status === "completed" || request.status === "cancelled") {
    throw conflict("This request can no longer be updated.");
  }
  const label = location.label ?? request.location.label;
  const lat = typeof location.lat === "number" && Number.isFinite(location.lat) ? location.lat : request.location.lat;
  const lng = typeof location.lng === "number" && Number.isFinite(location.lng) ? location.lng : request.location.lng;
  await run("UPDATE service_requests SET location_label = ?, lat = ?, lng = ?, updated_at = ? WHERE id = ?", [
    label ?? null,
    lat ?? null,
    lng ?? null,
    nowIso(),
    id,
  ]);
  return await getRequestRaw(id);
}

/**
 * Lets the assigned provider publish a live position while they are travelling
 * to the customer. Access is deliberately narrow: only the provider that owns
 * the accepted job (or an admin) may write it, and only while the job is live.
 */
export async function publishProviderLocation(
  auth: AuthContext,
  id: string,
  location: { lat: number; lng: number },
) {
  const request = await getRequestRaw(id);
  if (!request) throw notFound("Request not found.");
  if (auth.role === "driver") throw forbidden("Only the assigned provider can share a live location.");
  if (auth.role !== "admin") {
    const provider = await getProviderForUser(auth.userId);
    if (!provider) throw forbidden("Create a provider profile first.");
    if (!request.providerId || request.providerId !== provider.id) {
      throw forbidden("You can only share a location for a job assigned to you.");
    }
  }
  if (request.status === "completed" || request.status === "cancelled") {
    throw conflict("This request is no longer active.");
  }
  if (!Number.isFinite(location.lat) || !Number.isFinite(location.lng)) {
    throw badRequest("A valid latitude and longitude are required.");
  }
  await run(
    `UPDATE service_requests SET provider_lat = ?, provider_lng = ?, provider_location_at = ?, version = version + 1, updated_at = ? WHERE id = ?`,
    [location.lat, location.lng, nowIso(), nowIso(), id],
  );
  return await getRequestRaw(id);
}
