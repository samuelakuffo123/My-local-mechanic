import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAppStore } from "../../state/store";
import { authService, type GoogleConfig } from "../../services/auth";
import { preloadGoogleIdentity, requestGoogleAccessToken } from "../../services/googleIdentity";
import { errorMessage } from "../../services/errorMessage";
import { completeProfileSetup, needsProfileSetup } from "../onboarding/onboardingState";
import type { Role, User } from "../../state/types";
import "./auth.css";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

const ROLES: { value: Role; label: string }[] = [
  { value: "driver", label: "Vehicle owner" },
  { value: "mechanic", label: "Mechanic" },
  { value: "tow", label: "Towing" },
  { value: "vendor", label: "Parts vendor" },
];

type AuthMode = "login" | "signup";
type PendingOtp = {
  phone?: string;
  name?: string;
  role?: Role;
  devCode?: string;
  mode?: AuthMode;
};

const PENDING_KEY = "mechnow:otp-pending";

function readPendingOtp(): PendingOtp | null {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? "null") as PendingOtp | null;
  } catch {
    return null;
  }
}

function clearPendingOtp() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage unavailable (private mode): nothing to clear.
  }
}

function localDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits.slice(3);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

function canonicalPhone(value: string): string | null {
  const digits = localDigits(value);
  return digits.length === 9 ? `+233${digits}` : null;
}

