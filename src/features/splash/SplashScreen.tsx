import { useEffect, useRef, useState } from "react";
import "./splash.css";

// Long enough for the mark to land, the wordmark to settle and the tagline to be
// read, short enough to never feel like waiting.
const SPLASH_DURATION_MS = 1900;
const EXIT_MS = 320;

// Wrench outline from Lucide (ISC licence), drawn inside a location pin.
const WRENCH_PATH =
  "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z";

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const completed = useRef(false);
  const [exiting, setExiting] = useState(false);
  const exitTimer = useRef<number | null>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(finish, reducedMotion ? 500 : SPLASH_DURATION_MS);
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
    exitTimer.current = window.setTimeout(onComplete, reducedMotion ? 0 : EXIT_MS);
  }

  return (
    <main
      aria-busy="true"
      aria-label="MechNow is getting ready"
      className={`sp-screen${exiting ? " sp-screen--exit" : ""}`}
    >
      <div className="sp-center">
        <svg aria-hidden="true" className="sp-mark" viewBox="0 0 120 150">
          <defs>
            <linearGradient id="spPin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#5865F2" />
              <stop offset="1" stopColor="#7C5CFF" />
            </linearGradient>
          </defs>
          <ellipse className="sp-ripple sp-ripple--one" cx="60" cy="134" rx="22" ry="6" />
          <ellipse className="sp-ripple sp-ripple--two" cx="60" cy="134" rx="22" ry="6" />
          <g className="sp-pin">
            <path d="M60 128C60 128 16 88 16 52a44 44 0 0 1 88 0c0 36-44 76-44 76z" fill="url(#spPin)" />
            <g transform="translate(36 28) scale(2)">
              <g className="sp-wrench">
                <path d={WRENCH_PATH} fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          </g>
        </svg>

        <h1 className="sp-wordmark">
          <span>Mech</span>
          <strong>Now</strong>
        </h1>
        <p className="sp-tagline">Car care, close to home.</p>
      </div>
    </main>
  );
}
