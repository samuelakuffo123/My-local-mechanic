import { AppLayout } from "../../components/AppLayout";
import { useAppStore } from "../../state/store";
import DriverApp from "./DriverApp";

export function DriverRoute({ screen = "home" }: { screen?: "home" | "profile" | "need" }) {
  const theme = useAppStore((state) => state.theme);
  return <AppLayout theme={theme}><DriverApp initialScreen={screen} /></AppLayout>;
}
