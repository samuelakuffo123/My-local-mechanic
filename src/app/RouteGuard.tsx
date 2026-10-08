import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { useAppStore } from "../state/store";
import type { Role } from "../state/types";

export function RouteGuard({ allowed, children }: { allowed: Role[]; children: ReactNode }) {
  const authenticated = useAppStore((state) => state.authenticated);
  const role = useAppStore((state) => state.user?.role);
  const location = useLocation();
  if (!authenticated) return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  if (!role || !allowed.includes(role)) return <Navigate replace to={role === "driver" ? "/app/home" : "/login"} />;
  return children;
}
