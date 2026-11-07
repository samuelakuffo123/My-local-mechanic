import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scrypt = promisify(scryptCallback);
const sessionLifetimeSeconds = 60 * 60 * 24 * 7;
const maxBodyBytes = 16 * 1024;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?\d{7,15}$/;
const emergencyStatuses = new Set([
  "idle", "choosingProblem", "locating", "searching", "results", "confirming", "requested",
  "providerDeclined", "noProvider", "matched", "enRoute", "nearby", "arrived", "diagnosing",
  "awaitingApproval", "repairing", "awaitingParts", "completed", "paying", "paid",
  "reviewed", "cancelled", "offline",
]);

const providers = [
  { id: "provider-1", name: "Kojo AutoCare", type: "mechanic", distanceKm: 1.8, etaMinutes: 7, rating: 4.9, reliability: 96, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
  { id: "provider-2", name: "Nii's Mobile Garage", type: "mechanic", distanceKm: 2.5, etaMinutes: 9, rating: 4.82, reliability: 94, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
  { id: "provider-3", name: "Adom Motors", type: "mechanic", distanceKm: 3.2, etaMinutes: 11, rating: 4.74, reliability: 92, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
  { id: "provider-4", name: "RoadLift Ghana", type: "tow", distanceKm: 3.9, etaMinutes: 13, rating: 4.66, reliability: 90, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
  { id: "provider-5", name: "Tema Motor Works", type: "mechanic", distanceKm: 4.6, etaMinutes: 15, rating: 4.58, reliability: 88, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
  { id: "provider-6", name: "Akwaaba Auto", type: "mechanic", distanceKm: 5.3, etaMinutes: 17, rating: 4.5, reliability: 86, services: ["diagnostics", "battery", "brakes"], phone: "+233 24 123 4567" },
];

const products = [];

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, "");
}

function publicUser(user) {
  return { id: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role };
}

function parseCookies(header = "") {
  const cookies = new Map();
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0) cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return cookies;
}

function makeSessionCookie(token, secure) {
  return `mechnow_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifetimeSeconds}${secure ? "; Secure" : ""}`;
}

function validateString(value, label, min, max) {
  if (typeof value !== "string") throw new ApiError(400, `${label} is required.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw new ApiError(400, `${label} must be ${min}-${max} characters.`);
  return normalized;
}

function validateIdentifier(value, label) {
  return validateString(value, label, 1, 128);
}

function validateEmail(value) {
  const email = validateString(value, "Email address", 3, 254).toLowerCase();
  if (!emailPattern.test(email)) throw new ApiError(400, "Enter a valid email address.");
  return email;
}

function validatePhone(value) {
  const phone = normalizePhone(validateString(value, "Phone number", 7, 32));
  if (!phonePattern.test(phone)) throw new ApiError(400, "Enter a valid phone number.");
  return phone;
}

function parseDate(value, label) {
  const date = new Date(value);
  if (typeof value !== "string" || Number.isNaN(date.getTime())) throw new ApiError(400, `${label} must be a valid date.`);
  return date.toISOString();
}

function initDatabase(path) {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") process.umask(0o077);
  }
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'driver' CHECK (role = 'driver'),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider_id TEXT NOT NULL,
      vehicle_id TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      service TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS bookings_user_date ON bookings(user_id, starts_at);
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1950 AND 2100),
      plate TEXT NOT NULL,
      mileage_km INTEGER NOT NULL CHECK (mileage_km >= 0),
      is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS vehicles_user ON vehicles(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS vehicles_one_primary ON vehicles(user_id) WHERE is_primary = 1;
    CREATE TABLE IF NOT EXISTS emergencies (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS emergencies_user_date ON emergencies(user_id, updated_at);
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_ghs REAL NOT NULL CHECK (amount_ghs > 0),
      status TEXT NOT NULL CHECK (status = 'pending'),
      idempotency_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, idempotency_key)
    );
    CREATE TABLE IF NOT EXISTS carts (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      items TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_threads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'sent' CHECK (state = 'sent')
    );
    CREATE INDEX IF NOT EXISTS chat_thread_date ON chat_messages(thread_id, created_at);
  `);
  if (path !== ":memory:" && process.platform !== "win32") chmodSync(path, 0o600);
  return db;
}

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
  response.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
  response.setHeader("Cache-Control", "no-store");
}

function makeRateLimiter({ limit, windowMs, maxEntries = 10000 }) {
  const attempts = new Map();
  return (key) => {
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      if (attempts.size >= maxEntries) {
        for (const [entry, value] of attempts) if (value.resetAt <= now) attempts.delete(entry);
        if (attempts.size >= maxEntries) throw new ApiError(429, "Too many requests. Try again shortly.");
      }
      attempts.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= limit) throw new ApiError(429, "Too many requests. Try again shortly.");
    current.count++;
  };
}

