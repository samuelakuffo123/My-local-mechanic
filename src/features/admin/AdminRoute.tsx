import { useNavigate } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import AdminWorkspace from "./AdminWorkspace";

export function AdminRoute() {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  const signOut = useAppStore((state) => state.signOut);
  const exit = () => {
    void signOut().finally(() => navigate("/login", { replace: true }));
  };
  return (
    <DeviceFrame theme={theme}>
      <AdminWorkspace onExit={exit} />
    </DeviceFrame>
  );
}
