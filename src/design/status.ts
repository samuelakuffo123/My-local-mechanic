import type { RequestStatus } from "../services/apiTypes";

export type StatusTone = "warning" | "info" | "success" | "neutral";

export interface StatusCopy {
  driver: string;
  provider: string;
  tone: StatusTone;
}

/** One vocabulary for request state across driver, provider and admin. */
export const REQUEST_STATUS: Record<RequestStatus, StatusCopy> = {
  requested: { driver: "Finding a provider", provider: "New request", tone: "warning" },
  accepted: { driver: "Provider confirmed", provider: "Accepted", tone: "info" },
  enRoute: { driver: "On the way", provider: "Heading to customer", tone: "info" },
  arrived: { driver: "Provider is here", provider: "At location", tone: "info" },
  diagnosing: { driver: "Checking your car", provider: "Diagnosing", tone: "info" },
  awaitingApproval: { driver: "Estimate ready: your OK needed", provider: "Waiting for customer", tone: "warning" },
  repairing: { driver: "Repair in progress", provider: "Repairing", tone: "info" },
  awaitingParts: { driver: "Waiting for parts", provider: "Awaiting parts", tone: "warning" },
  completed: { driver: "Done", provider: "Completed", tone: "success" },
  cancelled: { driver: "Cancelled", provider: "Cancelled", tone: "neutral" },
};

export const REQUEST_STATUS_ORDER: RequestStatus[] = [
  "requested",
  "accepted",
  "enRoute",
  "arrived",
  "diagnosing",
  "awaitingApproval",
  "repairing",
  "awaitingParts",
  "completed",
];

export function statusTone(status: RequestStatus): StatusTone {
  return REQUEST_STATUS[status].tone;
}