function formatPhone(value: string): string {
  const digits = localDigits(value).slice(0, 9);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

function emptyDigits(): string[] {
  return Array.from({ length: OTP_LENGTH }, () => "");
}

function homeFor(role: Role): string {
  if (role === "driver") return "/app/home";
  if (role === "admin") return "/admin";
  return `/pro/${role}`;
}

export function AuthPlaceholder() {
  const signIn = useAppStore((state) => state.signIn);
  const navigate = useNavigate();
  const { pathname, state: locationState } = useLocation();
  const view = pathname === "/signup" ? "signup" : pathname === "/verify" ? "verify" : "login";

  const savedState = locationState as PendingOtp | null;
  // A reload on /verify loses router state, so fall back to the session copy.
  const seed = savedState ?? (view === "verify" ? readPendingOtp() : null);
  const initialMode: AuthMode = seed?.mode ?? (view === "signup" ? "signup" : "login");

  const [name, setName] = useState(seed?.name ?? "");
  const [phone, setPhone] = useState(seed?.phone ? formatPhone(seed.phone) : "");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [role, setRole] = useState<Role>(seed?.role ?? "driver");
  const [otpPhone, setOtpPhone] = useState(seed?.phone ?? "");
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [devCode, setDevCode] = useState<string | null>(seed?.devCode ?? null);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig | null>(null);
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const mode: AuthMode = view === "verify" ? initialMode : view === "signup" ? "signup" : "login";
  const validPhone = canonicalPhone(phone) !== null;
  const phoneError = phoneTouched && !validPhone ? "Enter a valid Ghana number" : null;
  const canSubmitPhone = validPhone && (mode !== "signup" || name.trim().length > 0);

  useEffect(() => {
    let active = true;
    void authService.googleConfig()
      .then((result) => {
        if (!active) return;
        setGoogleConfig(result);
        if (result.enabled && result.clientId) void preloadGoogleIdentity().catch(() => undefined);
      })
      .catch(() => {
        if (active) setGoogleConfig({ enabled: false, clientId: null });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (view !== "verify") return;
    setResendIn(RESEND_SECONDS);
    setDigits(emptyDigits());
    const timer = window.setInterval(() => {
      setResendIn((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  const title = view === "verify" ? "Verify your phone" : view === "signup" ? "Create your account" : "Welcome back";
  const subtitle = view === "verify"
    ? "Enter the 6-digit code we sent to your phone."
    : view === "signup"
      ? "Set up your profile and get roadside help in minutes."
      : "Sign in to manage your vehicles, bookings and requests.";

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught, "We couldn't continue. Check your details and try again."));
    } finally {
      setBusy(false);
    }
  };

  const finishSignIn = async (user: User) => {
    await signIn(user);
    const { activeVehicle } = useAppStore.getState();
    const hasVehicle = Boolean(activeVehicle);

    // Existing accounts with a car are already set up; don't send them back
    // through onboarding just because they signed in before this flow existed.
    if (user.role === "driver" && hasVehicle) completeProfileSetup(user.id);

    if (user.role === "driver" && needsProfileSetup(user.id, hasVehicle)) {
      navigate("/onboarding", { replace: true });
      return;
    }
    navigate(homeFor(user.role), { replace: true });
  };

  const sendCode = (target: string, flow: AuthMode) =>
    run(async () => {
      const result = await authService.requestOtp(target);
      const pending: PendingOtp = {
        phone: target,
        name: name.trim() || undefined,
        role,
        devCode: result.devCode,
        mode: flow,
      };
      try {
        sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      } catch {
        // Storage unavailable; the router state below still carries the flow.
      }
      setOtpPhone(target);
      setDevCode(result.devCode ?? null);
      setDigits(emptyDigits());
      setResendIn(RESEND_SECONDS);
      navigate("/verify", { state: pending });
    });

  const requestCode = () => {
    const target = canonicalPhone(phone);
    if (!target) {
      setPhoneTouched(true);
      return;
    }
    void sendCode(target, mode === "signup" ? "signup" : "login");
  };

  const verify = () =>
    run(async () => {
      const target = otpPhone || canonicalPhone(phone);
      if (!target || code.length !== OTP_LENGTH) return;
      const session = await authService.verifyOtp({
        phone: target,
        code,
        name: name || undefined,
        role,
      });
      clearPendingOtp();
      await finishSignIn(session.user);
    });

  const changeNumber = () => {
    clearPendingOtp();
    navigate(mode === "signup" ? "/signup" : "/login", { state: { name, role, phone } });
  };

  const googleSignIn = () =>
    run(async () => {
      setGoogleNotice(null);
      if (!googleConfig?.enabled || !googleConfig.clientId) {
        setGoogleNotice("Google sign-in isn't configured yet. Use your phone number to continue.");
        return;
      }
      try {
        const accessToken = await requestGoogleAccessToken(googleConfig.clientId);
        const session = await authService.signInWithGoogle(accessToken, view === "signup" ? role : undefined);
        clearPendingOtp();
        await finishSignIn(session.user);
      } catch (caught) {
        const message = errorMessage(caught, "Google sign-in didn't complete. Try again or use your phone number.");
        if (/cancelled|didn't complete|took too long|isn't configured|could not load|didn't return/i.test(message)) {
          setGoogleNotice(message);
          return;
        }
        throw caught;
      }
    });

  const writeDigits = (next: string[]) => {
    setDigits(next);
    setError(null);
  };

  const handleOtpChange = (index: number, value: string) => {
    const entered = value.replace(/\D/g, "").slice(0, OTP_LENGTH - index);
    const next = [...digits];
    if (!entered) {
      next[index] = "";
    } else {
      entered.split("").forEach((digit, offset) => {
        next[index + offset] = digit;
      });
    }
    writeDigits(next);
    const focusIndex = entered ? Math.min(index + entered.length, OTP_LENGTH - 1) : index;
    otpRefs.current[focusIndex]?.focus();
  };

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>, index: number) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH - index);
    if (!pasted) return;
    event.preventDefault();
    const next = [...digits];
    pasted.split("").forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    writeDigits(next);
    otpRefs.current[Math.min(index + pasted.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleOtpKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      otpRefs.current[index + 1]?.focus();
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-panel">
        <div className="au-topbar">
          {view === "verify" ? (
            <button aria-label="Back to phone number" className="au-icon-button" onClick={changeNumber} type="button">
              <ArrowLeft size={20} />
            </button>
          ) : <span className="au-icon-placeholder" aria-hidden="true" />}
          <div className="au-brand">
            <img alt="" className="au-brand__mark" src="/brand-mark.png" />
            <span className="au-brand__name">MechNow</span>
          </div>
        </div>

        <header className="au-heading">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>

        {error && (
          <p aria-live="assertive" className="au-error" role="alert">
            {error}
          </p>
        )}

        {view === "verify" ? (
          <form
            className="au-form"
            onSubmit={(event) => {
              event.preventDefault();
              void verify();
            }}
          >
            {devCode && (
              <p className="au-notice" role="status">
                Development code: <strong>{devCode}</strong>
              </p>
            )}

            <fieldset className="au-otp-field">
              <legend className="au-label">6-digit code</legend>
              <div className="au-otp">
                {digits.map((digit, index) => (
                  <input
                    aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    className="au-otp__box"
                    inputMode="numeric"
                    key={index}
                    maxLength={OTP_LENGTH}
                    onChange={(event) => handleOtpChange(index, event.target.value)}
                    onKeyDown={(event) => handleOtpKeyDown(event, index)}
                    onPaste={(event) => handleOtpPaste(event, index)}
                    pattern="[0-9]*"
                    ref={(element) => { otpRefs.current[index] = element; }}
                    type="text"
                    value={digit}
                  />
                ))}
              </div>
            </fieldset>

            <button aria-busy={busy} className="au-button au-button--primary" disabled={busy || code.length !== OTP_LENGTH} type="submit">
              {busy ? <LoaderCircle className="au-spinner" size={18} /> : null}
              {busy ? "Verifying…" : "Verify & continue"}
              {!busy && <ArrowRight size={17} />}
            </button>

            <div className="au-otp-links">
              <button className="au-link" disabled={busy || resendIn > 0} onClick={() => void sendCode(otpPhone, mode)} type="button">
                {resendIn > 0 ? <span aria-live="polite">Resend code in {resendIn}s</span> : "Resend code"}
              </button>
              <button className="au-link" disabled={busy} onClick={changeNumber} type="button">
                Change number
              </button>
            </div>
          </form>
        ) : (
          <form
            className="au-form"
            onSubmit={(event) => {
              event.preventDefault();
              requestCode();
            }}
          >
            {mode === "signup" && (
              <div className="au-field">
                <label className="au-label" htmlFor="auth-name">Full name</label>
                <input
                  autoComplete="name"
                  className="au-input"
                  id="auth-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your full name"
                  type="text"
                  value={name}
                />
              </div>
            )}

            <div className="au-field">
              <label className="au-label" htmlFor="auth-phone">Phone number</label>
              <div className={`au-phone${phoneError ? " au-phone--error" : ""}`}>
                <label className="au-country" htmlFor="auth-country">
                  <span aria-hidden="true">🇬🇭</span>
                  <select aria-label="Country code" id="auth-country">
                    <option value="+233">+233</option>
                  </select>
                </label>
                <span aria-hidden="true" className="au-phone__divider" />
                <input
                  aria-describedby="auth-phone-help"
                  aria-invalid={Boolean(phoneError)}
                  autoComplete="tel"
                  className="au-phone__input"
                  id="auth-phone"
                  inputMode="tel"
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder="24 123 4567"
                  type="tel"
                  value={phone}
                />
              </div>
              {phoneError ? (
                <p aria-live="polite" className="au-help au-help--error" id="auth-phone-help" role="alert">
                  {phoneError}
                </p>
              ) : (
                <p aria-live="polite" className="au-help" id="auth-phone-help">
                  We'll text you a 6-digit code.
                </p>
              )}
            </div>

            {mode === "signup" && (
              <fieldset className="au-role-field">
                <legend className="au-label">I am a</legend>
                <div className="au-role-grid">
                  {ROLES.map((option) => (
                    <button
                      aria-pressed={role === option.value}
                      className={`au-role${role === option.value ? " au-role--selected" : ""}`}
                      key={option.value}
                      onClick={() => setRole(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <button aria-busy={busy} className="au-button au-button--primary" disabled={busy || !canSubmitPhone} type="submit">
              {busy ? <LoaderCircle className="au-spinner" size={18} /> : null}
              {busy ? "Sending code…" : "Send code"}
              {!busy && <ArrowRight size={17} />}
            </button>

            <p className="au-trust">
              <ShieldCheck aria-hidden="true" size={15} />
              Secure sign-in. We'll never share your number.
            </p>

            <div className="au-divider"><span>or</span></div>

            <button aria-busy={busy} className="au-button au-button--google" disabled={busy || googleConfig === null} onClick={() => void googleSignIn()} type="button">
              {busy ? (
                <LoaderCircle className="au-spinner" size={18} />
              ) : (
                <svg aria-hidden="true" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.73 7.18l7.65 5.94c4.46-4.13 7.12-10.2 7.12-17.59Z" />
                  <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56l7.98-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.47 0 11.91-2.13 15.88-5.81l-7.65-5.94c-2.13 1.43-4.85 2.28-8.23 2.28-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
              )}
              Continue with Google
            </button>

            {googleNotice && (
              <p className="au-google-notice" role="status">
                {googleNotice}
              </p>
            )}

            <footer className="au-footer">
              <p>
                {mode === "signup" ? "Already have an account? " : "New to MechNow? "}
                <button
                  className="au-inline-link"
                  onClick={() => {
                    setError(null);
                    setGoogleNotice(null);
                    navigate(mode === "signup" ? "/login" : "/signup", { state: { name, role, phone } });
                  }}
                  type="button"
                >
                  {mode === "signup" ? "Sign in" : "Create an account"}
                </button>
              </p>
              <p className="au-terms">
                By continuing you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
                <a className="au-help-link" href="#help">Need help?</a>
              </p>
            </footer>
          </form>
        )}
      </div>
    </main>
  );
}