export function createApiServer({
  databasePath = process.env.DATABASE_PATH ?? resolve("data/mechnow.sqlite"),
  origins = (process.env.APP_ORIGINS ?? process.env.APP_ORIGIN ?? "http://localhost:8443,http://127.0.0.1:8443")
    .split(",").map((origin) => origin.trim()).filter(Boolean),
  secureCookies = process.env.NODE_ENV === "production",
} = {}) {
  const db = initDatabase(databasePath);
  const rateLimitLogin = makeRateLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
  const rateLimitLoginIp = makeRateLimiter({ limit: 40, windowMs: 15 * 60 * 1000 });
  const rateLimitSignup = makeRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });
  const statements = {
    getUserById: db.prepare("SELECT id, name, phone, email, role FROM users WHERE id = ?"),
    getUserByIdentifier: db.prepare("SELECT * FROM users WHERE email = ? OR phone = ?"),
    insertUser: db.prepare("INSERT INTO users (id, name, phone, email, role, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, 'driver', ?, ?, ?)"),
    insertSession: db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)"),
    getSession: db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?"),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    listBookings: db.prepare("SELECT id, provider_id AS providerId, vehicle_id AS vehicleId, starts_at AS startsAt, service FROM bookings WHERE user_id = ? ORDER BY starts_at DESC"),
    vehicleExists: db.prepare("SELECT 1 FROM vehicles WHERE id = ? AND user_id = ?"),
    getBooking: db.prepare("SELECT id, provider_id AS providerId, vehicle_id AS vehicleId, starts_at AS startsAt, service FROM bookings WHERE id = ? AND user_id = ?"),
    insertBooking: db.prepare("INSERT INTO bookings (id, user_id, provider_id, vehicle_id, starts_at, service, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"),
    listPayments: db.prepare("SELECT id, amount_ghs AS amountGhs, status, idempotency_key AS idempotencyKey, created_at AS createdAt FROM payments WHERE user_id = ? ORDER BY created_at DESC"),
    getPaymentByKey: db.prepare("SELECT id, amount_ghs AS amountGhs, status, idempotency_key AS idempotencyKey, created_at AS createdAt FROM payments WHERE user_id = ? AND idempotency_key = ?"),
    insertPayment: db.prepare("INSERT INTO payments (id, user_id, amount_ghs, status, idempotency_key, created_at) VALUES (?, ?, ?, 'pending', ?, ?)"),
  };

  function requireUser(request) {
    const token = parseCookies(request.headers.cookie).get("mechnow_session");
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new ApiError(401, "Sign in to continue.");
    const session = statements.getSession.get(hashToken(token), Date.now());
    if (!session) throw new ApiError(401, "Your session has expired. Sign in again.");
    const user = statements.getUserById.get(session.user_id);
    if (!user) throw new ApiError(401, "Your session is no longer valid. Sign in again.");
    return user;
  }

  async function readJson(request) {
    const contentType = request.headers["content-type"]?.split(";")[0].trim().toLowerCase();
    if (contentType !== "application/json") throw new ApiError(415, "Send a JSON request.");
    const declaredLength = Number(request.headers["content-length"] ?? 0);
    if (declaredLength > maxBodyBytes) throw new ApiError(413, "Request body is too large.");
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > maxBodyBytes) throw new ApiError(413, "Request body is too large.");
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!value || Array.isArray(value) || typeof value !== "object") throw new Error("Expected an object");
      return value;
    } catch {
      throw new ApiError(400, "Request body must be a valid JSON object.");
    }
  }

  function send(response, status, payload) {
    response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
  }

  function requireTrustedOrigin(request) {
    const origin = request.headers.origin;
    if (!origin || !origins.includes(origin)) throw new ApiError(403, "This request origin is not allowed.");
  }

  async function handle(request, response) {
    setSecurityHeaders(response);
    try {
      if (!request.url || !request.url.startsWith("/api/")) throw new ApiError(404, "Not found.");
      const url = new URL(request.url, "http://api.local");
      const method = request.method ?? "GET";
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) requireTrustedOrigin(request);
      if (method === "GET" && url.pathname === "/api/health") {
        send(response, 200, { status: "ok" });
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/register") {
        rateLimitSignup(request.socket.remoteAddress ?? "unknown");
        const body = await readJson(request);
        const name = validateString(body.name, "Name", 2, 100);
        const phone = validatePhone(body.phone);
        const email = validateEmail(body.email);
        if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
          throw new ApiError(400, "Use a password with 8-128 characters.");
        }
        const salt = randomBytes(16);
        const passwordHash = await scrypt(body.password, salt, 64, { maxmem: 64 * 1024 * 1024 });
        const user = { id: randomBytes(16).toString("hex"), name, phone, email, role: "driver" };
        try {
          statements.insertUser.run(user.id, name, phone, email, salt.toString("hex"), passwordHash.toString("hex"), new Date().toISOString());
        } catch (error) {
          if (String(error.message).includes("UNIQUE constraint failed")) throw new ApiError(409, "An account already uses that phone number or email address.");
          throw error;
        }
        const token = randomBytes(32).toString("hex");
        statements.insertSession.run(hashToken(token), user.id, Date.now() + sessionLifetimeSeconds * 1000);
        response.setHeader("Set-Cookie", makeSessionCookie(token, secureCookies));
        send(response, 201, { user });
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/login") {
        const body = await readJson(request);
        const identifier = validateString(body.identifier, "Email or phone", 1, 254).toLowerCase();
        const remoteAddress = request.socket.remoteAddress ?? "unknown";
        rateLimitLoginIp(remoteAddress);
        rateLimitLogin(`${remoteAddress}:${identifier}`);
        if (typeof body.password !== "string" || body.password.length > 128) throw new ApiError(401, "Email or password is incorrect.");
        const normalizedPhone = normalizePhone(identifier);
        const account = statements.getUserByIdentifier.get(identifier, normalizedPhone);
        const salt = account ? Buffer.from(account.password_salt, "hex") : Buffer.alloc(16);
        const candidate = await scrypt(body.password, salt, 64, { maxmem: 64 * 1024 * 1024 });
        const expected = account ? Buffer.from(account.password_hash, "hex") : Buffer.alloc(64);
        if (!account || expected.length !== candidate.length || !timingSafeEqual(expected, candidate)) {
          throw new ApiError(401, "Email or password is incorrect.");
        }
        const token = randomBytes(32).toString("hex");
        statements.insertSession.run(hashToken(token), account.id, Date.now() + sessionLifetimeSeconds * 1000);
        response.setHeader("Set-Cookie", makeSessionCookie(token, secureCookies));
        send(response, 200, { user: publicUser(account) });
        return;
      }

      if (method === "POST" && url.pathname === "/api/auth/logout") {
        const token = parseCookies(request.headers.cookie).get("mechnow_session");
        if (token && /^[a-f0-9]{64}$/.test(token)) statements.deleteSession.run(hashToken(token));
        response.setHeader("Set-Cookie", `mechnow_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookies ? "; Secure" : ""}`);
        send(response, 200, { ok: true });
        return;
      }

      if (method === "GET" && url.pathname === "/api/auth/me") {
        const user = requireUser(request);
        send(response, 200, { user: publicUser(user) });
        return;
      }

      if (method === "GET" && url.pathname === "/api/providers") {
        const radiusKm = url.searchParams.has("radiusKm") ? Number(url.searchParams.get("radiusKm")) : 5;
        if (!Number.isFinite(radiusKm) || radiusKm < 0 || radiusKm > 100) throw new ApiError(400, "Radius must be between 0 and 100 km.");
        send(response, 200, providers.filter((provider) => provider.distanceKm <= radiusKm));
        return;
      }
      const providerMatch = url.pathname.match(/^\/api\/providers\/([^/]+)$/);
      if (method === "GET" && providerMatch) {
        let providerId;
        try { providerId = decodeURIComponent(providerMatch[1]); } catch { throw new ApiError(400, "Invalid provider ID."); }
        send(response, 200, providers.find((provider) => provider.id === providerId) ?? null);
        return;
      }

      if (method === "GET" && url.pathname === "/api/parts") {
        const query = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        if (query.length > 100) throw new ApiError(400, "Search query must be 100 characters or fewer.");
        send(response, 200, products.filter((product) => product.name.toLowerCase().includes(query)));
        return;
      }

      if (method === "POST" && url.pathname === "/api/tow/estimate") {
        const body = await readJson(request);
        const distanceKm = Number(body.distanceKm);
        const type = body.type;
        if (!Number.isFinite(distanceKm) || distanceKm < 0 || distanceKm > 1000) throw new ApiError(400, "Distance must be between 0 and 1,000 km.");
        if (!["flatbed", "wheel-lift", "standard"].includes(type)) throw new ApiError(400, "Choose a supported tow type.");
        send(response, 200, { distanceKm, type, totalGhs: Math.round(160 + distanceKm * (type === "flatbed" ? 24 : 18)), etaMinutes: 12 });
        return;
      }

      const user = requireUser(request);
      if (method === "GET" && url.pathname === "/api/vehicles") {
        const vehicles = db.prepare("SELECT id, make, model, year, plate, mileage_km AS mileageKm, is_primary AS isPrimary FROM vehicles WHERE user_id = ? ORDER BY is_primary DESC, make, model")
          .all(user.id).map(({ isPrimary, ...vehicle }) => ({ ...vehicle, primary: Boolean(isPrimary) }));
        send(response, 200, vehicles);
        return;
      }
      if (method === "POST" && url.pathname === "/api/vehicles") {
        const body = await readJson(request);
        const count = db.prepare("SELECT COUNT(*) AS count FROM vehicles WHERE user_id = ?").get(user.id).count;
        if (count >= 10) throw new ApiError(400, "You can save up to 10 vehicles.");
        const vehicle = {
          id: randomBytes(16).toString("hex"),
          make: validateString(body.make, "Make", 1, 40),
          model: validateString(body.model, "Model", 1, 40),
          year: body.year,
          plate: body.plate === undefined ? "" : validateString(body.plate, "Plate", 0, 16).toUpperCase(),
          mileageKm: body.mileageKm === undefined ? 0 : body.mileageKm,
          primary: count === 0 || body.primary === true,
        };
        const maximumYear = new Date().getFullYear() + 1;
        if (!Number.isInteger(vehicle.year) || vehicle.year < 1950 || vehicle.year > maximumYear) throw new ApiError(400, "Enter a valid model year.");
        if (!Number.isSafeInteger(vehicle.mileageKm) || vehicle.mileageKm < 0 || vehicle.mileageKm > 10_000_000) throw new ApiError(400, "Enter a valid mileage.");
        db.exec("BEGIN");
        try {
          if (vehicle.primary) db.prepare("UPDATE vehicles SET is_primary = 0 WHERE user_id = ?").run(user.id);
          db.prepare("INSERT INTO vehicles (id, user_id, make, model, year, plate, mileage_km, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
            .run(vehicle.id, user.id, vehicle.make, vehicle.model, vehicle.year, vehicle.plate, vehicle.mileageKm, Number(vehicle.primary));
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        send(response, 201, vehicle);
        return;
      }
      const vehicleMatch = url.pathname.match(/^\/api\/vehicles\/([^/]+)$/);
      if (vehicleMatch && ["PUT", "DELETE"].includes(method)) {
        let vehicleId;
        try { vehicleId = decodeURIComponent(vehicleMatch[1]); } catch { throw new ApiError(400, "Invalid vehicle ID."); }
        const current = db.prepare("SELECT id, make, model, year, plate, mileage_km AS mileageKm, is_primary AS isPrimary FROM vehicles WHERE id = ? AND user_id = ?")
          .get(vehicleId, user.id);
        if (!current) throw new ApiError(404, "Vehicle not found.");
        if (method === "DELETE") {
          db.exec("BEGIN");
          try {
            db.prepare("DELETE FROM vehicles WHERE id = ? AND user_id = ?").run(vehicleId, user.id);
            if (current.isPrimary) {
              const next = db.prepare("SELECT id FROM vehicles WHERE user_id = ? ORDER BY id LIMIT 1").get(user.id);
              if (next) db.prepare("UPDATE vehicles SET is_primary = 1 WHERE id = ? AND user_id = ?").run(next.id, user.id);
            }
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          send(response, 200, { ok: true });
          return;
        }
        const body = await readJson(request);
        const vehicle = {
          id: current.id,
          make: validateString(body.make, "Make", 1, 40),
          model: validateString(body.model, "Model", 1, 40),
          year: body.year,
          plate: body.plate === undefined ? current.plate : (body.plate === "" ? "" : validateString(body.plate, "Plate", 1, 16)).toUpperCase(),
          mileageKm: body.mileageKm === undefined ? current.mileageKm : body.mileageKm,
          primary: typeof body.primary === "boolean" ? body.primary : Boolean(current.isPrimary),
        };
        const maximumYear = new Date().getFullYear() + 1;
        if (!Number.isInteger(vehicle.year) || vehicle.year < 1950 || vehicle.year > maximumYear) throw new ApiError(400, "Enter a valid model year.");
        if (!Number.isSafeInteger(vehicle.mileageKm) || vehicle.mileageKm < 0 || vehicle.mileageKm > 10_000_000) throw new ApiError(400, "Enter a valid mileage.");
        db.exec("BEGIN");
        try {
          if (vehicle.primary) db.prepare("UPDATE vehicles SET is_primary = 0 WHERE user_id = ?").run(user.id);
          db.prepare("UPDATE vehicles SET make = ?, model = ?, year = ?, plate = ?, mileage_km = ?, is_primary = ? WHERE id = ? AND user_id = ?")
            .run(vehicle.make, vehicle.model, vehicle.year, vehicle.plate, vehicle.mileageKm, Number(vehicle.primary), vehicle.id, user.id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        send(response, 200, vehicle);
        return;
      }
      if (method === "GET" && url.pathname === "/api/bookings") {
        send(response, 200, statements.listBookings.all(user.id));
        return;
      }
      if (method === "POST" && url.pathname === "/api/bookings") {
        const body = await readJson(request);
        const booking = {
          id: randomBytes(16).toString("hex"),
          providerId: validateIdentifier(body.providerId, "Provider ID"),
          vehicleId: validateIdentifier(body.vehicleId, "Vehicle ID"),
          startsAt: parseDate(body.startsAt, "Start time"),
          service: validateString(body.service, "Service", 1, 200),
        };
        if (!statements.vehicleExists.get(booking.vehicleId, user.id)) throw new ApiError(400, "Choose one of your saved vehicles.");
        statements.insertBooking.run(booking.id, user.id, booking.providerId, booking.vehicleId, booking.startsAt, booking.service, new Date().toISOString());
        send(response, 201, booking);
        return;
      }

      if (method === "GET" && url.pathname === "/api/emergency") {
        const row = db.prepare("SELECT payload FROM emergencies WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").get(user.id);
        send(response, 200, row ? JSON.parse(row.payload) : null);
        return;
      }
      if (method === "PUT" && url.pathname === "/api/emergency") {
        const body = await readJson(request);
        const id = validateIdentifier(body.id, "Request ID");
        if (!emergencyStatuses.has(body.status)) throw new ApiError(400, "Choose a supported emergency status.");
        const requestData = {
          id,
          status: body.status,
          createdAt: parseDate(body.createdAt, "Created time"),
          updatedAt: parseDate(body.updatedAt, "Updated time"),
        };
        if (body.problem !== undefined) requestData.problem = validateString(body.problem, "Problem", 1, 500);
        if (body.providerId !== undefined) requestData.providerId = validateIdentifier(body.providerId, "Provider ID");
        if (body.location !== undefined) {
          if (!body.location || typeof body.location !== "object" || Array.isArray(body.location)) throw new ApiError(400, "Location must be an object.");
          const location = { label: validateString(body.location.label, "Location label", 1, 200) };
          const hasLat = body.location.lat !== undefined;
          const hasLng = body.location.lng !== undefined;
          if (hasLat !== hasLng) throw new ApiError(400, "Provide both location coordinates or neither.");
          if (hasLat) {
            const lat = Number(body.location.lat);
            const lng = Number(body.location.lng);
            if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
              throw new ApiError(400, "Location coordinates are invalid.");
            }
            location.lat = lat;
            location.lng = lng;
          }
          requestData.location = location;
        }
        const updated = db.prepare("UPDATE emergencies SET payload = ?, updated_at = ? WHERE id = ? AND user_id = ?")
          .run(JSON.stringify(requestData), new Date().toISOString(), id, user.id);
        if (updated.changes === 0) {
          const collision = db.prepare("SELECT 1 FROM emergencies WHERE id = ?").get(id);
          if (collision) throw new ApiError(409, "That request ID is already in use.");
          db.prepare("INSERT INTO emergencies (id, user_id, payload, updated_at) VALUES (?, ?, ?, ?)")
            .run(id, user.id, JSON.stringify(requestData), new Date().toISOString());
        }
        send(response, 200, requestData);
        return;
      }
      if (method === "POST" && url.pathname === "/api/emergency/cancel") {
        const body = await readJson(request);
        const id = validateIdentifier(body.id, "Request ID");
        const row = db.prepare("SELECT payload FROM emergencies WHERE id = ? AND user_id = ?").get(id, user.id);
        if (!row) throw new ApiError(404, "Emergency request not found.");
        const requestData = { ...JSON.parse(row.payload), status: "cancelled", updatedAt: new Date().toISOString() };
        db.prepare("UPDATE emergencies SET payload = ?, updated_at = ? WHERE id = ? AND user_id = ?")
          .run(JSON.stringify(requestData), requestData.updatedAt, id, user.id);
        send(response, 200, requestData);
        return;
      }

      if (method === "GET" && url.pathname === "/api/payments") {
        send(response, 200, statements.listPayments.all(user.id));
        return;
      }
      if (method === "POST" && url.pathname === "/api/payments") {
        const body = await readJson(request);
        const amountGhs = Number(body.amountGhs);
        if (!Number.isFinite(amountGhs) || amountGhs <= 0 || amountGhs > 1_000_000) throw new ApiError(400, "Amount must be greater than 0 and no more than GHS 1,000,000.");
        const idempotencyKey = validateString(body.idempotencyKey, "Idempotency key", 8, 128);
        let payment = statements.getPaymentByKey.get(user.id, idempotencyKey);
        if (payment && payment.amountGhs !== Math.round(amountGhs * 100) / 100) {
          throw new ApiError(409, "That idempotency key was already used for a different amount.");
        }
        if (!payment) {
          payment = {
            id: randomBytes(16).toString("hex"),
            amountGhs: Math.round(amountGhs * 100) / 100,
            status: "pending",
            idempotencyKey,
            createdAt: new Date().toISOString(),
          };
          try {
            statements.insertPayment.run(payment.id, user.id, payment.amountGhs, payment.idempotencyKey, payment.createdAt);
          } catch (error) {
            if (!String(error.message).includes("UNIQUE constraint failed")) throw error;
            payment = statements.getPaymentByKey.get(user.id, idempotencyKey);
            if (payment.amountGhs !== Math.round(amountGhs * 100) / 100) {
              throw new ApiError(409, "That idempotency key was already used for a different amount.");
            }
          }
        }
        send(response, 201, payment);
        return;
      }

      if (method === "PUT" && url.pathname === "/api/cart") {
        const body = await readJson(request);
        if (!Array.isArray(body.items) || body.items.length > 100) throw new ApiError(400, "Cart must contain no more than 100 items.");
        const items = body.items.map((item) => {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw new ApiError(400, "Cart item is invalid.");
          const productId = validateIdentifier(item.productId, "Product ID");
          const quantity = Number(item.quantity);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new ApiError(400, "Quantity must be between 1 and 99.");
          return { productId, quantity };
        });
        db.prepare("INSERT INTO carts (user_id, items, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET items = excluded.items, updated_at = excluded.updated_at")
          .run(user.id, JSON.stringify(items), new Date().toISOString());
        send(response, 200, items);
        return;
      }
      if (method === "GET" && url.pathname === "/api/cart") {
        const row = db.prepare("SELECT items FROM carts WHERE user_id = ?").get(user.id);
        send(response, 200, row ? JSON.parse(row.items) : []);
        return;
      }

      const chatMatch = url.pathname.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
      if (method === "POST" && url.pathname === "/api/chat/threads") {
        const body = await readJson(request);
        const bookingId = validateIdentifier(body.bookingId, "Booking ID");
        if (!statements.getBooking.get(bookingId, user.id)) throw new ApiError(404, "Booking not found.");
        let thread = db.prepare("SELECT id FROM chat_threads WHERE booking_id = ? AND user_id = ?").get(bookingId, user.id);
        if (!thread) {
          const id = randomBytes(16).toString("hex");
          db.prepare("INSERT INTO chat_threads (id, user_id, booking_id, created_at) VALUES (?, ?, ?, ?)")
            .run(id, user.id, bookingId, new Date().toISOString());
          thread = { id };
        }
        send(response, 201, thread);
        return;
      }
      if (chatMatch && ["GET", "POST"].includes(method)) {
        let threadId;
        try { threadId = decodeURIComponent(chatMatch[1]); } catch { throw new ApiError(400, "Invalid chat thread ID."); }
        const thread = db.prepare("SELECT id FROM chat_threads WHERE id = ? AND user_id = ?").get(threadId, user.id);
        if (!thread) throw new ApiError(404, "Chat thread not found.");
        if (method === "GET") {
          const messages = db.prepare("SELECT id, thread_id AS threadId, sender_id AS senderId, body, created_at AS createdAt, state FROM chat_messages WHERE thread_id = ? ORDER BY created_at ASC LIMIT 500").all(threadId);
          send(response, 200, messages);
          return;
        }
        const body = await readJson(request);
        const message = {
          id: randomBytes(16).toString("hex"),
          threadId,
          senderId: user.id,
          body: validateString(body.body, "Message", 1, 2000),
          createdAt: new Date().toISOString(),
          state: "sent",
        };
        db.prepare("INSERT INTO chat_messages (id, thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)")
          .run(message.id, message.threadId, message.senderId, message.body, message.createdAt);
        send(response, 201, message);
        return;
      }

      throw new ApiError(404, "Not found.");
    } catch (error) {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      if (error instanceof ApiError) {
        send(response, error.status, { error: error.message });
        return;
      }
      console.error("API request failed:", error);
      send(response, 500, { error: "The server couldn't complete the request." });
    }
  }

  const server = createServer((request, response) => void handle(request, response));
  return {
    server,
    close() {
      db.close();
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { server } = createApiServer();
  const port = Number(process.env.API_PORT ?? 3001);
  const host = process.env.API_HOST ?? "127.0.0.1";
  server.listen(port, host, () => console.log(`My Local Mechanic API listening on http://${host}:${port}`));
}
