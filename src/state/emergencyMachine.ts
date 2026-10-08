export type EmergencyStatus =
  | "idle"
  | "choosingProblem"
  | "locating"
  | "searching"
  | "results"
  | "confirming"
  | "requested"
  | "providerDeclined"
  | "noProvider"
  | "matched"
  | "enRoute"
  | "nearby"
  | "arrived"
  | "diagnosing"
  | "awaitingApproval"
  | "repairing"
  | "awaitingParts"
  | "completed"
  | "paying"
  | "paid"
  | "reviewed"
  | "cancelled"
  | "offline";

export interface EmergencyRequest {
  id: string;
  status: EmergencyStatus;
  problem?: string;
  location?: { label: string; lat: number; lng: number };
  providerId?: string;
  createdAt: string;
  updatedAt: string;
}

const transitions: Record<EmergencyStatus, EmergencyStatus[]> = {
  idle: ["choosingProblem"],
  choosingProblem: ["locating", "cancelled"],
  locating: ["searching", "offline", "cancelled"],
  searching: ["results", "noProvider", "offline", "cancelled"],
  results: ["confirming", "searching", "cancelled"],
  confirming: ["requested", "results", "offline", "cancelled"],
  requested: ["providerDeclined", "matched", "noProvider", "offline", "cancelled"],
  providerDeclined: ["searching", "matched", "noProvider", "cancelled"],
  noProvider: ["searching", "cancelled"],
  matched: ["enRoute", "cancelled"],
  enRoute: ["nearby", "cancelled"],
  nearby: ["arrived", "cancelled"],
  arrived: ["diagnosing", "cancelled"],
  diagnosing: ["awaitingApproval", "cancelled"],
  awaitingApproval: ["repairing", "cancelled"],
  repairing: ["awaitingParts", "completed"],
  awaitingParts: ["repairing", "completed"],
  completed: ["paying"],
  paying: ["paid", "completed", "offline"],
  paid: ["reviewed"],
  reviewed: [],
  cancelled: [],
  offline: ["searching", "confirming", "paying", "cancelled"],
};

export function canTransition(from: EmergencyStatus, to: EmergencyStatus) {
  return transitions[from].includes(to);
}

export function transitionEmergency(request: EmergencyRequest, to: EmergencyStatus): EmergencyRequest {
  if (!canTransition(request.status, to)) {
    throw new Error(`Illegal emergency transition: ${request.status} → ${to}`);
  }
  return { ...request, status: to, updatedAt: new Date().toISOString() };
}
