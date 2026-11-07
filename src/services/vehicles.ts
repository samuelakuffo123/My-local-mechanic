import { apiRequest } from "./api";
import type { Vehicle } from "../state/types";

export type NewVehicle = Omit<Vehicle, "id">;

export const vehicleService = {
  list: () => apiRequest<Vehicle[]>("/vehicles"),
  create: (input: NewVehicle) => apiRequest<Vehicle>("/vehicles", { method: "POST", body: input }),
  update: (id: string, input: NewVehicle) =>
    apiRequest<Vehicle>(`/vehicles/${encodeURIComponent(id)}`, { method: "PUT", body: input }),
  remove: (id: string) => apiRequest<{ ok: boolean }>(`/vehicles/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
