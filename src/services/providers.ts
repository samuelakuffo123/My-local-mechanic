import { apiRequest } from "./api";

export interface Provider {
  id: string; name: string; type: "mechanic" | "tow" | "vendor"; distanceKm: number;
  etaMinutes: number; rating: number; reliability: number; services: string[]; phone: string;
}

export const providerService = {
  list: (radiusKm = 5) => apiRequest<Provider[]>(`/providers?radiusKm=${encodeURIComponent(String(radiusKm))}`),
  get: (id: string) => apiRequest<Provider | null>(`/providers/${encodeURIComponent(id)}`),
};
