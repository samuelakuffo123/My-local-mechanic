import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApiServer } from "./api.mjs";

const origin = "http://localhost:8443";
const api = createApiServer({ databasePath: ":memory:", origins: [origin], secureCookies: false });
let baseUrl;
let driverCookie;
let secondDriverCookie;
let bookingId;
let threadId;

function request(path, { method = "GET", body, cookie, requestOrigin = origin } = {}) {
  return fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(requestOrigin ? { Origin: requestOrigin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function createDriver(email, phone) {
  const response = await request("/auth/register", {
    method: "POST",
    body: { name: "Test Driver", email, phone, password: "correct horse battery" },
  });
  assert.equal(response.status, 201);
  return response.headers.get("set-cookie").split(";")[0];
}

before(async () => {
  await new Promise((resolve) => api.server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${api.server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => api.server.close((error) => error ? reject(error) : resolve()));
  api.close();
});

test("unauthenticated requests are denied and security headers are present", async () => {
  const response = await request("/bookings");
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("state-changing requests reject untrusted origins", async () => {
  const response = await request("/auth/register", {
    method: "POST",
    requestOrigin: "https://attacker.example",
    body: { name: "Test Driver", email: "attacker@example.com", phone: "+233241234501", password: "correct horse battery" },
  });
  assert.equal(response.status, 403);
});

test("registration, login, and session restoration return only public user fields", async () => {
  driverCookie = await createDriver("driver@example.com", "+233 24 123 4501");
  const me = await request("/auth/me", { cookie: driverCookie });
  assert.equal(me.status, 200);
  const { user } = await me.json();
  assert.equal(user.email, "driver@example.com");
  assert.equal(user.role, "driver");
  assert.equal("password_hash" in user, false);

  const login = await request("/auth/login", {
    method: "POST",
    body: { identifier: "driver@example.com", password: "correct horse battery" },
  });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);

  const wrongPassword = await request("/auth/login", {
    method: "POST",
    body: { identifier: "driver@example.com", password: "incorrect password" },
  });
  const missingUser = await request("/auth/login", {
    method: "POST",
    body: { identifier: "missing@example.com", password: "incorrect password" },
  });
  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(await wrongPassword.json(), await missingUser.json());

  const duplicate = await request("/auth/register", {
    method: "POST",
    body: { name: "Another Driver", email: "driver@example.com", phone: "+233241234502", password: "correct horse battery" },
  });
  assert.equal(duplicate.status, 409);
});

test("bookings, payments, and chat are scoped to their owner", async () => {
  secondDriverCookie = await createDriver("second@example.com", "+233241234503");
  const vehicleResponse = await request("/vehicles", {
    method: "POST",
    cookie: driverCookie,
    body: { make: "Toyota", model: "Corolla", year: 2020, plate: "GR 1234-20", mileageKm: 42000, primary: true },
  });
  assert.equal(vehicleResponse.status, 201);
  const vehicle = await vehicleResponse.json();
  assert.equal(vehicle.primary, true);
  const vehicles = await request("/vehicles", { cookie: driverCookie });
  assert.equal((await vehicles.json()).length, 1);

  const strangerVehicle = await request(`/vehicles/${vehicle.id}`, { method: "DELETE", cookie: secondDriverCookie });
  assert.equal(strangerVehicle.status, 404);

  const booking = await request("/bookings", {
    method: "POST",
    cookie: driverCookie,
    body: { providerId: "provider-1", vehicleId: vehicle.id, startsAt: "2026-11-08T10:00:00Z", service: "Brake inspection" },
  });
  assert.equal(booking.status, 201);
  bookingId = (await booking.json()).id;

  const otherBookings = await request("/bookings", { cookie: secondDriverCookie });
  assert.deepEqual(await otherBookings.json(), []);

  const thread = await request("/chat/threads", { method: "POST", cookie: driverCookie, body: { bookingId } });
  assert.equal(thread.status, 201);
  threadId = (await thread.json()).id;

  const forgedSender = await request(`/chat/threads/${threadId}/messages`, {
    method: "POST",
    cookie: driverCookie,
    body: { body: "Hello", senderId: "admin" },
  });
  const message = await forgedSender.json();
  assert.equal(forgedSender.status, 201);
  assert.notEqual(message.senderId, "admin");

  const inaccessibleChat = await request(`/chat/threads/${threadId}/messages`, { cookie: secondDriverCookie });
  assert.equal(inaccessibleChat.status, 404);

  const payment = await request("/payments", {
    method: "POST",
    cookie: driverCookie,
    body: { amountGhs: 88, idempotencyKey: "booking-payment-001" },
  });
  assert.equal(payment.status, 201);
  const paymentData = await payment.json();
  assert.equal(paymentData.status, "pending");

  const retry = await request("/payments", {
    method: "POST",
    cookie: driverCookie,
    body: { amountGhs: 88, idempotencyKey: "booking-payment-001" },
  });
  assert.equal((await retry.json()).id, paymentData.id);

  const conflictingRetry = await request("/payments", {
    method: "POST",
    cookie: driverCookie,
    body: { amountGhs: 89, idempotencyKey: "booking-payment-001" },
  });
  assert.equal(conflictingRetry.status, 409);
});

test("emergency requests are scoped to their owner and inputs are validated", async () => {
  const emergency = {
    id: "request-001",
    status: "searching",
    createdAt: "2026-11-07T10:00:00Z",
    updatedAt: "2026-11-07T10:00:00Z",
    problem: "Flat tire",
    location: { label: "Accra", lat: 5.6037, lng: -0.187 },
  };
  const saved = await request("/emergency", { method: "PUT", cookie: driverCookie, body: emergency });
  assert.equal(saved.status, 200);
  const restored = await (await request("/emergency", { cookie: driverCookie })).json();
  assert.equal(restored.id, emergency.id);
  assert.deepEqual(restored.location, emergency.location);

  const manualLocation = await request("/emergency", {
    method: "PUT",
    cookie: driverCookie,
    body: { ...emergency, id: "request-003", status: "requested", location: { label: "Near Accra Mall" } },
  });
  assert.equal(manualLocation.status, 200);
  assert.deepEqual((await manualLocation.json()).location, { label: "Near Accra Mall" });

  const partialCoordinates = await request("/emergency", {
    method: "PUT",
    cookie: driverCookie,
    body: { ...emergency, id: "request-004", location: { label: "Accra", lat: 5.6037 } },
  });
  assert.equal(partialCoordinates.status, 400);

  const strangerCancel = await request("/emergency/cancel", {
    method: "POST",
    cookie: secondDriverCookie,
    body: { id: emergency.id },
  });
  assert.equal(strangerCancel.status, 404);

  const invalidLocation = await request("/emergency", {
    method: "PUT",
    cookie: driverCookie,
    body: { ...emergency, id: "request-002", location: { label: "Elsewhere", lat: 900, lng: 0 } },
  });
  assert.equal(invalidLocation.status, 400);

  const cancelled = await request("/emergency/cancel", {
    method: "POST",
    cookie: driverCookie,
    body: { id: emergency.id },
  });
  assert.equal((await cancelled.json()).status, "cancelled");
});

test("public catalog endpoints validate query values and rate-limit login", async () => {
  const providers = await request("/providers?radiusKm=5");
  assert.equal(providers.status, 200);
  const invalidRadius = await request("/providers?radiusKm=Infinity");
  assert.equal(invalidRadius.status, 400);
  assert.deepEqual(await (await request("/parts?q=brake")).json(), []);
  const estimate = await request("/tow/estimate", {
    method: "POST",
    body: { distanceKm: 10, type: "flatbed" },
  });
  assert.equal((await estimate.json()).totalGhs, 400);
  const invalidEstimate = await request("/tow/estimate", {
    method: "POST",
    body: { distanceKm: -1, type: "flatbed" },
  });
  assert.equal(invalidEstimate.status, 400);

  const cartSave = await request("/cart", {
    method: "PUT",
    cookie: driverCookie,
    body: { items: [{ productId: "part-1", quantity: 2 }] },
  });
  assert.equal(cartSave.status, 200);
  assert.deepEqual(await (await request("/cart", { cookie: driverCookie })).json(), [{ productId: "part-1", quantity: 2 }]);

  for (let attempt = 0; attempt < 10; attempt++) {
    const response = await request("/auth/login", {
      method: "POST",
      body: { identifier: "not-an-account@example.com", password: "wrong" },
    });
    assert.equal(response.status, 401);
  }
  const limited = await request("/auth/login", {
    method: "POST",
    body: { identifier: "not-an-account@example.com", password: "wrong" },
  });
  assert.equal(limited.status, 429);
});

test("logout revokes the server session", async () => {
  const logout = await request("/auth/logout", { method: "POST", cookie: driverCookie });
  assert.equal(logout.status, 200);
  const me = await request("/auth/me", { cookie: driverCookie });
  assert.equal(me.status, 401);
});
