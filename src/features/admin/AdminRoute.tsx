import { useNavigate } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { useAppStore } from "../../state/store";
import ProviderWorkspaces from "../provider/Workspaces";

export function AdminRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  return <AppLayout theme={theme} workspace><ProviderWorkspaces onExit={() => navigate("/login")} role="admin" /></AppLayout>;
}
