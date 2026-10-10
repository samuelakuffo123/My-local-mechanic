import { requestService, type CreateRequestInput } from "./requests";
import type { RequestStatus, ServiceRequest } from "./apiTypes";

// Emergency requests are service requests of kind "emergency". The frontend
// state machine (state/emergencyMachine.ts) still drives the walkthrough UI,
// but persistence and progress now go through the backend-backed requests
// service so the flow survives a reload and is visible to providers.
export interface EmergencyService {
  submit(input: Omit<CreateRequestInput, "kind">): Promise<ServiceRequest>;
  progress(id: string, to: RequestStatus): Promise<ServiceRequest>;
  cancel(id: string, reason: string): Promise<ServiceRequest>;
  active(): Promise<ServiceRequest | null>;
}

function pickActive(items: ServiceRequest[]): ServiceRequest | null {
  return items.find((item) => item.status !== "completed" && item.status !== "cancelled") ?? null;
}

export const emergencyService: EmergencyService = {
  submit: async (input) => (await requestService.create({ ...input, kind: "emergency" })).request,
  progress: (id, to) => requestService.transition(id, to),
  cancel: (id, reason) => requestService.cancel(id, reason),
  active: async () => pickActive(await requestService.list()),
};
