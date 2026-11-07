import { apiRequest } from "./http";
import { bridge } from "./bridge";
import type { Estimate, Payment, ServiceRequest, Vehicle, VehicleInput } from "./apiTypes";

interface RawVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  plate: string;
  mileageKm: number;
  isPrimary: boolean;
}

function toVehicle(raw: RawVehicle): Vehicle {
  return { id: raw.id, make: raw.make, model: raw.model, year: raw.year, plate: raw.plate, mileageKm: raw.mileageKm, primary: raw.isPrimary };
}

export interface ServiceHistoryItem {
  request: ServiceRequest;
  approvedEstimate: Partial<Estimate> | null;
  payment: Partial<Payment> | null;
}

export interface VehicleService {
  list(): Promise<Vehicle[]>;
  create(input: VehicleInput): Promise<Vehicle>;
  update(id: string, input: Partial<VehicleInput>): Promise<Vehicle>;
  remove(id: string): Promise<void>;
  history(id: string): Promise<ServiceHistoryItem[]>;
}

const serverVehicles: VehicleService = {
  list: async () => (await apiRequest<{ items: RawVehicle[] }>("/vehicles")).items.map(toVehicle),
  create: async (input) => toVehicle(await apiRequest<RawVehicle>("/vehicles", { method: "POST", body: input })),
  update: async (id, input) => toVehicle(await apiRequest<RawVehicle>(`/vehicles/${id}`, { method: "PATCH", body: input })),
  remove: (id) => apiRequest<void>(`/vehicles/${id}`, { method: "DELETE" }),
  history: async (id) => (await apiRequest<{ items: ServiceHistoryItem[] }>(`/vehicles/${id}/history`)).items,
};

const LOCAL_KEY = "mechnow-api:vehicles";

function read(): Vehicle[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]") as Vehicle[];
  } catch {
    return [];
  }
}

function write(items: Vehicle[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

const localVehicles: VehicleService = {
  list: async () => read(),
  create: async (input) => {
    const items = read();
    const vehicle: Vehicle = {
      id: crypto.randomUUID(),
      make: input.make,
      model: input.model,
      year: input.year,
      plate: input.plate,
      mileageKm: input.mileageKm ?? 0,
      primary: input.primary ?? false,
    };
    const next = vehicle.primary ? items.map((item) => ({ ...item, primary: false })) : items;
    write([...next, vehicle]);
    return vehicle;
  },
  update: async (id, input) => {
    const items = read();
    let updated: Vehicle | undefined;
    const next = items.map((item) => {
      if (item.id !== id) return input.primary ? { ...item, primary: false } : item;
      updated = { ...item, ...input, primary: input.primary ?? item.primary };
      return updated;
    });
    if (!updated) throw new Error("Vehicle not found.");
    write(next);
    return updated;
  },
  remove: async (id) => {
    write(read().filter((item) => item.id !== id));
  },
  history: async () => [],
};

export const vehicleService: VehicleService = bridge(serverVehicles, localVehicles);
