import { get as httpGet, post, patch, del, type RequestContext } from "./http.ts";
import { config } from "./config.ts";
import { run } from "./db.ts";
import { normalisePhone, nowIso, rateLimit } from "./util.ts";
import { unauthorized, badRequest, notFound, tooMany } from "./errors.ts";
import * as auth from "./auth.ts";
import * as vehicles from "./vehicles.ts";
import type { VehicleInput } from "./vehicles.ts";
import * as providers from "./providers.ts";
import * as requests from "./serviceRequests.ts";
import * as estimates from "./estimates.ts";
import * as payments from "./payments.ts";
import * as disputes from "./disputes.ts";
import * as notifications from "./notifications.ts";
import * as admin from "./admin.ts";
import {
  asObject,
  enumValue,
  optionalArray,
  optionalAvatarDataUrl,
  optionalEnumValue,
  optionalNumber,
  optionalPhone,
  optionalString,
  requireNumber,
  requireOtpCode,
  requirePhone,
  requireString,
} from "./validation.ts";
import type { AuthContext } from "./http.ts";
import type { RequestStatus } from "./stateMachine.ts";

function requireAuth(context: RequestContext): AuthContext {
  if (!context.auth) throw unauthorized();
  return context.auth;
}

function queryValue(context: RequestContext, key: string): string | undefined {
  const value = context.query.get(key);
  return value === null ? undefined : value;
}

