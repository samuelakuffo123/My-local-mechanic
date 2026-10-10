import { useState } from "react";
import { ArrowRight, Check, Mail, Phone, ShieldCheck, Wrench } from "lucide-react";
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
  const { pathname } = useLocation();
  const view = pathname === "/signup" ? "signup" : pathname === "/verify" ? "verify" : "login";

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("driver");
  const [otpPhone, setOtpPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      setPassword(password);
      navigate("/verify");
    });

  const verify = (value: string) =>
    run(async () => {
      const session = await authService.verifyOtp({ phone: otpPhone || phone, code: value, name: name || undefined, role });
      await signIn(session.user);
      navigate(homeFor(session.user.role));
    });

  const login = () =>
    run(async () => {
      const session = await authService.login(phone, password);
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
          {notice && <div className="auth-notice" role="status">{notice}</div>}

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
                void (view === "signup" ? requestCode() : login());
              }}
            >
              {view === "signup" && (
                <label>
                  <span>Full name</span>
                  <div className="auth-input-wrap">
                    <Mail size={17} />
                    <input onChange={(event) => setName(event.target.value)} placeholder="Your full name" value={name} />
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
                    value={phone}
                  />
                </div>
              </label>

              {view === "login" && (
                <label>
                  <span>Password</span>
                  <div className="auth-input-wrap">
                    <ShieldCheck size={17} />
                    <input
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Your password"
                      type="password"
                      value={password}
                    />
                  </div>
                </label>
              )}

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
