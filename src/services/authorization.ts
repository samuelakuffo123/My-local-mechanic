import type { Role, User } from "../state/types";
import { ApiError } from "./mockApi";

export function requireRole(user: User | null, roles: readonly Role[]): asserts user is User {
  if (!user || !roles.includes(user.role)) {
    throw new ApiError("You don't have permission to do that.", user ? 403 : 401);
  }
}
