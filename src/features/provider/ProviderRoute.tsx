import { useNavigate, useParams } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import ProviderWorkspaces from "./Workspaces";

export function ProviderRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const role = useParams().role;
  const workspace = role === "tow" || role === "vendor" ? role : "mechanic";
  return <DeviceFrame theme={theme}><ProviderWorkspaces onExit={() => navigate("/login")} role={workspace} /></DeviceFrame>;
}
