import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { request as httpRequest } from "node:http";
import { createHmac } from "node:crypto";

// HTTP-level coverage for the API the client actually uses. The domain pipeline
// test never crosses this boundary, which is how a malformed URL could take the
// process down unnoticed.

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
// Exercise the Paystack webhook path in isolation: no charge is created, only
// signature verification is asserted.
process.env.PAYMENTS_PROVIDER = "paystack";
process.env.PAYSTACK_SECRET_KEY = "sk_test_http_boundary_secret";

test("HTTP boundary: routing, auth, ownership and response shapes", async () => {
  const { openDatabase, closeDatabase } = await import("../db.ts");
  const { createRequestHandler } = await import("../http.ts");
  const { authenticateToken } = await import("../auth.ts");
  const { registerRoutes } = await import("../routes.ts");
  const seed = await import("../seed.ts");

  openDatabase(":memory:");
  registerRoutes();

  const server = createServer(createRequestHandler({ authenticate: authenticateToken }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const port = address.port;
  const base = `http://127.0.0.1:${port}`;

  async function call(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
    const headers: Record<string, string> = {};
    if (init.token) headers.authorization = `Bearer ${init.token}`;
    if (init.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const text = await response.text();
    let json: unknown = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = text;
    }
    return { status: response.status, json: json as Record<string, unknown> & { items?: unknown[] } };
  }

  /** Sends the path verbatim; fetch would re-encode an invalid escape. */
  function rawGet(path: string) {
    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      });
      req.on("error", reject);
      req.end();
    });
  }

  try {
    // --- Health and auth gate ------------------------------------------------
    assert.equal((await call("/api/health")).status, 200);
    assert.equal((await call("/api/vehicles")).status, 401);

    // --- A malformed path is a 400, not a process crash ----------------------
    const malformed = await rawGet("/api/vehicles/%E0%A4%A");
    assert.equal(malformed.status, 400, "malformed URI is rejected as bad input");
    assert.equal((await call("/api/health")).status, 200, "server still alive after a malformed path");

    // --- OTP signup over HTTP ------------------------------------------------
    const otp = await call("/api/auth/otp/request", { body: { phone: "0244000001" } });
    assert.equal(otp.status, 200);
    const devCode = otp.json.devCode as string;
    assert.match(devCode, /^\d{6}$/);

    const verified = await call("/api/auth/verify", {
      body: { phone: "0244000001", code: devCode, name: "Ama" },
    });
    assert.equal(verified.status, 200);
    const token = verified.json.token as string;
    assert.equal(verified.json.user.role, "driver");

    // A wrong code increments attempts and never issues a session.
    const wrong = await call("/api/auth/verify", { body: { phone: "0244000001", code: "000000" } });
    assert.equal(wrong.status, 400);

    // --- Vehicle creation honours the client's `primary` field --------------
    const created = await call("/api/vehicles", {
      token,
      body: { make: "Hyundai", model: "Elantra", year: 2016, plate: "GR-7788-19", primary: true },
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.isPrimary, true, "`primary` from the client is persisted");

    // --- A second user cannot read the first user's vehicle ------------------
    const otherOtp = await call("/api/auth/otp/request", { body: { phone: "0244000009" } });
    const other = await call("/api/auth/verify", {
      body: { phone: "0244000009", code: otherOtp.json.devCode, name: "Kwesi" },
    });
    const otherToken = other.json.token as string;
    const idor = await call(`/api/vehicles/${created.json.id as string}`, { token: otherToken });
    assert.equal(idor.status, 403, "vehicles are scoped to their owner");

    // --- Provider credentials stay private -----------------------------------
    const adminId = seed.ensureUser({ phone: "0200000000", name: "Root Admin", role: "admin", password: "admin-password-123" });
    const adminLogin = await call("/api/auth/login", { body: { phone: "0200000000", password: "admin-password-123" } });
    assert.equal(adminLogin.status, 200);
    const adminToken = adminLogin.json.token as string;
    assert.ok(adminId);

    const mechOtp = await call("/api/auth/otp/request", { body: { phone: "0244000002" } });
    const mech = await call("/api/auth/verify", {
      body: { phone: "0244000002", code: mechOtp.json.devCode, name: "Kofi", role: "mechanic" },
    });
    const mechToken = mech.json.token as string;
    const applied = await call("/api/providers/apply", {
      token: mechToken,
      body: { businessName: "Kofi Auto", type: "mechanic", region: "Greater Accra" },
    });
    const providerId = applied.json.id as string;
    await call("/api/providers/me/credentials", {
      token: mechToken,
      body: { documentType: "national_id", documentRef: "GHA-123456789" },
    });

    const asOwner = await call(`/api/providers/${providerId}`, { token: mechToken });
    assert.equal((asOwner.json.credentials as unknown[]).length, 1, "owner sees their own documents");
    const asCustomer = await call(`/api/providers/${providerId}`, { token: otherToken });
    assert.deepEqual(asCustomer.json.credentials, [], "other users never see identity documents");

    // --- Admin endpoints agree with the client on `{ items }` ---------------
    for (const path of [
      "/api/admin/dispatch",
      "/api/admin/audit",
      "/api/admin/users",
      "/api/admin/providers?status=pending",
      "/api/admin/credentials/expiring",
      "/api/admin/requests",
    ]) {
      const result = await call(path, { token: adminToken });
      assert.equal(result.status, 200, `${path} succeeds for an admin`);
      assert.ok(Array.isArray(result.json.items), `${path} returns { items: [] }`);
    }
    assert.equal((await call("/api/admin/users", { token })).status, 403, "admin routes are admin-only");

    // --- Login attempts are throttled ---------------------------------------
    let sawTooMany = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await call("/api/auth/login", { body: { phone: "0244000001", password: "wrong-password" } });
      if (result.status === 429) {
        sawTooMany = true;
        break;
      }
    }
    assert.ok(sawTooMany, "repeated bad logins are rate limited");

    // --- Webhook signatures --------------------------------------------------
    const sign = (body: string) => createHmac("sha512", "sk_test_http_boundary_secret").update(body, "utf8").digest("hex");
    const sendWebhook = (body: string, signature?: string) =>
      fetch(`${base}/api/payments/webhook/paystack`, {
        method: "POST",
        headers: signature
          ? { "content-type": "application/json", "x-paystack-signature": signature }
          : { "content-type": "application/json" },
        body,
      });

    const payload = '{"event":"charge.success","data":{"reference":"x","status":"success"}}';
    assert.equal((await sendWebhook(payload)).status, 403, "unsigned webhooks are refused");
    assert.equal((await sendWebhook(payload, sign(payload))).status, 200, "a correctly signed webhook is accepted");

    // The signature covers the exact bytes, so re-serialising must not validate.
    const reordered = JSON.stringify(JSON.parse(payload), null, 2);
    assert.equal(
      (await sendWebhook(reordered, sign(payload))).status,
      403,
      "signature is verified over the raw body, not a re-serialisation",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    closeDatabase();
  }
});
