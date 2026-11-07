import { apiRequest } from "./api";
export const towService = {
  estimate: (distanceKm: number, type: "flatbed" | "wheel-lift" | "standard") =>
    apiRequest<{ distanceKm: number; type: string; totalGhs: number; etaMinutes: number }>("/tow/estimate", {
      method: "POST",
      body: { distanceKm, type },
    }),
};
