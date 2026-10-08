import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import DriverApp from "./DriverApp";

export function DriverRoute({ screen = "home" }: { screen?: "home" | "profile" | "need" }) {
  const theme = useAppStore((state) => state.theme);
  return <DeviceFrame theme={theme}><DriverApp initialScreen={screen} /></DeviceFrame>;
}
