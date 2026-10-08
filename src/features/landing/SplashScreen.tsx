import { useEffect, useState } from "react";
import { Navigation, Wrench } from "lucide-react";
import { LandingPlaceholder } from "./LandingPlaceholder";

export default function SplashScreen() {
  const [phase, setPhase] = useState<"splash" | "exit" | "ready">("splash");

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setPhase("exit"), reducedMotion ? 700 : 2400);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "exit") return;
    const timer = window.setTimeout(() => setPhase("ready"), 380);
    return () => window.clearTimeout(timer);
  }, [phase]);

  if (phase === "ready") return <LandingPlaceholder />;

  return (
    <main
      aria-label="MechNow is getting ready"
      className={`splash-screen${phase === "exit" ? " splash-screen--exit" : ""}`}
    >
      <span className="sr-only" role="status">MechNow is getting ready</span>
      <div className="splash-orbit splash-orbit--outer" aria-hidden="true" />
      <div className="splash-orbit splash-orbit--inner" aria-hidden="true" />

      <div className="splash-content">
        <div className="splash-emblem" aria-hidden="true">
          <span className="splash-emblem__glow" />
          <Navigation className="splash-emblem__navigation" size={49} strokeWidth={1.8} />
          <Wrench className="splash-emblem__wrench" size={19} strokeWidth={2.1} />
        </div>
        <p className="splash-wordmark">mechnow<span>.</span></p>
        <p className="splash-tagline">Your road, taken care of.</p>
        <div className="splash-loader" aria-hidden="true"><span /></div>
        <p className="splash-location">AUTOMOTIVE CARE · GHANA</p>
      </div>

      <button
        className="splash-skip"
        onClick={() => setPhase("exit")}
        type="button"
      >
        Skip intro
      </button>
    </main>
  );
}
