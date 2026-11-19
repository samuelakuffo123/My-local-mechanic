import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";

process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = ":memory:";
process.env.GOOGLE_CLIENT_ID = "mechnow-test-client.apps.googleusercontent.com";

test("Google sign-in verifies tokens, links emails, and issues MechNow sessions", async () => {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const scopes = "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile";

  // Stand in for Google's tokeninfo endpoint so no live credential is needed.
  const tokenInfoServer = createServer((req, res) => {
    const token = new URL(req.url ?? "/", "http://localhost").searchParams.get("access_token");
    res.setHeader("content-type", "application/json");
    const claims = {
      aud: clientId,
      azp: clientId,
      scope: scopes,
      exp: Math.floor(Date.now() / 1000) + 600,
    };
    const profiles: Record<string, Record<string, unknown>> = {
      "valid-google-access-token": { sub: "google-sub-1", email: "ama@example.com", email_verified: true, name: "Ama Google" },
      "new-google-access-token": { sub: "google-sub-2", email: "kofi@example.com", email_verified: true, name: "Kofi Google" },
      "wrong-audience-token": { ...claims, azp: "another-client", sub: "google-sub-3", email: "bad@example.com", email_verified: true },
      "unverified-email-token": { ...claims, sub: "google-sub-4", email: "unverified@example.com", email_verified: false },
      "expired-google-token": { ...claims, exp: Math.floor(Date.now() / 1000) - 10, sub: "google-sub-5", email: "old@example.com", email_verified: true },
    };
    const profile = token ? profiles[token] : undefined;
    if (!profile) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "invalid_token" }));
      return;
    }
    res.end(JSON.stringify({ ...claims, ...profile }));
  });
  await new Promise<void>((resolve) => tokenInfoServer.listen(0, "127.0.0.1", resolve));
  const tokenAddress = tokenInfoServer.address();
  if (!tokenAddress || typeof tokenAddress === "string") throw new Error("Expected a TCP address");
  process.env.GOOGLE_TOKENINFO_URL = `http://127.0.0.1:${tokenAddress.port}/tokeninfo`;

  const { openDatabase, closeDatabase, get } = await import("../db.ts");
  const { createRequestHandler } = await import("../http.ts");
  const { authenticateToken } = await import("../auth.ts");
  const { registerRoutes } = await import("../routes.ts");

  openDatabase(":memory:");
  registerRoutes();
  const apiServer = createServer(createRequestHandler({ authenticate: authenticateToken }));
  await new Promise<void>((resolve) => apiServer.listen(0, "127.0.0.1", resolve));
  const address = apiServer.address();
  if (!address || typeof address === "string") throw new Error("Expected a TCP address");
  const base = `http://127.0.0.1:${address.port}`;

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
    return { status: response.status, json: text ? JSON.parse(text) : undefined } as {
      status: number;
      json: Record<string, any>;
    };
  }

  const userCount = () => Number(get<{ count: number }>("SELECT COUNT(*) as count FROM users")?.count ?? 0);

  try {
    const config = await call("/api/auth/google/config");
    assert.equal(config.status, 200);
    assert.deepEqual(config.json, { enabled: true, clientId });

    for (const accessToken of ["wrong-audience-token", "unverified-email-token", "expired-google-token", "not-a-google-token"]) {
      const rejected = await call("/api/auth/google", { body: { accessToken } });
      assert.equal(rejected.status, 401, `${accessToken} is rejected`);
    }
    assert.equal(userCount(), 0, "rejected tokens never create users");

    // A phone account with the same verified email is linked, not duplicated.
    const otp = await call("/api/auth/otp/request", { body: { phone: "0244000001" } });
    const phoneSession = await call("/api/auth/verify", {
      body: { phone: "0244000001", code: otp.json.devCode, name: "Ama" },
    });
    const phoneToken = phoneSession.json.token as string;
    const patched = await call("/api/me", {
      method: "PATCH",
      token: phoneToken,
      body: { email: "ama@example.com" },
    });
    assert.equal(patched.status, 200);

    const linked = await call("/api/auth/google", {
      body: { accessToken: "valid-google-access-token", role: "mechanic" },
    });
    assert.equal(linked.status, 200);
    assert.equal(linked.json.user.id, phoneSession.json.user.id, "verified email links to the existing user");
    assert.equal(linked.json.user.role, "driver", "an existing account's role is not changed");
    assert.equal(userCount(), 1);

    // A new Google identity creates a driver/provider and returns a usable session.
    const created = await call("/api/auth/google", {
      body: { accessToken: "new-google-access-token", role: "mechanic" },
    });
    assert.equal(created.status, 200);
    assert.equal(created.json.user.role, "mechanic");
    assert.equal(created.json.user.email, "kofi@example.com");
    assert.equal(userCount(), 2);
    assert.equal((await call("/api/me", { token: created.json.token })).status, 200);

    const repeat = await call("/api/auth/google", { body: { accessToken: "new-google-access-token" } });
    assert.equal(repeat.json.user.id, created.json.user.id, "the Google subject is stable across sign-ins");
    assert.equal(userCount(), 2, "repeat sign-in does not create another user");
  } finally {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    await new Promise<void>((resolve) => tokenInfoServer.close(() => resolve()));
    closeDatabase();
  }
});
