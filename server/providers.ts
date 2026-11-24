import { all, get, run, tx } from "./db.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import { auditFrom } from "./audit.ts";
import { newId, nowIso } from "./util.ts";
import type { AuthContext } from "./http.ts";

export type ProviderType = "mechanic" | "tow" | "vendor";
type ProviderStatus = "pending" | "verified" | "rejected" | "suspended";

export interface ProviderProfile {
  id: string;
  userId: string;
  type: ProviderType;
  businessName: string;
  region: string | null;
  serviceAreas: string[];
  specialisations: string[];
  status: ProviderStatus;
  available: boolean;
  rating: number;
  reviewCount: number;
  reliability: number;
  lat: number | null;
  lng: number | null;
  address: string | null;
  bio: string | null;
  yearsExperience: number;
  safetyNote: string | null;
}

/** A verified provider that can be placed on the discovery map. */
export interface NearbyProvider extends ProviderProfile {
  distanceKm: number | null;
}

function hydrate(row: Record<string, unknown>): ProviderProfile {
  return {
    id: String(row.id),
    userId: String(row.userId),
    type: row.type as ProviderType,
    businessName: String(row.businessName),
    region: (row.region as string) ?? null,
    serviceAreas: JSON.parse(String(row.serviceAreas ?? "[]")),
    specialisations: JSON.parse(String(row.specialisations ?? "[]")),
    status: row.status as ProviderStatus,
    available: Boolean(row.available),
    rating: Number(row.rating ?? 0),
    reliability: Number(row.reliability ?? 0),
    lat: row.lat == null ? null : Number(row.lat),
    lng: row.lng == null ? null : Number(row.lng),
    address: (row.address as string) ?? null,
  };
}

const SELECT = `SELECT id, user_id as "userId", type, business_name as "businessName", region,
  service_areas as "serviceAreas", specialisations, status, available, rating, reliability,
  lat, lng, address FROM providers`;

export async function applyAsProvider(auth: AuthContext, input: {
  businessName: string;
  type: ProviderType;
  region?: string;
  serviceAreas?: string[];
  lat?: number;
  lng?: number;
  address?: string;
}) {
  if (auth.role === "driver" || auth.role === "admin") {
    throw forbidden("Switch your account to a provider role before applying.");
  }
  if (!input.businessName?.trim()) throw badRequest("Business name is required.");
  if (!["mechanic", "tow", "vendor"].includes(input.type)) throw badRequest("Choose a valid provider type.");
  if (input.lat != null && (!Number.isFinite(input.lat) || input.lat < -90 || input.lat > 90)) {
    throw badRequest("Latitude must be a number between -90 and 90.");
  }
  if (input.lng != null && (!Number.isFinite(input.lng) || input.lng < -180 || input.lng > 180)) {
    throw badRequest("Longitude must be a number between -180 and 180.");
  }
  const existing = await get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [auth.userId]);
  if (existing) {
    // Idempotent: update the application instead of duplicating it.
    const current = hydrate(existing);
    await run(
      `UPDATE providers SET business_name = ?, type = ?, region = ?, service_areas = ?, lat = ?, lng = ?, address = ?, updated_at = ? WHERE user_id = ?`,
      [
        input.businessName.trim(),
        input.type,
        input.region ?? null,
        JSON.stringify(input.serviceAreas ?? []),
        input.lat ?? current.lat,
        input.lng ?? current.lng,
        input.address ?? current.address,
        nowIso(),
        auth.userId,
      ],
    );
    return hydrate((await get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [auth.userId]))!);
  }
  const id = newId();
  const timestamp = nowIso();
  await run(
    `INSERT INTO providers (id, user_id, type, business_name, region, service_areas, specialisations, status, available, rating, reliability, lat, lng, address, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'pending', 0, 0, 0, ?, ?, ?, ?, ?)`,
    [
      id,
      auth.userId,
      input.type,
      input.businessName.trim(),
      input.region ?? null,
      JSON.stringify(input.serviceAreas ?? []),
      input.lat ?? null,
      input.lng ?? null,
      input.address ?? null,
      timestamp,
      timestamp,
    ],
  );
  await auditFrom(auth, "provider.apply", "provider", id);
  return hydrate((await get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id]))!);
}

export async function getProviderById(id: string) {
  const row = await get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id]);
  return row ? hydrate(row) : null;
}

export async function getProviderForUser(userId: string) {
  const row = await get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [userId]);
  return row ? hydrate(row) : null;
}

export async function setAvailability(auth: AuthContext, available: boolean) {
  const provider = await getProviderForUser(auth.userId);
  if (!provider) throw notFound("You do not have a provider profile.");
  if (provider.status !== "verified") throw forbidden("Your provider account is not verified yet.");
  await run("UPDATE providers SET available = ?, updated_at = ? WHERE id = ?", [available ? 1 : 0, nowIso(), provider.id]);
  return { ...provider, available };
}

/** Eligible providers for dispatch: verified, available, matching kind, in-region when supplied. */
export async function eligibleProviders(kind: "emergency" | "booking" | "tow", region?: string | null) {
  const wanted: ProviderType = kind === "tow" ? "tow" : "mechanic";
  let rows = (await all<Record<string, unknown>>(
    `${SELECT} WHERE status = 'verified' AND available = 1 AND type = ? ORDER BY reliability DESC, rating DESC`,
    [wanted],
  )).map(hydrate);
  if (region) {
    const inRegion = rows.filter((row) => !row.region || row.region.toLowerCase() === region.toLowerCase());
    if (inRegion.length > 0) rows = inRegion;
  }
  return rows;
}

