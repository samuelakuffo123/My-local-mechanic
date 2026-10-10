import { all, get, run } from "./db.ts";
import { badRequest, forbidden, notFound } from "./errors.ts";
import { newId, nowIso } from "./util.ts";
import type { AuthContext } from "./http.ts";

export interface VehicleInput {
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm?: number;
  isPrimary?: boolean;
}

function validate(input: Partial<VehicleInput>) {
  if (!input.make?.trim()) throw badRequest("Vehicle make is required.");
  if (!input.model?.trim()) throw badRequest("Vehicle model is required.");
  if (!input.plate?.trim()) throw badRequest("Plate number is required.");
  const year = Number(input.year);
  if (!Number.isFinite(year) || year < 1950 || year > new Date().getFullYear() + 1) {
    throw badRequest("Enter a valid vehicle year.");
  }
  if (input.mileageKm !== undefined && (!Number.isFinite(input.mileageKm) || input.mileageKm < 0)) {
    throw badRequest("Mileage must be a positive number.");
  }
}

export function listVehicles(userId: string) {
  return all(
    `SELECT id, owner_id as ownerId, make, model, year, plate, mileage_km as mileageKm, is_primary as isPrimary,
            created_at as createdAt, updated_at as updatedAt
     FROM vehicles WHERE owner_id = ? ORDER BY is_primary DESC, created_at ASC`,
    [userId],
  ).map((row) => ({ ...row, isPrimary: Boolean(row.isPrimary) }));
}

export function getVehicle(id: string) {
  return get(
    `SELECT id, owner_id as ownerId, make, model, year, plate, mileage_km as mileageKm, is_primary as isPrimary
     FROM vehicles WHERE id = ?`,
    [id],
  );
}

export function createVehicle(auth: AuthContext, input: VehicleInput) {
  validate(input);
  const id = newId();
  const timestamp = nowIso();
  run(
    `INSERT INTO vehicles (id, owner_id, make, model, year, plate, mileage_km, is_primary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, auth.userId, input.make.trim(), input.model.trim(), Math.round(Number(input.year)), input.plate.trim(), Math.round(input.mileageKm ?? 0), input.isPrimary ? 1 : 0, timestamp, timestamp],
  );
  if (input.isPrimary) {
    run("UPDATE vehicles SET is_primary = 0 WHERE owner_id = ? AND id <> ?", [auth.userId, id]);
  }
  return getVehicle(id);
}

export function updateVehicle(auth: AuthContext, id: string, input: Partial<VehicleInput>) {
  const existing = get<{ ownerId: string }>("SELECT owner_id as ownerId FROM vehicles WHERE id = ?", [id]);
  if (!existing) throw notFound("Vehicle not found.");
  if (existing.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  validate({ ...input, make: input.make ?? "x", model: input.model ?? "x", plate: input.plate ?? "x", year: input.year ?? 2000 });
  run(
    `UPDATE vehicles SET make = COALESCE(?, make), model = COALESCE(?, model), year = COALESCE(?, year),
      plate = COALESCE(?, plate), mileage_km = COALESCE(?, mileage_km), is_primary = COALESCE(?, is_primary), updated_at = ?
     WHERE id = ?`,
    [
      input.make?.trim() ?? null,
      input.model?.trim() ?? null,
      input.year !== undefined ? Math.round(Number(input.year)) : null,
      input.plate?.trim() ?? null,
      input.mileageKm !== undefined ? Math.round(input.mileageKm) : null,
      input.isPrimary !== undefined ? (input.isPrimary ? 1 : 0) : null,
      nowIso(),
      id,
    ],
  );
  if (input.isPrimary) run("UPDATE vehicles SET is_primary = 0 WHERE owner_id = ? AND id <> ?", [existing.ownerId, id]);
  return getVehicle(id);
}

export function deleteVehicle(auth: AuthContext, id: string) {
  const existing = get<{ ownerId: string }>("SELECT owner_id as ownerId FROM vehicles WHERE id = ?", [id]);
  if (!existing) throw notFound("Vehicle not found.");
  if (existing.ownerId !== auth.userId && auth.role !== "admin") throw forbidden();
  run("DELETE FROM vehicles WHERE id = ?", [id]);
  return { deleted: true };
}
