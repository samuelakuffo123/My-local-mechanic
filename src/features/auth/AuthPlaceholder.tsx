import { ArrowRight, Check, Mail, Phone, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";

export function AuthPlaceholder() {
  const theme = useAppStore((state) => state.theme);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const view = pathname === "/signup" ? "signup" : pathname === "/verify" ? "verify" : "login";

  const title = view === "signup" ? "Create your account" : view === "verify" ? "Verify your phone" : "Welcome back";

  const subtitle =
    view === "signup"
      ? "Set up your driver profile and get roadside help in minutes."
      : view === "verify"
        ? "We’ve sent a 6-digit code to your phone to secure your account."
        : "Sign in to manage your vehicles, bookings, and emergency requests.";

  return (
    <DeviceFrame theme={theme}>
      <main className="auth-page">
        <div className="auth-card">
          <span className="auth-kicker">MECHNOW ACCOUNT</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>

          {view === "verify" ? (
            <div className="auth-form auth-form--verify">
              <div className="otp-stack" aria-label="One-time passcode entry">
                {Array.from({ length: 6 }).map((_, index) => (
                  <input aria-label={`Digit ${index + 1}`} defaultValue={index === 0 ? "4" : ""} key={index} maxLength={1} type="text" />
                ))}
              </div>
              <button className="auth-submit" onClick={() => navigate("/app/home")} type="button">
                Verify & continue <ArrowRight size={17} />
              </button>
              <button className="auth-link" type="button">Resend code</button>
            </div>
          ) : (
            <div className="auth-form">
              <label>
                <span>{view === "signup" ? "Full name" : "Phone or email"}</span>
                <div className="auth-input-wrap">
                  {view === "signup" ? <Mail size={17} /> : <Phone size={17} />}
                  <input
                    defaultValue={view === "signup" ? "Kwame Asante" : "+233 24 123 4567"}
                    placeholder={view === "signup" ? "Your full name" : "Enter your phone or email"}
                  />
                </div>
              </label>

              {view === "signup" && (
                <label>
                  <span>Phone number</span>
                  <div className="auth-input-wrap">
                    <Phone size={17} />
                    <input defaultValue=" +233 24 123 4567" placeholder="Your mobile number" />
                  </div>
                </label>
              )}

              <label>
                <span>Password</span>
                <div className="auth-input-wrap">
                  <ShieldCheck size={17} />
                  <input defaultValue="••••••••" placeholder="Create a password" type="password" />
                </div>
              </label>

              <button className="auth-submit" onClick={() => navigate(view === "signup" ? "/verify" : "/app/home")} type="button">
                {view === "signup" ? "Create account" : "Sign in"} <ArrowRight size={17} />
              </button>

              <div className="auth-meta">
                <span>
                  <Check size={14} />
                  Verified providers
                </span>
                <span>
                  <Check size={14} />
                  Upfront pricing
                </span>
              </div>
            </div>
          )}
        </div>
      </main>
    </DeviceFrame>
  );
}
