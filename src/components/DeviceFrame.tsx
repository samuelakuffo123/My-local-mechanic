import type { ReactNode } from "react";
import type { Theme } from "../state/types";

/**
 * Page shell for the auth, onboarding and provider/admin screens.
 * It is a normal responsive column: full-width on phones, a centred
 * column on larger screens. There is no fake device bezel, status bar
 * or floating preview controls. The theme is changed from Profile.
 */
export function DeviceFrame({
  children,
  theme,
  app = "driver",
}: {
  children: ReactNode;
  theme: Theme;
  app?: "driver" | "tow" | "mechanic" | "vendor" | "admin";
}) {
  return (
    <div className="app-shell" data-app={app} data-theme={theme}>
      <div className="phone-frame">{children}</div>
    </div>
  );
}
