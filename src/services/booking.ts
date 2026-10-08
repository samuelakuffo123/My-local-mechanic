import { mockRequest, readPersisted, writePersisted } from "./mockApi";
import type { User } from "../state/types";
import { requireRole } from "./authorization";
export interface Booking { id: string; providerId: string; vehicleId: string; startsAt: string; service: string }
export const bookingService = {
  list: () => mockRequest(() => readPersisted<Booking[]>("bookings", [])),
  create: (input: Omit<Booking, "id">, user: User | null) => mockRequest(() => {
    requireRole(user, ["driver"]);
    const items = readPersisted<Booking[]>("bookings", []);
    const booking = { ...input, id: crypto.randomUUID() };
    writePersisted("bookings", [...items, booking]);
    return booking;
  }),
};
