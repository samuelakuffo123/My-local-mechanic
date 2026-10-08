import { Radio } from "lucide-react";
import { Monitor, Moon, Smartphone, Sun } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { Theme } from "../state/types";
import { useAppStore } from "../state/store";

export function DeviceFrame({ children, theme, workspace = false }: { children: ReactNode; theme: Theme; workspace?: boolean }) {
  const [preview, setPreview] = useState<"mobile" | "desktop">("mobile");
  const setTheme = useAppStore((state) => state.setTheme);
  return (
    <div className={`app-shell ${workspace ? "app-shell--wide" : ""} ${preview === "desktop" ? "device-preview--desktop" : ""}`} data-theme={theme}>
      <div className={`phone-frame ${workspace ? "phone-frame--wide" : ""}`}>
        {!workspace && <div className="status-bar" aria-hidden="true"><span>9:41</span><div className="status-bar__icons"><Radio size={14} /><span className="battery">87</span></div></div>}
        {children}
      </div>
      {!workspace && <aside className="device-controls" aria-label="Preview controls">
        <button aria-label={`Use ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} type="button">{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
        <button aria-label={`View ${preview === "mobile" ? "desktop" : "mobile"} layout`} onClick={() => setPreview(preview === "mobile" ? "desktop" : "mobile")} type="button">{preview === "mobile" ? <Monitor size={16} /> : <Smartphone size={16} />}<span>{preview === "mobile" ? "View on desktop" : "View on mobile"}</span></button>
      </aside>}
    </div>
  );
}
