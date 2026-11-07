import type { ReactNode } from "react";
import type { Theme } from "../state/types";

export function AppLayout({
  children,
  theme,
  workspace = false,
}: {
  children: ReactNode;
  theme: Theme;
  workspace?: boolean;
}) {
  return (
    <div className={`app-layout${workspace ? " app-layout--wide" : ""}`} data-theme={theme}>
      {children}
    </div>
  );
}
