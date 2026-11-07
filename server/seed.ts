import { config, isProduction } from "./config.ts";
import { all, get, run } from "./db.ts";
import { newId, nowIso, normalisePhone } from "./util.ts";
import { setPassword } from "./auth.ts";

// Development/bootstrap helpers. These never fabricate metrics, reviews or
// market claims; they only provision accounts so the platform can be exercised.

interface EnsureUserInput {
  phone: string;
  name: string;
  role: "driver" | "mechanic" | "tow" | "vendor" | "admin";
  password: string;
}

export function ensureUser(input: EnsureUserInput) {
  const phone = normalisePhone(input.phone);
  if (!phone) throw new Error(`Invalid phone for seed user: ${input.phone}`);
  let user = get<{ id: string }>("SELECT id FROM users WHERE phone = ?", [phone]);
  if (!user) {
    const id = newId();
    const timestamp = nowIso();
    run(
      `INSERT INTO users (id, role, name, phone, email, status, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, 'active', ?, ?)`,
      [id, input.role, input.name, phone, timestamp, timestamp],
    );
    user = { id };
  }
  setPassword(user.id, input.password);
  return user.id;
}

export function bootstrapAdmin() {
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!phone || !password) {
    if (isProduction) console.warn("[seed] ADMIN_PHONE/ADMIN_PASSWORD not set - no admin account provisioned.");
    return null;
  }
  if (isProduction && password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters in production.");
  }
  const id = ensureUser({ phone, name: process.env.ADMIN_NAME ?? "MechNow Admin", role: "admin", password });
  console.log(`[seed] admin ready for ${phone}`);
  return id;
}

export function seedDemoData() {
  if (isProduction) throw new Error("Refusing to seed demo data in production.");
  const driverId = ensureUser({ phone: "0200000001", name: "Ama Driver", role: "driver", password: "driver-demo-123" });
  const mechanicId = ensureUser({ phone: "0200000002", name: "Kofi Mechanic", role: "mechanic", password: "mechanic-demo-123" });
  const towId = ensureUser({ phone: "0200000003", name: "Yaw Towing", role: "tow", password: "tow-demo-123" });

  if (!get("SELECT id FROM vehicles WHERE owner_id = ?", [driverId])) {
    const timestamp = nowIso();
    run(
      `INSERT INTO vehicles (id, owner_id, make, model, year, plate, mileage_km, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newId(), driverId, "Toyota", "Corolla", 2015, "GT-1234-18", 128000, timestamp, timestamp],
    );
  }

  const ensureProvider = (userId: string, type: "mechanic" | "tow", businessName: string, region: string) => {
    let provider = get<{ id: string }>("SELECT id FROM providers WHERE user_id = ?", [userId]);
    if (!provider) {
      const id = newId();
      const timestamp = nowIso();
      run(
        `INSERT INTO providers (id, user_id, type, business_name, region, service_areas, specialisations, status, available, rating, reliability, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '[]', 'verified', 1, 0, 0, ?, ?, ?)`,
        [id, userId, type, businessName, region, JSON.stringify([region]), timestamp, timestamp, timestamp],
      );
      provider = { id };
      run(
        `INSERT INTO provider_credentials (id, provider_id, document_type, document_ref, status, verified_at, created_at)
         VALUES (?, ?, 'business_registration', ?, 'valid', ?, ?)`,
        [newId(), id, `DEMO-${type.toUpperCase()}-0001`, timestamp, timestamp],
      );
    }
    return provider.id;
  };

  ensureProvider(mechanicId, "mechanic", "Kofi Auto Works (demo)", "Greater Accra");
  ensureProvider(towId, "tow", "Yaw Towing (demo)", "Greater Accra");

  console.log("[seed] demo data ready. Logins: 0200000001 / driver-demo-123 (driver), 0200000002 / mechanic-demo-123 (mechanic)");
}

export function databaseSummary() {
  const count = (table: string) => Number(get<{ c: number }>(`SELECT COUNT(*) as c FROM ${table}`)?.c ?? 0);
  return {
    users: count("users"),
    providers: all("SELECT id FROM providers").length,
    requests: count("service_requests"),
  };
}

// Keeps the reference to config so tree-shakers/type-stripping retain it and to
// document that seeding is environment-gated.
export const seedAllowed = !isProduction && (config.seedDemoData || config.env === "development");
