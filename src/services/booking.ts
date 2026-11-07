import { apiRequest } from "./api";
import type { User } from "../state/types";

export interface Booking { id: string; providerId: string; vehicleId: string; startsAt: string; service: string }
export const bookingService = {
  list: () => apiRequest<Booking[]>("/bookings"),
  create: (input: Omit<Booking, "id">, _user: User | null) =>
    apiRequest<Booking>("/bookings", { method: "POST", body: input }),
};
