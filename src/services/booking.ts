import { requestService } from "./requests";
import type { ServiceRequest } from "./apiTypes";

// A booking is a scheduled service request (kind "booking"). Scheduling detail
// is currently expressed through the request's problem/description until a
// dedicated calendar/staffing model is added.
export interface BookingService {
  list(): Promise<ServiceRequest[]>;
  create(input: { vehicleId: string; providerId?: string; service: string; problem: string; region?: string }): Promise<ServiceRequest>;
}

export const bookingService: BookingService = {
  list: async () => (await requestService.list()).filter((item) => item.kind === "booking"),
  create: async (input) =>
    (await requestService.create({
      vehicleId: input.vehicleId,
      providerId: input.providerId,
      kind: "booking",
      problem: input.problem,
      region: input.region,
    })).request,
};
