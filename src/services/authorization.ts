import type { Role, User } from "../state/types";
import { ApiError } from "./mockApi";

export function requireRole(user: User | null, allowed: Role[]) {
  if (!user) throw new ApiError("Sign in to continue.", 401);
  if (!allowed.includes(user.role)) throw new ApiError("You don't have permission to access this workspace.", 403);
  return user;
}
