import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.ALLOW_DEV_PAYMENTS = "true";
process.env.PAYMENTS_PROVIDER = "dev";

test("end-to-end P0 job pipeline", async () => {
  const { openDatabase, closeDatabase } = await import("../db.ts");
  const db = await import("../db.ts");
  const auth = await import("../auth.ts");
  const vehicles = await import("../vehicles.ts");
  const providers = await import("../providers.ts");
  const requests = await import("../serviceRequests.ts");
  const estimates = await import("../estimates.ts");
  const payments = await import("../payments.ts");
  const disputes = await import("../disputes.ts");
  const seed = await import("../seed.ts");
  const admin = await import("../admin.ts");

  openDatabase(":memory:");
  void db;

  const adminId = seed.ensureUser({ phone: "0200000000", name: "Root Admin", role: "admin", password: "admin-password-123" });
  const adminAuth = { userId: adminId, role: "admin" as const, name: "Root Admin" };

  // 1. Driver signs up via OTP (dev code is returned in test env).
  const driverOtp = await auth.requestOtp("0244000001", "127.0.0.1");
  assert.ok(driverOtp.devCode, "dev OTP code is exposed outside production");
  const driverSession = auth.verifyOtp("0244000001", driverOtp.devCode!, { name: "Ama" });
  const driverAuth = { userId: driverSession.user.id, role: driverSession.user.role, name: driverSession.user.name };
  assert.equal(driverAuth.role, "driver");

  // 2. Driver adds a vehicle.
  const vehicle = vehicles.createVehicle(driverAuth, { make: "Hyundai", model: "Elantra", year: 2016, plate: "GR-7788-19", isPrimary: true });
  assert.ok(vehicle?.id);

  // 3. Mechanic signs up and applies as a provider.
  const mechOtp = await auth.requestOtp("0244000002", "127.0.0.1");
  const mechSession = auth.verifyOtp("0244000002", mechOtp.devCode!, { name: "Kofi", role: "mechanic" });
  const mechAuth = { userId: mechSession.user.id, role: mechSession.user.role, name: mechSession.user.name };
  const provider = providers.applyAsProvider(mechAuth, { businessName: "Kofi Auto", type: "mechanic", region: "Greater Accra", serviceAreas: ["Accra"] });
  providers.addCredential(provider.id, { documentType: "business_registration", documentRef: "BR-0001" });

  // Verification requires a credential and admin role.
  const verified = providers.verifyProvider(adminAuth, provider.id, "verify");
  assert.equal(verified.status, "verified");
  providers.setAvailability(mechAuth, true);

  // 4. Driver requests emergency service; the verified provider is eligible.
  const created = requests.createRequest(driverAuth, {
    vehicleId: vehicle!.id,
    kind: "emergency",
    problem: "Engine overheats after 10 minutes of driving.",
    region: "Greater Accra",
  });
  assert.ok(created.eligibleProviderIds.includes(provider.id), "eligible provider is offered the job");

  // 5. Provider accepts and drives the lifecycle up to diagnosis.
  const requestId = created.request!.id;
  requests.acceptRequest(mechAuth, requestId);
  requests.transition(mechAuth, requestId, "enRoute");
  requests.transition(mechAuth, requestId, "arrived");
  requests.transition(mechAuth, requestId, "diagnosing");
  const atApproval = requests.transition(mechAuth, requestId, "awaitingApproval");
  assert.equal(atApproval?.status, "awaitingApproval");

  // 6. Estimate cannot start repair until the customer approves.
  const estimate = estimates.submitEstimate(mechAuth, requestId, {
    items: [
      { kind: "diagnostic", description: "Cooling system diagnosis", unitPriceGhs: 120 },
      { kind: "part", description: "Radiator cap", quantity: 1, unitPriceGhs: 80 },
      { kind: "labour", description: "Flush and refill coolant", unitPriceGhs: 150 },
    ],
  });
  assert.equal(estimate?.totalGhs, 350);
  assert.throws(() => requests.transition(mechAuth, requestId, "repairing"), /approve|approved/i);

  const approved = estimates.approveEstimate(driverAuth, estimate!.id);
  assert.equal(approved?.status, "approved");
  assert.equal(requests.getRequestRaw(requestId)?.status, "repairing");

  // 7. Payment cannot exceed the approved estimate.
  await assert.rejects(
    payments.createIntent(driverAuth, { requestId, amountGhs: 900, method: "momo", idempotencyKey: "idem-over" }),
    /exceeds/i,
  );

  const intent = await payments.createIntent(driverAuth, { requestId, amountGhs: 350, method: "momo", idempotencyKey: "idem-1" });
  assert.equal(intent.payment?.status, "pending");
  // Idempotent replay returns the same payment.
  const replay = await payments.createIntent(driverAuth, { requestId, amountGhs: 350, method: "momo", idempotencyKey: "idem-1" });
  assert.equal(replay.reused, true);
  assert.equal(replay.payment?.id, intent.payment?.id);

  requests.transition(mechAuth, requestId, "completed");
  const paid = payments.confirmDevPayment(driverAuth, intent.payment!.id);
  assert.equal(paid?.status, "paid");

  // 8. Service history links the completed job, approved estimate and payment.
  const history = requests.serviceHistory(driverAuth, vehicle!.id);
  assert.equal(history.length, 1);
  assert.equal(history[0]!.payment?.status, "paid");
  assert.equal(history[0]!.approvedEstimate?.totalGhs, 350);

  // 9. Dispute + admin resolution.
  const dispute = disputes.createDispute(driverAuth, requestId, { category: "overcharge", description: "The bill felt higher than agreed." });
  const resolved = disputes.resolveDispute(adminAuth, dispute!.id, { status: "resolved", resolution: "Reviewed and closed." });
  assert.equal(resolved?.status, "resolved");

  // 10. Admin metrics are live, not fabricated.
  const metrics = admin.platformMetrics();
  assert.equal(metrics.requests.completed, 1);
  assert.equal(metrics.payments.paidCount, 1);
  assert.equal(metrics.payments.paidValueGhs, 350);

  closeDatabase();
});
