import { useNavigate } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { useAppStore } from "../../state/store";
import DriverFeatures, { type DriverFeatureStart } from "./DriverFeatures";

export function FeatureRoute({ start }: { start: DriverFeatureStart }) {
  const navigate = useNavigate();
  const theme = useAppStore((state) => state.theme);
  return <AppLayout theme={theme}><DriverFeatures onExit={() => navigate("/app/home")} start={start} /></AppLayout>;
}
