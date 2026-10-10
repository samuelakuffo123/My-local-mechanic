import { Radio } from "lucide-react";
import { Moon, Sun } from "lucide-react";
import type { ReactNode } from "react";
import type { Theme } from "../state/types";
import { useAppStore } from "../state/store";

export function DeviceFrame({ children, theme }: { children: ReactNode; theme: Theme }) {
  const setTheme = useAppStore((state) => state.setTheme);
  return (
    <div className="app-shell" data-theme={theme}>
      <div className="phone-frame">
        <div className="status-bar" aria-hidden="true"><span>9:41</span><div className="status-bar__icons"><Radio size={14} /><span className="battery">87</span></div></div>
        {children}
      </div>
      <aside className="device-controls" aria-label="Preview controls">
        <button aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
      </aside>
    </div>
  );
}
