import { all, get, run } from "./db.ts";
import { badRequest, conflict, forbidden, notFound } from "./errors.ts";
import { newId, nowIso } from "./util.ts";
import type { AuthContext } from "./http.ts";

const MAX_TEXT = 60;
const MAX_PLATE = 20;

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm?: number;
  isPrimary?: boolean;
  // The client sends `primary`; accept both spellings.
  primary?: boolean;
}

function wantsPrimary(input: Partial<VehicleInput>) {
  return Boolean(input.isPrimary ?? input.primary ?? false);
}

function validate(input: Partial<VehicleInput>) {
  if (!input.make?.trim()) throw badRequest("Vehicle make is required.");
  if (!input.model?.trim()) throw badRequest("Vehicle model is required.");
  if (!input.plate?.trim()) throw badRequest("Plate number is required.");
  if (input.make.trim().length > MAX_TEXT || input.model.trim().length > MAX_TEXT) {
    throw badRequest("Vehicle make and model must be 60 characters or fewer.");
  }
  if (input.plate.trim().length > MAX_PLATE) {
    throw badRequest("Plate number must be 20 characters or fewer.");
  }
  const year = Number(input.year);
  if (!Number.isFinite(year) || year < 1950 || year > new Date().getFullYear() + 1) {
    throw badRequest("Enter a valid vehicle year.");
  }
  if (input.mileageKm !== undefined && (!Number.isFinite(input.mileageKm) || input.mileageKm < 0)) {
    throw badRequest("Mileage must be a positive number.");
  }
}

export interface Vehicle {
  id: string;
  ownerId: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listVehicles(userId: string): Promise<Vehicle[]> {
  const rows = await all<Vehicle>(
    `SELECT id, owner_id as "ownerId", make, model, year, plate, mileage_km as "mileageKm", is_primary as "isPrimary",
            created_at as "createdAt", updated_at as "updatedAt"
     FROM vehicles WHERE owner_id = ? ORDER BY is_primary DESC, created_at ASC`,
    [userId],
  );
  return rows.map((row) => ({ ...row, isPrimary: Boolean(row.isPrimary) }));
}

export async function getVehicle(id: string): Promise<Vehicle | null> {
  const row = await get<Vehicle>(
    `SELECT id, owner_id as "ownerId", make, model, year, plate, mileage_km as "mileageKm", is_primary as "isPrimary"
     FROM vehicles WHERE id = ?`,
    [id],
  );
  if (!row) return null;
  // SQLite stores 0/1; the API contract is a boolean.
  return { ...row, isPrimary: Boolean(row.isPrimary) };
}

/** Owner-scoped read: prevents anyone signed in from reading another user's vehicle. */
export async function getVehicleForUser(auth: AuthContext, id: string) {
  const vehicle = await getVehicle(id);
  if (!vehicle) throw notFound("Vehicle not found.");
  const ownerId = (vehicle as { ownerId?: string }).ownerId;
  if (ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  return vehicle;
}

export async function createVehicle(auth: AuthContext, input: VehicleInput) {
  validate(input);
  const id = newId();
  const timestamp = nowIso();
  const isPrimary = wantsPrimary(input);
  await run(
    `INSERT INTO vehicles (id, owner_id, make, model, year, plate, mileage_km, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, auth.userId, input.make.trim(), input.model.trim(), Math.round(Number(input.year)), input.plate.trim(), Math.round(input.mileageKm ?? 0), isPrimary ? 1 : 0, timestamp, timestamp],
  );
  if (isPrimary) {
    await run("UPDATE vehicles SET is_primary = 0 WHERE owner_id = ? AND id <> ?", [auth.userId, id]);
  }
  return await getVehicle(id);
}

export async function updateVehicle(auth: AuthContext, id: string, input: Partial<VehicleInput>) {
  const existing = await get<{ ownerId: string }>(`SELECT owner_id as "ownerId" FROM vehicles WHERE id = ?`, [id]);
  if (!existing) throw notFound("Vehicle not found.");
  if (existing.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  validate({ ...input, make: input.make ?? "x", model: input.model ?? "x", plate: input.plate ?? "x", year: input.year ?? 2000 });
  const isPrimary = wantsPrimary(input);
  await run(
    `UPDATE vehicles SET make = COALESCE(?, make), model = COALESCE(?, model), year = COALESCE(?, year),
      plate = COALESCE(?, plate), mileage_km = COALESCE(?, mileage_km), is_primary = COALESCE(?, is_primary), updated_at = ?
     WHERE id = ?`,
    [
      input.make?.trim() ?? null,
      input.model?.trim() ?? null,
      input.year !== undefined ? Math.round(Number(input.year)) : null,
      input.plate?.trim() ?? null,
      input.mileageKm !== undefined ? Math.round(input.mileageKm) : null,
      input.isPrimary !== undefined || input.primary !== undefined ? (isPrimary ? 1 : 0) : null,
      nowIso(),
      id,
    ],
  );
  if (isPrimary) await run("UPDATE vehicles SET is_primary = 0 WHERE owner_id = ? AND id <> ?", [existing.ownerId, id]);
  return await getVehicle(id);
}

export async function deleteVehicle(auth: AuthContext, id: string) {
  const existing = await get<{ ownerId: string }>(`SELECT owner_id as "ownerId" FROM vehicles WHERE id = ?`, [id]);
  if (!existing) throw notFound("Vehicle not found.");
  if (existing.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  // service_requests.vehicle_id has no ON DELETE rule, so a plain delete would
  // hit a foreign-key error. Refuse rather than silently destroying history.
  const used = Number(await (await get<{ value: number }>(`SELECT COUNT(*) as "value" FROM service_requests WHERE vehicle_id = ?`, [id]))?.value ?? 0);
  if (used > 0) throw conflict("This vehicle has service history, so it cannot be deleted.");
  await run("DELETE FROM vehicles WHERE id = ?", [id]);
  return { deleted: true };
}
