import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "../../components/BrandLogo";

const SPLASH_DURATION_MS = 2200;

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const completed = useRef(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(
      finish,
      reducedMotion ? 500 : SPLASH_DURATION_MS,
    );
    return () => {
      window.clearTimeout(timer);
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    };
  }, []);

  function finish() {
    if (completed.current) return;
    completed.current = true;
    setExiting(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    exitTimer.current = window.setTimeout(onComplete, reducedMotion ? 0 : 360);
  }

  return (
    <main
      aria-busy="true"
      aria-label="My Local Mechanic is getting ready"
      className={`splash-screen${exiting ? " splash-screen--exit" : ""}`}
      data-theme="light"
    >
      <div className="splash-glow splash-glow--top" aria-hidden="true" />
      <div className="splash-glow splash-glow--bottom" aria-hidden="true" />
      <div className="splash-route" aria-hidden="true">
        <span className="splash-route__dot splash-route__dot--one" />
        <span className="splash-route__dot splash-route__dot--two" />
        <span className="splash-route__dot splash-route__dot--three" />
      </div>

      <div className="splash-content">
        <span className="splash-kicker">CAR CARE, CLOSE TO HOME</span>
        <div className="splash-emblem">
          <span className="splash-emblem__halo" aria-hidden="true" />
          <span className="splash-emblem__halo splash-emblem__halo--outer" aria-hidden="true" />
          <BrandLogo compact />
          <span className="splash-emblem__spark" aria-hidden="true" />
        </div>
        <h1 className="splash-wordmark">
          <span>My Local</span>
          <strong>Mechanic</strong>
        </h1>
        <p className="splash-tagline">Friendly help for every mile.</p>
        <div
          aria-label="Loading"
          className="splash-loader"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span />
        </div>
        <p className="splash-location">YOUR JOURNEY STARTS HERE</p>
      </div>

      <button className="splash-skip" disabled={exiting} onClick={finish} type="button">
        Skip intro
      </button>
    </main>
  );
}
