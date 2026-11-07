import { apiRequest } from "./api";
import type { EmergencyRequest } from "../state/emergencyMachine";
import type { User } from "../state/types";

export const emergencyService = {
  save: (request: EmergencyRequest, _user: User | null) =>
    apiRequest<EmergencyRequest>("/emergency", { method: "PUT", body: request }),
  resume: () => apiRequest<EmergencyRequest | null>("/emergency"),
  cancel: (request: EmergencyRequest) =>
    apiRequest<EmergencyRequest>("/emergency/cancel", { method: "POST", body: { id: request.id } }),
};
