import { useState } from "react";
import { ArrowRight, Check, Mail, Phone, Wrench } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { DeviceFrame } from "../../components/DeviceFrame";
import { useAppStore } from "../../state/store";
import { authService } from "../../services/auth";
import { ApiError } from "../../services/mockApi";
import type { Role } from "../../state/types";

const ROLES: { value: Role; label: string }[] = [
  { value: "driver", label: "Vehicle owner" },
  { value: "mechanic", label: "Mechanic" },
  { value: "tow", label: "Towing" },
  { value: "vendor", label: "Parts vendor" },
];

function homeFor(role: Role): string {
  if (role === "driver") return "/app/home";
  if (role === "admin") return "/admin";
  return "/pro";
}

export function AuthPlaceholder() {
  const theme = useAppStore((state) => state.theme);
  const signIn = useAppStore((state) => state.signIn);
  const navigate = useNavigate();
  const { pathname, state: locationState } = useLocation();
  const view = pathname === "/signup" ? "signup" : pathname === "/verify" ? "verify" : "login";

  const savedState = locationState as { name?: string; phone?: string; role?: Role; devCode?: string } | null;
  const [name, setName] = useState(savedState?.name ?? "");
  const [phone, setPhone] = useState(savedState?.phone ?? "");
  const [role, setRole] = useState<Role>(savedState?.role ?? "driver");
  const [otpPhone, setOtpPhone] = useState(savedState?.phone ?? "");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(savedState?.devCode ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleNotice, setGoogleNotice] = useState(false);

  const title = view === "signup" ? "Create your account" : view === "verify" ? "Verify your phone" : "Welcome back";
  const subtitle =
    view === "signup"
      ? "Set up your profile and get roadside help in minutes."
      : view === "verify"
        ? "Enter the 6-digit code we sent to your phone."
        : "Sign in to manage your vehicles, bookings, and requests.";

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      const result = await authService.requestOtp(phone);
      setOtpPhone(phone);
      setDevCode(result.devCode ?? null);
      navigate("/verify", { state: { phone, name, role, devCode: result.devCode } });
    });

  const verify = (value: string) =>
    run(async () => {
      const session = await authService.verifyOtp({ phone: otpPhone || phone, code: value, name: name || undefined, role });
      await signIn(session.user);
      navigate(homeFor(session.user.role));
    });

  return (
    <DeviceFrame theme={theme}>
      <main className="auth-page">
        <div className="auth-card">
          <span className="auth-kicker">MECHNOW ACCOUNT</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>

          {error && <div className="auth-error" role="alert">{error}</div>}
          {view === "verify" ? (
            <form
              className="auth-form auth-form--verify"
              onSubmit={(event) => {
                event.preventDefault();
                void verify(code);
              }}
            >
              {devCode && <div className="auth-notice" role="status">Development code: <strong>{devCode}</strong></div>}
              <div className="otp-stack" aria-label="One-time passcode entry">
                <input
                  aria-label="Verification code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  value={code}
                />
              </div>
              <button className="auth-submit" disabled={busy || code.length !== 6} type="submit">
                Verify &amp; continue <ArrowRight size={17} />
              </button>
              <button className="auth-link" disabled={busy} onClick={() => void requestCode()} type="button">Resend code</button>
            </form>
          ) : (
            <form
              className="auth-form"
              onSubmit={(event) => {
                event.preventDefault();
                void requestCode();
              }}
            >
              <button className="auth-google" onClick={() => setGoogleNotice(true)} type="button">
                <svg aria-hidden="true" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" transform="translate(0 4)" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.94c4.46-4.13 7.12-10.2 7.12-17.59Z" />
                  <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" transform="translate(0 4)" />
                  <path fill="#34A853" d="M24 48c6.47 0 11.91-2.13 15.88-5.81l-7.65-5.94c-2.13 1.43-4.85 2.28-8.23 2.28-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" transform="translate(0 -4)" />
                </svg>
                Continue with Google
              </button>
              {googleNotice && (
                <p className="auth-google-notice" role="status">
                  Google sign-in isn’t configured yet. Use your phone number to continue.
                </p>
              )}
              <div className="auth-divider"><span>or continue with phone</span></div>

              {view === "signup" && (
                <label>
                  <span>Full name</span>
                  <div className="auth-input-wrap">
                    <Mail size={17} />
                    <input onChange={(event) => setName(event.target.value)} placeholder="Your full name" required value={name} />
                  </div>
                </label>
              )}

              <label>
                <span>Phone number</span>
                <div className="auth-input-wrap">
                  <Phone size={17} />
                  <input
                    autoComplete="tel"
                    inputMode="tel"
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="+233 24 123 4567"
                    required
                    value={phone}
                  />
                </div>
              </label>

              {view === "signup" && (
                <label>
                  <span>I am a</span>
                  <div className="auth-role-grid">
                    {ROLES.map((option) => (
                      <button
                        className={role === option.value ? "selected" : ""}
                        key={option.value}
                        onClick={() => setRole(option.value)}
                        type="button"
                      >
                        <Wrench size={15} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </label>
              )}

              <button className="auth-submit" disabled={busy} type="submit">
                {view === "signup" ? (busy ? "Sending code…" : "Send verification code") : busy ? "Signing in…" : "Sign in"} <ArrowRight size={17} />
              </button>

              <div className="auth-meta">
                <span><Check size={14} /> Verified providers</span>
                <span><Check size={14} /> Upfront pricing</span>
              </div>

              <button
                className="auth-link"
                onClick={() => navigate(view === "signup" ? "/login" : "/signup")}
                type="button"
              >
                {view === "signup" ? "Already have an account? Sign in" : "New to MechNow? Create an account"}
              </button>
            </form>
          )}
        </div>
      </main>
    </DeviceFrame>
  );
}
