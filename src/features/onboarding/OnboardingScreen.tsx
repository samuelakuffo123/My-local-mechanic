import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CarFront, MapPin, Route, ShieldCheck, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router";

import { BrandLogo } from "../../components/BrandLogo";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import { completeOnboarding } from "./onboardingState";
import "./onboarding.css";

interface Slide {
  key: string;
  kicker: string;
  title: string;
  body: string;
  badge: string;
  chip: string;
  icon: LucideIcon;
}

const SLIDES: Slide[] = [
  {
    key: "roadside",
    kicker: "ROADSIDE HELP, CLOSE TO HOME",
    title: "Help arrives where you are.",
    body: "Share your location and get matched with trusted local help in minutes—no guessing, no long calls.",
    badge: "LIVE LOCATION",
    chip: "Nearby pros",
    icon: CarFront,
  },
  {
    key: "trusted",
    kicker: "VERIFIED LOCAL PROFESSIONALS",
    title: "Book the right mechanic.",
    body: "Compare verified mechanics, towing teams, and parts vendors with clear pricing before you commit.",
    badge: "UPFRONT PRICING",
    chip: "Verified",
    icon: ShieldCheck,
  },
  {
    key: "tracking",
    kicker: "ONE CALM JOURNEY",
    title: "Follow every step to sorted.",
    body: "Track your provider live, chat in the app, and keep every job in one tidy service history.",
    badge: "LIVE TRACKING",
    chip: "Job updates",
    icon: Route,
  },
];

export function OnboardingScreen() {
  const theme = useAppStore((state) => state.theme);
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const slide = SLIDES[step];
  const Icon = slide.icon;
  const isLast = step === SLIDES.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  function finish(destination: string) {
    completeOnboarding();
    navigate(destination, { replace: true });
  }

  function advance() {
    if (isLast) {
      finish("/signup");
      return;
    }
    setStep((current) => current + 1);
  }

  return (
    <DeviceFrame theme={theme}>
      <main className="onboarding-page">
        <header className="onboarding-header">
          <BrandLogo />
          <button className="onboarding-skip" onClick={() => finish("/signup")} type="button">
            Skip
          </button>
        </header>

        <div className="onboarding-progress-meta">
          <span>Getting started</span>
          <span>{step + 1} / {SLIDES.length}</span>
        </div>
        <div
          aria-label={`Onboarding step ${step + 1} of ${SLIDES.length}`}
          className="onboarding-progress"
          role="group"
        >
          {SLIDES.map((item, index) => (
            <button
              aria-current={index === step ? "step" : undefined}
              aria-label={`Go to step ${index + 1}: ${item.title}`}
              className={index === step ? "active" : index < step ? "complete" : ""}
              key={item.key}
              onClick={() => setStep(index)}
              type="button"
            />
          ))}
        </div>

        <section className="onboarding-stage" aria-live="polite">
          <div className={`onboarding-visual onboarding-visual--${slide.key}`}>
            <div aria-hidden="true" className="onboarding-visual__grid" />
            <div aria-hidden="true" className="onboarding-visual__ring onboarding-visual__ring--outer" />
            <div aria-hidden="true" className="onboarding-visual__ring onboarding-visual__ring--inner" />
            <div className="onboarding-visual__icon">
              <Icon aria-hidden="true" size={52} strokeWidth={1.8} />
            </div>
            <span className="onboarding-chip onboarding-chip--top">
              <MapPin aria-hidden="true" size={13} /> {slide.chip}
            </span>
            <span className="onboarding-chip onboarding-chip--bottom">{slide.badge}</span>
          </div>

          <div className="onboarding-copy" key={slide.key}>
            <span className="onboarding-kicker">{slide.kicker}</span>
            <h1 className="onboarding-title" ref={headingRef} tabIndex={-1}>
              {slide.title}
            </h1>
            <p>{slide.body}</p>
          </div>
        </section>

        <div className="onboarding-actions">
          <div className="onboarding-action-row">
            {step > 0 && (
              <button
                aria-label="Previous step"
                className="onboarding-back"
                onClick={() => setStep((current) => current - 1)}
                type="button"
              >
                <ArrowLeft aria-hidden="true" size={18} />
              </button>
            )}
            <button className="onboarding-continue" onClick={advance} type="button">
              {isLast ? "Create my account" : "Continue"} <ArrowRight aria-hidden="true" size={17} />
            </button>
          </div>
          <div className="onboarding-footer">
            <span>Already have an account?</span>
            <button onClick={() => finish("/login")} type="button">Sign in</button>
          </div>
        </div>
      </main>
    </DeviceFrame>
  );
}