export function registerRoutes() {
  // --- Health ------------------------------------------------------------
  httpGet("/api/health", () => ({ ok: true, service: "mechnow-api", time: new Date().toISOString() }), true);

  // --- Auth --------------------------------------------------------------
  post("/api/auth/otp/request", async (context) => {
    const body = asObject(context.body);
    return await auth.requestOtp(requirePhone(body), context.ip);
  }, true);

  post("/api/auth/verify", async (context) => {
    const body = asObject(context.body);
    const name = optionalString(body, "name", { max: 80 });
    const role = optionalEnumValue(body, "role", ["driver", "mechanic", "tow", "vendor"] as const);
    return await auth.verifyOtp(requirePhone(body), requireOtpCode(body), { name, role });
  }, true);

  post("/api/auth/login", async (context) => {
    const body = asObject(context.body);
    const phone = requirePhone(body);
    const password = requireString(body, "password", { max: 128 });
    // Throttle before touching the password hash so guesses are cheap to reject.
    if (!rateLimit(`login:ip:${context.ip}`, 40, 15 * 60_000)) throw tooMany();
    if (!rateLimit(`login:id:${normalisePhone(phone)}`, 10, 15 * 60_000)) throw tooMany();
    const userId = await auth.checkPassword(phone, password);
    if (!userId) throw unauthorized("Incorrect phone number or password.");
    return await auth.createSession(userId);
  }, true);

  httpGet("/api/auth/google/config", () => ({
    enabled: Boolean(config.googleClientId),
    clientId: config.googleClientId || null,
  }), true);

  post("/api/auth/google", async (context) => {
    if (!config.googleClientId) throw badRequest("Google sign-in isn't configured on this server.");
    const body = asObject(context.body);
    const accessToken = requireString(body, "accessToken", { min: 10, max: 4096 });
    const role = optionalEnumValue(body, "role", ["driver", "mechanic", "tow", "vendor"] as const);
    if (!rateLimit(`google:ip:${context.ip}`, 30, 15 * 60_000)) {
      throw tooMany("Too many Google sign-in attempts. Try again later.");
    }
    return await auth.signInWithGoogle(accessToken, { role });
  }, true);

  post("/api/auth/logout", async (context) => {
    requireAuth(context);
    const header = context.req.headers.authorization;
    if (header?.startsWith("Bearer ")) await auth.logout(header.slice(7).trim());
    return undefined;
  });

  httpGet("/api/me", async (context) => {
    const user = await auth.getUser(requireAuth(context).userId);
    const provider = await providers.getProviderForUser(requireAuth(context).userId);
    return { user, provider };
  });

  patch("/api/me", async (context) => {
    const current = requireAuth(context);
    const body = asObject(context.body);
    const user = await auth.getUser(current.userId);
    if (!user) throw unauthorized();
    const name = (optionalString(body, "name", { max: 80 }) ?? user.name).trim();
    if (!name) throw badRequest("Name is required.", { field: "name" });
    const emailInput = optionalString(body, "email", { max: 254 });
    const email = emailInput === undefined ? user.email : emailInput.trim() || null;
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      throw badRequest("Enter a valid email address.", { field: "email" });
    }
    const avatarUrl = optionalAvatarDataUrl(body, "avatarUrl");
    const nextAvatarUrl = avatarUrl === undefined ? user.avatarUrl : avatarUrl;
    await run("UPDATE users SET name = ?, email = ?, avatar_data_url = ?, updated_at = ? WHERE id = ?", [
      name,
      email,
      nextAvatarUrl,
      nowIso(),
      current.userId,
    ]);
    return await auth.getUser(current.userId);
  });

  post("/api/me/password", async (context) => {
    const current = requireAuth(context);
    const body = asObject(context.body);
    const next = requireString(body, "password", { min: 8, max: 128 });
    // An existing password must be confirmed before it can be replaced.
    if (await auth.hasPassword(current.userId)) {
      const currentPassword = optionalString(body, "currentPassword");
      if (!currentPassword) throw badRequest("Enter your current password.", { field: "currentPassword" });
      if (!await auth.checkPasswordById(current.userId, currentPassword)) {
        throw unauthorized("Your current password is incorrect.");
      }
    }
    await auth.setPassword(current.userId, next);
    return { ok: true };
  });

  // --- Vehicles ----------------------------------------------------------
  httpGet("/api/vehicles", async (context) => ({ items: await vehicles.listVehicles(requireAuth(context).userId) }));
  // The request body is untrusted and validated inside createVehicle.
  post("/api/vehicles", async (context) => await vehicles.createVehicle(requireAuth(context), asObject(context.body) as unknown as VehicleInput));
  httpGet("/api/vehicles/:id", async (context) => await vehicles.getVehicleForUser(requireAuth(context), context.params.id));
  patch("/api/vehicles/:id", async (context) => await vehicles.updateVehicle(requireAuth(context), context.params.id, asObject(context.body)));
  del("/api/vehicles/:id", async (context) => await vehicles.deleteVehicle(requireAuth(context), context.params.id));
  httpGet("/api/vehicles/:id/history", async (context) => ({ items: await requests.serviceHistory(requireAuth(context), context.params.id) }));

  // --- Providers ---------------------------------------------------------
  httpGet("/api/providers", async (context) => ({
    items: await providers.eligibleProviders(
      (queryValue(context, "kind") as "emergency" | "booking" | "tow") ?? "emergency",
      queryValue(context, "region") ?? null,
    ),
  }));

  post("/api/providers/apply", async (context) => {
    const body = asObject(context.body);
    return await providers.applyAsProvider(requireAuth(context), {
      businessName: requireString(body, "businessName"),
      type: enumValue(body, "type", ["mechanic", "tow", "vendor"] as const),
      region: optionalString(body, "region"),
      serviceAreas: optionalArray<string>(body, "serviceAreas"),
      lat: optionalNumber(body, "lat"),
      lng: optionalNumber(body, "lng"),
      address: optionalString(body, "address", { max: 160 }),
    });
  });

  httpGet("/api/providers/me", async (context) => {
    const current = requireAuth(context);
    const provider = await providers.getProviderForUser(current.userId);
    return { provider, credentials: provider ? await providers.providerCredentials(provider.id) : [] };
  });

  post("/api/providers/me/availability", async (context) => {
    const body = asObject(context.body);
    return await providers.setAvailability(requireAuth(context), Boolean(body.available));
  });

  post("/api/providers/me/credentials", async (context) => {
    const current = requireAuth(context);
    const provider = await providers.getProviderForUser(current.userId);
    if (!provider) throw badRequest("Create a provider profile first.");
    const body = asObject(context.body);
    return await providers.addCredential(provider.id, {
      documentType: requireString(body, "documentType"),
      documentRef: requireString(body, "documentRef"),
      expiresAt: optionalString(body, "expiresAt") ?? null,
    });
  });

  httpGet("/api/providers/nearby", async (context) => {
    const rawLat = queryValue(context, "lat");
    const rawLng = queryValue(context, "lng");
    const lat = rawLat == null || rawLat === "" ? null : Number(rawLat);
    const lng = rawLng == null || rawLng === "" ? null : Number(rawLng);
    if (lat != null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      throw badRequest("Latitude must be a number between -90 and 90.", { field: "lat" });
    }
    if (lng != null && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      throw badRequest("Longitude must be a number between -180 and 180.", { field: "lng" });
    }
    const rawType = queryValue(context, "type");
    if (rawType && !["mechanic", "tow", "vendor"].includes(rawType)) {
      throw badRequest("Choose a valid provider type.", { field: "type" });
    }
    const rawRadius = queryValue(context, "radiusKm");
    const radiusKm = rawRadius == null || rawRadius === "" ? 40 : Number(rawRadius);
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 200) {
      throw badRequest("Radius must be between 1 and 200 km.", { field: "radiusKm" });
    }
    return {
      items: await providers.nearbyProviders({
        lat,
        lng,
        radiusKm,
        type: (rawType as "mechanic" | "tow" | "vendor" | undefined) ?? null,
      }),
    };
  });

  httpGet("/api/providers/:id", async (context) => {
    const current = requireAuth(context);
    const provider = await providers.getProviderById(context.params.id);
    if (!provider) throw notFound("Provider not found.");
    // Identity documents are private: only the provider themselves or an admin.
    const viewerProfile = await providers.getProviderForUser(current.userId);
    const canSeeCredentials = current.role === "admin" || viewerProfile?.id === provider.id;
    return {
      provider,
      credentials: canSeeCredentials ? await providers.providerCredentials(provider.id) : [],
    };
  });

  // --- Service requests --------------------------------------------------
  post("/api/service-requests", async (context) => {
    const body = asObject(context.body);
    return await requests.createRequest(requireAuth(context), {
      vehicleId: requireString(body, "vehicleId"),
      kind: enumValue(body, "kind", ["emergency", "booking", "tow"] as const),
      problem: requireString(body, "problem", { min: 4, max: 2000 }),
      location: body.location as { label?: string; lat?: number; lng?: number } | undefined,
      region: optionalString(body, "region"),
      providerId: optionalString(body, "providerId"),
    });
  });

  httpGet("/api/service-requests", async (context) => await requests.listRequests(requireAuth(context)));
  httpGet("/api/service-requests/:id", async (context) => await requests.getRequest(requireAuth(context), context.params.id));
  httpGet("/api/service-requests/:id/events", async (context) => ({ items: await requests.listEvents(requireAuth(context), context.params.id) }));
  httpGet("/api/service-requests/:id/actions", async (context) => ({ actions: await requests.availableActions(requireAuth(context), context.params.id) }));

  post("/api/service-requests/:id/assign", async (context) => {
    const body = asObject(context.body);
    return await requests.assignProvider(requireAuth(context), context.params.id, requireString(body, "providerId"));
  });
  post("/api/service-requests/:id/accept", async (context) => await requests.acceptRequest(requireAuth(context), context.params.id));
  post("/api/service-requests/:id/decline", async (context) => {
    const body = asObject(context.body);
    return await requests.declineRequest(requireAuth(context), context.params.id, optionalString(body, "reason"));
  });
  post("/api/service-requests/:id/transition", async (context) => {
    const body = asObject(context.body);
    const to = enumValue(body, "to", [
      "accepted", "enRoute", "arrived", "diagnosing", "awaitingApproval", "repairing", "awaitingParts", "completed", "cancelled",
    ] as const) as RequestStatus;
    return await requests.transition(requireAuth(context), context.params.id, to, optionalString(body, "note"));
  });
  post("/api/service-requests/:id/cancel", async (context) => {
    const body = asObject(context.body);
    return await requests.cancelRequest(requireAuth(context), context.params.id, optionalString(body, "reason") ?? "");
  });

  post("/api/service-requests/:id/location", async (context) => {
    const body = asObject(context.body);
    const rawLat = body.lat;
    const rawLng = body.lng;
    const lat = rawLat == null || rawLat === "" ? undefined : Number(rawLat);
    const lng = rawLng == null || rawLng === "" ? undefined : Number(rawLng);
    if (lat !== undefined && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
      throw badRequest("Latitude must be a number between -90 and 90.", { field: "lat" });
    }
    if (lng !== undefined && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
      throw badRequest("Longitude must be a number between -180 and 180.", { field: "lng" });
    }
    return await requests.updateRequestLocation(requireAuth(context), context.params.id, {
      label: optionalString(body, "label", { max: 160 }),
      lat,
      lng,
    });
  });

  post("/api/service-requests/:id/provider-location", async (context) => {
    const body = asObject(context.body);
    return await requests.publishProviderLocation(requireAuth(context), context.params.id, {
      lat: requireNumber(body, "lat", { min: -90, max: 90 }),
      lng: requireNumber(body, "lng", { min: -180, max: 180 }),
    });
  });

  // --- Estimates ---------------------------------------------------------
  post("/api/service-requests/:id/estimates", async (context) => {
    const body = asObject(context.body);
    const items = (optionalArray(body, "items") ?? []) as estimates.LineItemInput[];
    return await estimates.submitEstimate(requireAuth(context), context.params.id, { items, note: optionalString(body, "note") });
  });
  httpGet("/api/service-requests/:id/estimates", async (context) => ({ items: await estimates.listEstimates(requireAuth(context), context.params.id) }));
  httpGet("/api/service-requests/:id/estimate-summary", async (context) => await estimates.getEstimateSummary(requireAuth(context), context.params.id));
  post("/api/estimates/:id/approve", async (context) => await estimates.approveEstimate(requireAuth(context), context.params.id));
  post("/api/estimates/:id/reject", async (context) => {
    const body = asObject(context.body);
    return await estimates.rejectEstimate(requireAuth(context), context.params.id, optionalString(body, "reason"));
  });

  // --- Payments ----------------------------------------------------------
  post("/api/payments/intent", async (context) => {
    const body = asObject(context.body);
    return await payments.createIntent(requireAuth(context), {
      requestId: requireString(body, "requestId"),
      amountGhs: requireNumber(body, "amountGhs", { min: 0.01 }),
      method: enumValue(body, "method", ["momo", "cash", "card"] as const),
      idempotencyKey: requireString(body, "idempotencyKey"),
      customerPhone: optionalPhone(body, "customerPhone"),
    });
  });
  httpGet("/api/payments", async (context) => ({ items: await payments.listPayments(requireAuth(context), queryValue(context, "requestId")) }));
  httpGet("/api/payments/:id", async (context) => await payments.getPayment(requireAuth(context), context.params.id));
  post("/api/payments/:id/confirm-dev", async (context) => await payments.confirmDevPayment(requireAuth(context), context.params.id));
  post("/api/payments/:id/refund", async (context) => {
    const body = asObject(context.body);
    return await payments.requestRefund(requireAuth(context), context.params.id, requireNumber(body, "amountGhs", { min: 0.01 }), requireString(body, "reason"));
  });
  post("/api/payments/webhook/:provider", async (context) => {
    // Verify the signature over the exact bytes received, not a re-serialisation.
    const signature = context.req.headers["x-paystack-signature"];
    return await payments.handleWebhook(context.params.provider, context.rawBody, typeof signature === "string" ? signature : undefined);
  }, true);

  // --- Disputes ----------------------------------------------------------
  post("/api/service-requests/:id/disputes", async (context) => {
    const body = asObject(context.body);
    return await disputes.createDispute(requireAuth(context), context.params.id, {
      category: requireString(body, "category"),
      description: requireString(body, "description", { min: 10 }),
    });
  });
  httpGet("/api/disputes", async (context) => ({ items: await disputes.listDisputes(requireAuth(context), queryValue(context, "status")) }));
  post("/api/disputes/:id/resolve", async (context) => {
    const body = asObject(context.body);
    return await disputes.resolveDispute(requireAuth(context), context.params.id, {
      status: enumValue(body, "status", ["resolved", "rejected", "investigating"] as const),
      resolution: optionalString(body, "resolution"),
    });
  });

  // --- Notifications -----------------------------------------------------
  httpGet("/api/notifications", async (context) => ({ items: await notifications.listNotifications(requireAuth(context).userId) }));
  post("/api/notifications/:id/read", async (context) => {
    await notifications.markRead(requireAuth(context).userId, context.params.id);
    return { ok: true };
  });

  // --- Admin -------------------------------------------------------------
  httpGet("/api/admin/metrics", (context) => admin.requireAdmin(requireAuth(context), admin.platformMetrics));
  httpGet("/api/admin/dispatch", (context) =>
    admin.requireAdmin(requireAuth(context), async () => ({ items: await admin.dispatchMonitor() })),
  );
  httpGet("/api/admin/audit", (context) => {
    const requested = Number(queryValue(context, "limit") ?? 100);
    const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 100, 1), 500);
    return admin.requireAdmin(requireAuth(context), async () => ({ items: await admin.listAuditLogs(limit) }));
  });
  httpGet("/api/admin/users", (context) =>
    admin.requireAdmin(requireAuth(context), async () => ({ items: await auth.listUsers(queryValue(context, "role") as AuthContext["role"] | undefined) })),
  );
  httpGet("/api/admin/requests", (context) =>
    admin.requireAdmin(requireAuth(context), async () => await admin.allRequests(queryValue(context, "status"))),
  );
  const PROVIDER_STATUSES = ["pending", "verified", "rejected", "suspended"] as const;
  httpGet("/api/admin/providers", (context) => {
    const requested = queryValue(context, "status") ?? "pending";
    if (!(PROVIDER_STATUSES as readonly string[]).includes(requested)) {
      throw badRequest("Choose a valid provider status: pending, verified, rejected, or suspended.", { field: "status" });
    }
    return admin.requireAdmin(requireAuth(context), async () => ({
      items: await providers.listProvidersByStatus(requested as (typeof PROVIDER_STATUSES)[number]),
    }));
  });
  post("/api/admin/providers/:id/verify", async (context) => {
    const current = requireAuth(context);
    admin.assertAdmin(current);
    const body = asObject(context.body);
    return await providers.verifyProvider(current, context.params.id, enumValue(body, "decision", ["verify", "reject", "suspend"] as const), optionalString(body, "note"));
  });
  httpGet("/api/admin/credentials/expiring", (context) => {
    const days = Number(queryValue(context, "days") ?? 30);
    return admin.requireAdmin(requireAuth(context), async () => ({
      items: await providers.expiringCredentials(Number.isFinite(days) ? days : 30),
    }));
  });
  post("/api/admin/credentials/suspend-expired", (context) => admin.requireAdmin(requireAuth(context), async () => ({ suspended: await providers.suspendExpiredProviders() })));
}
