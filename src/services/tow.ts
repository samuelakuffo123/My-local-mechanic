import { mockRequest } from "./mockApi";
export const towService = {
  estimate: (distanceKm: number, type: "flatbed" | "wheel-lift" | "standard") =>
    mockRequest(() => ({ distanceKm, type, totalGhs: Math.round(160 + distanceKm * (type === "flatbed" ? 24 : 18)), etaMinutes: 12 })),
};
