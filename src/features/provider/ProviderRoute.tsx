import { useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import ProviderWorkspaces, { type ProviderRole } from "./Workspaces";

function isProviderRole(role: string | undefined): role is ProviderRole {
  return role === "mechanic" || role === "tow" || role === "vendor";
}

export function ProviderRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const userRole = useAppStore((state) => state.user?.role);
  const signOut = useAppStore((state) => state.signOut);
  const roleParam = useParams().role;

  useEffect(() => {
    if (!isProviderRole(userRole)) return;
    if (roleParam !== userRole) navigate(`/pro/${userRole}`, { replace: true });
  }, [navigate, roleParam, userRole]);

  const exit = () => {
    void signOut().finally(() => navigate("/login", { replace: true }));
  };

  if (!isProviderRole(userRole)) return null;

  return (
    <DeviceFrame theme={theme}>
      <ProviderWorkspaces onExit={exit} role={userRole} />
    </DeviceFrame>
  );
}
