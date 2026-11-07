import { useNavigate, useParams } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { useAppStore } from "../../state/store";
import ProviderWorkspaces from "./Workspaces";

export function ProviderRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const role = useParams().role;
  const workspace = role === "tow" || role === "vendor" ? role : "mechanic";
  return <AppLayout theme={theme} workspace><ProviderWorkspaces onExit={() => navigate("/login")} role={workspace} /></AppLayout>;
}
