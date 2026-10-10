import { mockRequest } from "./mockApi";
import { requestService } from "./requests";
import type { ServiceRequest } from "./apiTypes";

// Tow pricing is a transparent local estimate until a verified tow tariff
// schedule is configured. It is presented as an estimate, never a fixed quote.
export const towService = {
  estimate: (distanceKm: number, type: "flatbed" | "wheel-lift" | "standard") =>
    mockRequest(() => ({
      distanceKm,
      type,
      totalGhs: Math.round(160 + distanceKm * (type === "flatbed" ? 24 : 18)),
      etaMinutes: 12,
      basis: "estimate" as const,
    })),
  request: async (input: { vehicleId: string; problem: string; location?: { label?: string; lat?: number; lng?: number }; region?: string; providerId?: string }): Promise<ServiceRequest> =>
    (await requestService.create({ ...input, kind: "tow" })).request,
};
