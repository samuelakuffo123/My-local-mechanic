import { get as httpGet, post, patch, del, type RequestContext } from "./http.ts";
import { run } from "./db.ts";
import { nowIso } from "./util.ts";
import { unauthorized, badRequest } from "./errors.ts";
import * as auth from "./auth.ts";
import * as vehicles from "./vehicles.ts";
import * as providers from "./providers.ts";
import * as requests from "./serviceRequests.ts";
import * as estimates from "./estimates.ts";
import * as payments from "./payments.ts";
import * as disputes from "./disputes.ts";
import * as notifications from "./notifications.ts";
import * as admin from "./admin.ts";
import { asObject, enumValue, optionalArray, optionalString, requireNumber, requireString } from "./validation.ts";
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
    return auth.requestOtp(requireString(body, "phone"), context.ip);
  }, true);

  post("/api/auth/verify", (context) => {
    const body = asObject(context.body);
    const name = optionalString(body, "name");
    const role = optionalString(body, "role") as AuthContext["role"] | undefined;
    return auth.verifyOtp(requireString(body, "phone"), requireString(body, "code"), { name, role });
  }, true);

  post("/api/auth/login", (context) => {
    const body = asObject(context.body);
    const userId = auth.checkPassword(requireString(body, "phone"), requireString(body, "password"));
    if (!userId) throw unauthorized("Incorrect phone number or password.");
    return auth.createSession(userId);
  }, true);

  post("/api/auth/logout", (context) => {
    requireAuth(context);
    const header = context.req.headers.authorization;
    if (header?.startsWith("Bearer ")) auth.logout(header.slice(7).trim());
    return undefined;
  });

  httpGet("/api/me", (context) => {
    const user = auth.getUser(requireAuth(context).userId);
    const provider = providers.getProviderForUser(requireAuth(context).userId);
    return { user, provider };
  });

  patch("/api/me", (context) => {
    const current = requireAuth(context);
    const body = asObject(context.body);
    const user = auth.getUser(current.userId);
    if (!user) throw unauthorized();
    const name = optionalString(body, "name") ?? user.name;
    const email = optionalString(body, "email") ?? user.email;
    run("UPDATE users SET name = ?, email = ?, updated_at = ? WHERE id = ?", [name, email, nowIso(), current.userId]);
    return auth.getUser(current.userId);
  });

  post("/api/me/password", (context) => {
    const current = requireAuth(context);
    const body = asObject(context.body);
    auth.setPassword(current.userId, requireString(body, "password", { min: 8, max: 128 }));
    return { ok: true };
  });

  // --- Vehicles ----------------------------------------------------------
  httpGet("/api/vehicles", (context) => ({ items: vehicles.listVehicles(requireAuth(context).userId) }));
  post("/api/vehicles", (context) => vehicles.createVehicle(requireAuth(context), asObject(context.body)));
  httpGet("/api/vehicles/:id", (context) => vehicles.getVehicle(context.params.id));
  patch("/api/vehicles/:id", (context) => vehicles.updateVehicle(requireAuth(context), context.params.id, asObject(context.body)));
  del("/api/vehicles/:id", (context) => vehicles.deleteVehicle(requireAuth(context), context.params.id));
  httpGet("/api/vehicles/:id/history", (context) => ({ items: requests.serviceHistory(requireAuth(context), context.params.id) }));

  // --- Providers ---------------------------------------------------------
  httpGet("/api/providers", (context) => ({
    items: providers.eligibleProviders(
      (queryValue(context, "kind") as "emergency" | "booking" | "tow") ?? "emergency",
      queryValue(context, "region") ?? null,
    ),
  }));

  post("/api/providers/apply", (context) => {
    const body = asObject(context.body);
    return providers.applyAsProvider(requireAuth(context), {
      businessName: requireString(body, "businessName"),
      type: enumValue(body, "type", ["mechanic", "tow", "vendor"] as const),
      region: optionalString(body, "region"),
      serviceAreas: optionalArray<string>(body, "serviceAreas"),
    });
  });

  httpGet("/api/providers/me", (context) => {
    const current = requireAuth(context);
    const provider = providers.getProviderForUser(current.userId);
    return { provider, credentials: provider ? providers.providerCredentials(provider.id) : [] };
  });

  post("/api/providers/me/availability", (context) => {
    const body = asObject(context.body);
    return providers.setAvailability(requireAuth(context), Boolean(body.available));
  });

  post("/api/providers/me/credentials", (context) => {
    const current = requireAuth(context);
    const provider = providers.getProviderForUser(current.userId);
    if (!provider) throw badRequest("Create a provider profile first.");
    const body = asObject(context.body);
    return providers.addCredential(provider.id, {
      documentType: requireString(body, "documentType"),
      documentRef: requireString(body, "documentRef"),
      expiresAt: optionalString(body, "expiresAt") ?? null,
    });
  });

  httpGet("/api/providers/:id", (context) => {
    const provider = providers.getProviderById(context.params.id);
    return { provider, credentials: provider ? providers.providerCredentials(provider.id) : [] };
  });

  // --- Service requests --------------------------------------------------
  post("/api/service-requests", (context) => {
    const body = asObject(context.body);
    return requests.createRequest(requireAuth(context), {
      vehicleId: requireString(body, "vehicleId"),
      kind: enumValue(body, "kind", ["emergency", "booking", "tow"] as const),
      problem: requireString(body, "problem", { min: 4, max: 2000 }),
      location: body.location as { label?: string; lat?: number; lng?: number } | undefined,
      region: optionalString(body, "region"),
      providerId: optionalString(body, "providerId"),
    });
  });

  httpGet("/api/service-requests", (context) => requests.listRequests(requireAuth(context)));
  httpGet("/api/service-requests/:id", (context) => requests.getRequest(requireAuth(context), context.params.id));
  httpGet("/api/service-requests/:id/events", (context) => ({ items: requests.listEvents(requireAuth(context), context.params.id) }));
  httpGet("/api/service-requests/:id/actions", (context) => ({ actions: requests.availableActions(requireAuth(context), context.params.id) }));

  post("/api/service-requests/:id/assign", (context) => {
    const body = asObject(context.body);
    return requests.assignProvider(requireAuth(context), context.params.id, requireString(body, "providerId"));
  });
  post("/api/service-requests/:id/accept", (context) => requests.acceptRequest(requireAuth(context), context.params.id));
  post("/api/service-requests/:id/decline", (context) => {
    const body = asObject(context.body);
    return requests.declineRequest(requireAuth(context), context.params.id, optionalString(body, "reason"));
  });
  post("/api/service-requests/:id/transition", (context) => {
    const body = asObject(context.body);
    const to = enumValue(body, "to", [
      "accepted", "enRoute", "arrived", "diagnosing", "awaitingApproval", "repairing", "awaitingParts", "completed", "cancelled",
    ] as const) as RequestStatus;
    return requests.transition(requireAuth(context), context.params.id, to, optionalString(body, "note"));
  });
  post("/api/service-requests/:id/cancel", (context) => {
    const body = asObject(context.body);
    return requests.cancelRequest(requireAuth(context), context.params.id, optionalString(body, "reason") ?? "");
  });

  // --- Estimates ---------------------------------------------------------
  post("/api/service-requests/:id/estimates", (context) => {
    const body = asObject(context.body);
    const items = (optionalArray(body, "items") ?? []) as estimates.LineItemInput[];
    return estimates.submitEstimate(requireAuth(context), context.params.id, { items, note: optionalString(body, "note") });
  });
  httpGet("/api/service-requests/:id/estimates", (context) => ({ items: estimates.listEstimates(requireAuth(context), context.params.id) }));
  httpGet("/api/service-requests/:id/estimate-summary", (context) => estimates.getEstimateSummary(requireAuth(context), context.params.id));
  post("/api/estimates/:id/approve", (context) => estimates.approveEstimate(requireAuth(context), context.params.id));
  post("/api/estimates/:id/reject", (context) => {
    const body = asObject(context.body);
    return estimates.rejectEstimate(requireAuth(context), context.params.id, optionalString(body, "reason"));
  });

  // --- Payments ----------------------------------------------------------
  post("/api/payments/intent", (context) => {
    const body = asObject(context.body);
    return payments.createIntent(requireAuth(context), {
      requestId: requireString(body, "requestId"),
      amountGhs: requireNumber(body, "amountGhs", { min: 0.01 }),
      method: enumValue(body, "method", ["momo", "cash", "card"] as const),
      idempotencyKey: requireString(body, "idempotencyKey"),
      customerPhone: optionalString(body, "customerPhone"),
    });
  });
  httpGet("/api/payments", (context) => ({ items: payments.listPayments(requireAuth(context), queryValue(context, "requestId")) }));
  httpGet("/api/payments/:id", (context) => payments.getPayment(requireAuth(context), context.params.id));
  post("/api/payments/:id/confirm-dev", (context) => payments.confirmDevPayment(requireAuth(context), context.params.id));
  post("/api/payments/:id/refund", (context) => {
    const body = asObject(context.body);
    return payments.requestRefund(requireAuth(context), context.params.id, requireNumber(body, "amountGhs", { min: 0.01 }), requireString(body, "reason"));
  });
  post("/api/payments/webhook/:provider", (context) => {
    const raw = JSON.stringify(context.body ?? {});
    const signature = context.req.headers["x-paystack-signature"];
    return payments.handleWebhook(context.params.provider, raw, typeof signature === "string" ? signature : undefined);
  }, true);

  // --- Disputes ----------------------------------------------------------
  post("/api/service-requests/:id/disputes", (context) => {
    const body = asObject(context.body);
    return disputes.createDispute(requireAuth(context), context.params.id, {
      category: requireString(body, "category"),
      description: requireString(body, "description", { min: 10 }),
    });
  });
  httpGet("/api/disputes", (context) => ({ items: disputes.listDisputes(requireAuth(context), queryValue(context, "status")) }));
  post("/api/disputes/:id/resolve", (context) => {
    const body = asObject(context.body);
    return disputes.resolveDispute(requireAuth(context), context.params.id, {
      status: enumValue(body, "status", ["resolved", "rejected", "investigating"] as const),
      resolution: optionalString(body, "resolution"),
    });
  });

  // --- Notifications -----------------------------------------------------
  httpGet("/api/notifications", (context) => ({ items: notifications.listNotifications(requireAuth(context).userId) }));
  post("/api/notifications/:id/read", (context) => {
    notifications.markRead(requireAuth(context).userId, context.params.id);
    return { ok: true };
  });

  // --- Admin -------------------------------------------------------------
  httpGet("/api/admin/metrics", (context) => admin.requireAdmin(requireAuth(context), admin.platformMetrics));
  httpGet("/api/admin/dispatch", (context) => admin.requireAdmin(requireAuth(context), admin.dispatchMonitor));
  httpGet("/api/admin/audit", (context) => admin.requireAdmin(requireAuth(context), () => admin.listAuditLogs(Number(queryValue(context, "limit") ?? 100))));
  httpGet("/api/admin/users", (context) => admin.requireAdmin(requireAuth(context), () => auth.listUsers(queryValue(context, "role") as AuthContext["role"] | undefined)));
  httpGet("/api/admin/requests", (context) =>
    admin.requireAdmin(requireAuth(context), () => admin.allRequests(queryValue(context, "status"))),
  );
  httpGet("/api/admin/providers", (context) =>
    admin.requireAdmin(requireAuth(context), () => providers.listProvidersByStatus((queryValue(context, "status") as never) ?? ("pending" as never))),
  );
  post("/api/admin/providers/:id/verify", (context) => {
    const current = requireAuth(context);
    admin.assertAdmin(current);
    const body = asObject(context.body);
    return providers.verifyProvider(current, context.params.id, enumValue(body, "decision", ["verify", "reject", "suspend"] as const), optionalString(body, "note"));
  });
  httpGet("/api/admin/credentials/expiring", (context) => {
    const days = Number(queryValue(context, "days") ?? 30);
    return admin.requireAdmin(requireAuth(context), () => providers.expiringCredentials(Number.isFinite(days) ? days : 30));
  });
  post("/api/admin/credentials/suspend-expired", (context) => admin.requireAdmin(requireAuth(context), () => ({ suspended: providers.suspendExpiredProviders() })));
}
