import { Link } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";

export function ActivityRoute() {
  const theme = useAppStore((state) => state.theme);
  return <DeviceFrame theme={theme}><main className="route-placeholder"><span>ACTIVITY</span><h1>Your activity</h1><p>Completed services, receipts, orders, and support updates will appear here.</p><Link to="/app/home">Back to Home</Link></main></DeviceFrame>;
}
