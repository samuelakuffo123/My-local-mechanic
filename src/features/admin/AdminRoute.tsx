import { useNavigate } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import ProviderWorkspaces from "../provider/Workspaces";

export function AdminRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  return <DeviceFrame theme={theme} workspace><ProviderWorkspaces onExit={() => navigate("/login")} role="admin" /></DeviceFrame>;
}
