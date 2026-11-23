import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "../../components/BrandLogo";

// Long enough for the car to arrive, the mechanic to appear, and the final
// frame to be read before the app hands over to the router.
const SPLASH_DURATION_MS = 2600;

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

      <div className="splash-scene" aria-hidden="true">
        <div className="splash-scene__road">
          <span />
          <span />
          <span />
        </div>
        <span className="splash-scene__link" />

        <div className="splash-scene__car">
          <svg viewBox="0 0 240 120" fill="none">
            <defs>
              <linearGradient id="splashCarPaint" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5865F2" />
                <stop offset="0.55" stopColor="#7C5CFF" />
                <stop offset="1" stopColor="#36D8E8" />
              </linearGradient>
              <linearGradient id="splashCarGlass" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#EAF6FF" />
                <stop offset="1" stopColor="#9DBBFF" />
              </linearGradient>
            </defs>
            <ellipse cx="122" cy="106" rx="98" ry="8" fill="rgba(5, 9, 35, .45)" />
            <path
              d="M26 84c0-8 6-14 14-16l32-7c8-2 14-7 20-14l18-22c4-5 10-8 16-8h32c7 0 13 3 18 8l22 24c5 6 12 9 20 11l20 5c9 2 15 9 15 18v10c0 6-5 11-11 11H37c-6 0-11-5-11-11V84Z"
              fill="url(#splashCarPaint)"
            />
            <path d="M96 47c4-5 9-8 15-8h29c5 0 10 2 13 6l16 18H79l17-16Z" fill="url(#splashCarGlass)" />
            <path d="M158 63h28c5 0 10 2 14 6l10 11h-52V63Z" fill="url(#splashCarGlass)" opacity=".82" />
            <path d="M41 86h150" stroke="rgba(255, 255, 255, .45)" strokeWidth="2" strokeLinecap="round" />
            <rect x="30" y="74" width="12" height="9" rx="4" fill="#FFF3C4" />
            <rect x="204" y="76" width="11" height="8" rx="4" fill="#FF7B87" />
            <circle cx="70" cy="99" r="15" fill="#0B1233" />
            <circle cx="70" cy="99" r="8" fill="#A6BAEA" />
            <circle cx="180" cy="99" r="15" fill="#0B1233" />
            <circle cx="180" cy="99" r="8" fill="#A6BAEA" />
          </svg>
        </div>

        <div className="splash-scene__mechanic">
          <svg viewBox="0 0 200 250" fill="none">
            <defs>
              <linearGradient id="splashOverall" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#5865F2" />
                <stop offset="1" stopColor="#7C5CFF" />
              </linearGradient>
            </defs>
            <ellipse cx="100" cy="240" rx="64" ry="8" fill="rgba(5, 9, 35, .45)" />
            <rect x="70" y="176" width="24" height="56" rx="10" fill="#141B45" />
            <rect x="106" y="176" width="24" height="56" rx="10" fill="#141B45" />
            <rect x="62" y="226" width="38" height="10" rx="5" fill="#0A0E2A" />
            <rect x="100" y="226" width="38" height="10" rx="5" fill="#0A0E2A" />
            <path d="M62 104c0-12 10-22 22-22h32c12 0 22 10 22 22v74H62v-74Z" fill="url(#splashOverall)" />
            <path d="M84 84l6 94M116 84l-6 94" stroke="rgba(255, 255, 255, .32)" strokeWidth="5" />
            <path
              d="M66 118c-14 6-18 22-10 34l12 18M134 118c14 6 18 22 10 34l-12 18"
              stroke="#E8A97E"
              strokeWidth="14"
              strokeLinecap="round"
            />
            <circle cx="100" cy="56" r="25" fill="#F1B78D" />
            <path d="M75 54c0-16 11-27 25-27s25 11 25 27H75Z" fill="#101638" />
            <path d="M70 52h60" stroke="#101638" strokeWidth="7" strokeLinecap="round" />
            <circle cx="91" cy="56" r="2" fill="#25305C" />
            <circle cx="109" cy="56" r="2" fill="#25305C" />
            <path d="M93 66c4 4 10 4 14 0" stroke="#25305C" strokeWidth="2" strokeLinecap="round" />
            <g className="splash-tablet">
              <rect x="58" y="128" width="84" height="64" rx="9" fill="#0B1033" stroke="#A6BAEA" strokeWidth="2" />
              <rect x="64" y="134" width="72" height="52" rx="5" fill="#EAF3FF" />
              <path
                d="M72 174c8-12 16-6 24-16 8-10 16-4 28-16"
                stroke="#5865F2"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="76" cy="170" r="5" fill="#EC48BD" />
              <circle cx="124" cy="146" r="5" fill="#35ED7E" />
              <rect x="68" y="140" width="34" height="5" rx="2.5" fill="#C9D6F5" />
              <rect x="68" y="149" width="22" height="4" rx="2" fill="#DCE5FA" />
            </g>
            <circle cx="60" cy="158" r="7" fill="#F1B78D" />
            <circle cx="140" cy="158" r="7" fill="#F1B78D" />
          </svg>
        </div>

        <span className="splash-scene__spark splash-scene__spark--one" />
        <span className="splash-scene__spark splash-scene__spark--two" />
      </div>

      <div className="splash-content">
        <span className="splash-brand">
          <BrandLogo compact />
        </span>
        <span className="splash-kicker">CAR CARE, CLOSE TO HOME</span>
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
