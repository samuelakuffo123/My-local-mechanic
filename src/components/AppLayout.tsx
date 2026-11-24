import type { ReactNode } from "react";
import type { Theme } from "../state/types";

export function AppLayout({
  children,
  theme,
  workspace = false,
  app = "driver",
}: {
  children: ReactNode;
  theme: Theme;
  workspace?: boolean;
  app?: "driver" | "tow" | "mechanic" | "vendor" | "admin";
}) {
  return (
    <div
      className={`app-layout${workspace ? " app-layout--wide" : ""}`}
      data-app={app}
      data-theme={theme}
    >
      {children}
    </div>
  );
}