function distanceKm(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Verified providers that customers can discover on the map: mechanics, tow
 * operators and parts shops. Only records with coordinates are returned so a
 * marker always corresponds to a real location. Availability affects ordering
 * but not inclusion, because a shop or garage can still be visited while busy.
 */
export async function nearbyProviders(input: {
  lat?: number | null;
  lng?: number | null;
  radiusKm?: number;
  type?: ProviderType | null;
}): Promise<NearbyProvider[]> {
  const rows = (await all<Record<string, unknown>>(
    `${SELECT} WHERE status = 'verified'${input.type ? " AND type = ?" : ""}`,
    input.type ? [input.type] : [],
  )).map(hydrate);

  const origin = typeof input.lat === "number" && typeof input.lng === "number" && Number.isFinite(input.lat) && Number.isFinite(input.lng)
    ? { lat: input.lat, lng: input.lng }
    : null;
  const radius = input.radiusKm ?? 40;

  const withDistance = rows
    .filter((provider): provider is ProviderProfile & { lat: number; lng: number } => provider.lat != null && provider.lng != null)
    .map((provider) => ({
      ...provider,
      distanceKm: origin ? Number(distanceKm(origin, provider).toFixed(1)) : null,
    }));

  const withinRadius = origin ? withDistance.filter((provider) => (provider.distanceKm ?? 0) <= radius) : withDistance;
  const pool = withinRadius.length > 0 ? withinRadius : withDistance;

  return pool
    .sort((left, right) => {
      if (left.distanceKm != null && right.distanceKm != null && left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }
      if (left.available !== right.available) return left.available ? -1 : 1;
      return right.rating - left.rating;
    })
    .slice(0, 40);
}

export async function providerCredentials(providerId: string) {
  return await all(
    `SELECT id, provider_id as "providerId", document_type as "documentType", document_ref as "documentRef",
            expires_at as "expiresAt", status, verified_at as "verifiedAt", created_at as "createdAt"
     FROM provider_credentials WHERE provider_id = ? ORDER BY created_at DESC`,
    [providerId],
  );
}

export async function addCredential(providerId: string, input: { documentType: string; documentRef: string; expiresAt?: string | null }) {
  if (!input.documentType?.trim() || !input.documentRef?.trim()) throw badRequest("Document type and reference are required.");
  const id = newId();
  await run(
    `INSERT INTO provider_credentials (id, provider_id, document_type, document_ref, expires_at, status, verified_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`,
    [id, providerId, input.documentType.trim(), input.documentRef.trim(), input.expiresAt ?? null, nowIso()],
  );
  return { id };
}

export async function listProvidersByStatus(status: ProviderStatus) {
  return (await all<Record<string, unknown>>(`${SELECT} WHERE status = ? ORDER BY created_at ASC`, [status])).map(hydrate);
}

export async function verifyProvider(admin: AuthContext, providerId: string, decision: "verify" | "reject" | "suspend", note?: string) {
  const provider = await getProviderById(providerId);
  if (!provider) throw notFound("Provider not found.");
  if (decision === "verify" && (await providerCredentials(providerId)).length === 0) {
    throw conflict("Add at least one credential (identity/business document) before verifying this provider.");
  }
  const status: ProviderStatus = decision === "verify" ? "verified" : decision === "reject" ? "rejected" : "suspended";
  await run(
    `UPDATE providers SET status = ?, verification_note = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?`,
    [status, note ?? null, decision === "verify" ? nowIso() : null, admin.userId, nowIso(), providerId],
  );
  await run(
    `UPDATE provider_credentials SET status = ?, verified_at = ? WHERE provider_id = ? AND status = 'pending'`,
    [decision === "verify" ? "valid" : "rejected", decision === "verify" ? nowIso() : null, providerId],
  );
  await auditFrom(admin, `provider.${decision}`, "provider", providerId, { note });
  return { ...provider, status };
}

export async function expiringCredentials(withinDays = 30) {
  const threshold = new Date(Date.now() + withinDays * 86_400_000).toISOString();
  return await all(
    `SELECT c.id, c.provider_id as "providerId", p.business_name as "businessName", c.document_type as "documentType",
            c.expires_at as "expiresAt", c.status
     FROM provider_credentials c JOIN providers p ON p.id = c.provider_id
     WHERE c.expires_at IS NOT NULL AND c.expires_at <= ? AND c.status = 'valid'
     ORDER BY c.expires_at ASC`,
    [threshold],
  );
}

export async function suspendExpiredProviders() {
  const expired = await expiringCredentials(0);
  return await tx(async () => {
    for (const row of expired) {
      await run("UPDATE providers SET available = 0, updated_at = ? WHERE id = ?", [nowIso(), row.providerId]);
    }
    return expired.length;
  });
}

export async function assertVerified(auth: AuthContext) {
  const provider = await getProviderForUser(auth.userId);
  if (!provider) throw forbidden("Create a provider profile first.");
  if (provider.status !== "verified") throw conflict("Your provider account is not verified.");
  return provider;
}
