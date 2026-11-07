// Server-authoritative job lifecycle. The client may render states, but only
// the server decides which transitions are legal and who may perform them.
// Mirrors the guard logic of the frontend emergencyMachine, extended with the
// booking/tow kinds and an explicit actor policy.

export type RequestStatus =
  | "requested"
  | "accepted"
  | "enRoute"
  | "arrived"
  | "diagnosing"
  | "awaitingApproval"
  | "repairing"
  | "awaitingParts"
  | "completed"
  | "cancelled";

export type ActorRole = "customer" | "provider" | "admin";

const transitions: Record<RequestStatus, RequestStatus[]> = {
  requested: ["accepted", "cancelled"],
  accepted: ["enRoute", "cancelled"],
  enRoute: ["arrived", "cancelled"],
  arrived: ["diagnosing", "cancelled"],
  diagnosing: ["awaitingApproval", "cancelled"],
  awaitingApproval: ["repairing", "cancelled"],
  repairing: ["awaitingParts", "completed", "cancelled"],
  awaitingParts: ["repairing", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

// Which roles may drive a given target status.
const roleForTransition: Partial<Record<RequestStatus, ActorRole[]>> = {
  accepted: ["provider"],
  enRoute: ["provider"],
  arrived: ["provider"],
  diagnosing: ["provider"],
  awaitingApproval: ["provider"],
  repairing: ["provider"],
  awaitingParts: ["provider"],
  completed: ["provider"],
  cancelled: ["customer", "admin", "provider"],
};

export function canTransition(from: RequestStatus, to: RequestStatus) {
  return (transitions[from] ?? []).includes(to);
}

export function assertTransition(from: RequestStatus, to: RequestStatus, actorRole: ActorRole) {
  if (!canTransition(from, to)) {
    return { ok: false as const, reason: `Illegal transition ${from} → ${to}.` };
  }
  const allowed = roleForTransition[to] ?? [];
  if (!allowed.includes(actorRole)) {
    return { ok: false as const, reason: `${actorRole} may not move a job to ${to}.` };
  }
  return { ok: true as const };
}

export function nextStatuses(from: RequestStatus, actorRole: ActorRole) {
  return (transitions[from] ?? []).filter((to) => (roleForTransition[to] ?? []).includes(actorRole));
}

export const terminalStatuses: RequestStatus[] = ["completed", "cancelled"];
