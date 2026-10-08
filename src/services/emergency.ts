import { mockRequest, readPersisted, writePersisted } from "./mockApi";
import type { EmergencyRequest } from "../state/emergencyMachine";
import type { User } from "../state/types";
import { requireRole } from "./authorization";

export const emergencyService = {
  save: (request: EmergencyRequest, user: User | null) => mockRequest(() => {
    requireRole(user, ["driver"]);
    return writePersisted("emergency", request);
  }, { failureRate: .06 }),
  resume: () => mockRequest(() => readPersisted<EmergencyRequest | null>("emergency", null), { failureRate: 0 }),
  cancel: (request: EmergencyRequest) => mockRequest(() => writePersisted("emergency", { ...request, status: "cancelled" as const })),
};
