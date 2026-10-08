import { Link, useLocation } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";

export function OnboardingPlaceholder() {
  const theme = useAppStore((state) => state.theme);
  const { pathname } = useLocation();
  return <DeviceFrame theme={theme}><main className="route-placeholder"><span>ONBOARDING</span><h1>{pathname === "/welcome" ? "Help, on the road." : "Set up MechNow"}</h1><p>Your progress is routed and resumable. The complete onboarding experience is implemented in Phase 2.</p><Link to="/signup">Get started</Link></main></DeviceFrame>;
}
