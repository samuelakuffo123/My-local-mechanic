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
  reliability: number;
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
  };
}

const SELECT = `SELECT id, user_id as userId, type, business_name as businessName, region,
  service_areas as serviceAreas, specialisations, status, available, rating, reliability FROM providers`;

export function applyAsProvider(auth: AuthContext, input: { businessName: string; type: ProviderType; region?: string; serviceAreas?: string[] }) {
  if (auth.role === "driver" || auth.role === "admin") {
    throw forbidden("Switch your account to a provider role before applying.");
  }
  if (!input.businessName?.trim()) throw badRequest("Business name is required.");
  if (!["mechanic", "tow", "vendor"].includes(input.type)) throw badRequest("Choose a valid provider type.");
  const existing = get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [auth.userId]);
  if (existing) {
    // Idempotent: update the application instead of duplicating it.
    run(
      `UPDATE providers SET business_name = ?, type = ?, region = ?, service_areas = ?, updated_at = ? WHERE user_id = ?`,
      [input.businessName.trim(), input.type, input.region ?? null, JSON.stringify(input.serviceAreas ?? []), nowIso(), auth.userId],
    );
    return hydrate(get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [auth.userId])!);
  }
  const id = newId();
  const timestamp = nowIso();
  run(
    `INSERT INTO providers (id, user_id, type, business_name, region, service_areas, specialisations, status, available, rating, reliability, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '[]', 'pending', 0, 0, 0, ?, ?)`,
    [id, auth.userId, input.type, input.businessName.trim(), input.region ?? null, JSON.stringify(input.serviceAreas ?? []), timestamp, timestamp],
  );
  auditFrom(auth, "provider.apply", "provider", id);
  return hydrate(get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id])!);
}

export function getProviderById(id: string) {
  const row = get<Record<string, unknown>>(`${SELECT} WHERE id = ?`, [id]);
  return row ? hydrate(row) : null;
}

export function getProviderForUser(userId: string) {
  const row = get<Record<string, unknown>>(`${SELECT} WHERE user_id = ?`, [userId]);
  return row ? hydrate(row) : null;
}

export function setAvailability(auth: AuthContext, available: boolean) {
  const provider = getProviderForUser(auth.userId);
  if (!provider) throw notFound("You do not have a provider profile.");
  if (provider.status !== "verified") throw forbidden("Your provider account is not verified yet.");
  run("UPDATE providers SET available = ?, updated_at = ? WHERE id = ?", [available ? 1 : 0, nowIso(), provider.id]);
  return { ...provider, available };
}

/** Eligible providers for dispatch: verified, available, matching kind, in-region when supplied. */
export function eligibleProviders(kind: "emergency" | "booking" | "tow", region?: string | null) {
  const wanted: ProviderType = kind === "tow" ? "tow" : "mechanic";
  let rows = all<Record<string, unknown>>(
    `${SELECT} WHERE status = 'verified' AND available = 1 AND type = ? ORDER BY reliability DESC, rating DESC`,
    [wanted],
  ).map(hydrate);
  if (region) {
    const inRegion = rows.filter((row) => !row.region || row.region.toLowerCase() === region.toLowerCase());
    if (inRegion.length > 0) rows = inRegion;
  }
  return rows;
}

export function providerCredentials(providerId: string) {
  return all(
    `SELECT id, provider_id as providerId, document_type as documentType, document_ref as documentRef,
            expires_at as expiresAt, status, verified_at as verifiedAt, created_at as createdAt
     FROM provider_credentials WHERE provider_id = ? ORDER BY created_at DESC`,
    [providerId],
  );
}

export function addCredential(providerId: string, input: { documentType: string; documentRef: string; expiresAt?: string | null }) {
  if (!input.documentType?.trim() || !input.documentRef?.trim()) throw badRequest("Document type and reference are required.");
  const id = newId();
  run(
    `INSERT INTO provider_credentials (id, provider_id, document_type, document_ref, expires_at, status, verified_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, ?)`,
    [id, providerId, input.documentType.trim(), input.documentRef.trim(), input.expiresAt ?? null, nowIso()],
  );
  return { id };
}

export function listProvidersByStatus(status: ProviderStatus) {
  return all<Record<string, unknown>>(`${SELECT} WHERE status = ? ORDER BY created_at ASC`, [status]).map(hydrate);
}

export function verifyProvider(admin: AuthContext, providerId: string, decision: "verify" | "reject" | "suspend", note?: string) {
  const provider = getProviderById(providerId);
  if (!provider) throw notFound("Provider not found.");
  if (decision === "verify" && providerCredentials(providerId).length === 0) {
    throw conflict("Add at least one credential (identity/business document) before verifying this provider.");
  }
  const status: ProviderStatus = decision === "verify" ? "verified" : decision === "reject" ? "rejected" : "suspended";
  run(
    `UPDATE providers SET status = ?, verification_note = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?`,
    [status, note ?? null, decision === "verify" ? nowIso() : null, admin.userId, nowIso(), providerId],
  );
  run(
    `UPDATE provider_credentials SET status = ?, verified_at = ? WHERE provider_id = ? AND status = 'pending'`,
    [decision === "verify" ? "valid" : "rejected", decision === "verify" ? nowIso() : null, providerId],
  );
  auditFrom(admin, `provider.${decision}`, "provider", providerId, { note });
  return { ...provider, status };
}

export function expiringCredentials(withinDays = 30) {
  const threshold = new Date(Date.now() + withinDays * 86_400_000).toISOString();
  return all(
    `SELECT c.id, c.provider_id as providerId, p.business_name as businessName, c.document_type as documentType,
            c.expires_at as expiresAt, c.status
     FROM provider_credentials c JOIN providers p ON p.id = c.provider_id
     WHERE c.expires_at IS NOT NULL AND c.expires_at <= ? AND c.status = 'valid'
     ORDER BY c.expires_at ASC`,
    [threshold],
  );
}

export function suspendExpiredProviders() {
  const expired = expiringCredentials(0);
  return tx(() => {
    for (const row of expired) {
      run("UPDATE providers SET available = 0, updated_at = ? WHERE id = ?", [nowIso(), row.providerId]);
    }
    return expired.length;
  });
}

export function assertVerified(auth: AuthContext) {
  const provider = getProviderForUser(auth.userId);
  if (!provider) throw forbidden("Create a provider profile first.");
  if (provider.status !== "verified") throw conflict("Your provider account is not verified.");
  return provider;
}
