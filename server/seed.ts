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
  const mechanicTwoId = ensureUser({ phone: "0200000004", name: "Nii Mensah", role: "mechanic", password: "mechanic-demo-123" });
  const towTwoId = ensureUser({ phone: "0200000005", name: "Adjoa Owusu", role: "tow", password: "tow-demo-123" });
  const vendorOneId = ensureUser({ phone: "0200000006", name: "Accra Parts Hub", role: "vendor", password: "vendor-demo-123" });
  const vendorTwoId = ensureUser({ phone: "0200000007", name: "Spintex Spares", role: "vendor", password: "vendor-demo-123" });

  if (!get("SELECT id FROM vehicles WHERE owner_id = ?", [driverId])) {
    const timestamp = nowIso();
    run(
      `INSERT INTO vehicles (id, owner_id, make, model, year, plate, mileage_km, is_primary, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [newId(), driverId, "Toyota", "Corolla", 2015, "GT-1234-18", 128000, timestamp, timestamp],
    );
  }

  interface DemoProvider {
    userId: string;
    type: "mechanic" | "tow" | "vendor";
    businessName: string;
    region: string;
    lat: number;
    lng: number;
    address: string;
    specialisations: string[];
  }

  // Real Accra landmarks are used as demo business bases so the discovery map
  // has meaningful, stable positions. These are clearly labelled demo records.
  const demoProviders: DemoProvider[] = [
    {
      userId: mechanicId,
      type: "mechanic",
      businessName: "Kofi Auto Works (demo)",
      region: "Greater Accra",
      lat: 5.6037,
      lng: -0.187,
      address: "Oxford Street, Osu",
      specialisations: ["Engine diagnostics", "Battery & electrical", "Brakes"],
    },
    {
      userId: mechanicTwoId,
      type: "mechanic",
      businessName: "Nii's Mobile Garage (demo)",
      region: "Greater Accra",
      lat: 5.6145,
      lng: -0.205,
      address: "Kokomlemle, Accra",
      specialisations: ["Mobile call-outs", "Tyres", "Suspension"],
    },
    {
      userId: towId,
      type: "tow",
      businessName: "Yaw Towing (demo)",
      region: "Greater Accra",
      lat: 5.5912,
      lng: -0.229,
      address: "Kaneshie Market Road",
      specialisations: ["Flatbed recovery", "Accident recovery"],
    },
    {
      userId: towTwoId,
      type: "tow",
      businessName: "Cantonments Tow Response (demo)",
      region: "Greater Accra",
      lat: 5.5776,
      lng: -0.1755,
      address: "Cantonments, Accra",
      specialisations: ["24-hour towing", "Jump starts"],
    },
    {
      userId: vendorOneId,
      type: "vendor",
      businessName: "Accra Parts Hub (demo)",
      region: "Greater Accra",
      lat: 5.6058,
      lng: -0.2054,
      address: "Kwame Nkrumah Circle",
      specialisations: ["OEM parts", "Oils & fluids", "Batteries"],
    },
    {
      userId: vendorTwoId,
      type: "vendor",
      businessName: "Spintex Auto Spares (demo)",
      region: "Greater Accra",
      lat: 5.6302,
      lng: -0.1198,
      address: "Spintex Road",
      specialisations: ["Tyres", "Body parts", "Accessories"],
    },
  ];

  const ensureProvider = (provider: DemoProvider) => {
    const existing = get<{ id: string }>("SELECT id FROM providers WHERE user_id = ?", [provider.userId]);
    const timestamp = nowIso();
    if (!existing) {
      const id = newId();
      run(
        `INSERT INTO providers (id, user_id, type, business_name, region, service_areas, specialisations, status, available, rating, reliability, lat, lng, address, verified_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'verified', 1, 0, 0, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          provider.userId,
          provider.type,
          provider.businessName,
          provider.region,
          JSON.stringify([provider.region]),
          JSON.stringify(provider.specialisations),
          provider.lat,
          provider.lng,
          provider.address,
          timestamp,
          timestamp,
          timestamp,
        ],
      );
      run(
        `INSERT INTO provider_credentials (id, provider_id, document_type, document_ref, status, verified_at, created_at)
         VALUES (?, ?, 'business_registration', ?, 'valid', ?, ?)`,
        [newId(), id, `DEMO-${provider.type.toUpperCase()}-0001`, timestamp, timestamp],
      );
      return id;
    }
    // Keep the demo directory useful on databases seeded before map support.
    run(
      `UPDATE providers SET business_name = ?, region = ?, specialisations = ?, lat = ?, lng = ?, address = ?, status = 'verified', available = 1, updated_at = ? WHERE id = ?`,
      [
        provider.businessName,
        provider.region,
        JSON.stringify(provider.specialisations),
        provider.lat,
        provider.lng,
        provider.address,
        timestamp,
        existing.id,
      ],
    );
    return existing.id;
  };

  demoProviders.forEach(ensureProvider);

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
