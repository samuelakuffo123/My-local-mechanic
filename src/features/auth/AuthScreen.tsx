import { useState, type FormEvent } from "react";
import { Apple, ArrowRight, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { BrandLogo } from "../../components/BrandLogo";
import { authService } from "../../services/auth";
import { useAppStore } from "../../state/store";

export function AuthScreen() {
  const theme = useAppStore((state) => state.theme);
  const signIn = useAppStore((state) => state.signIn);
  const navigate = useNavigate();
  const location = useLocation();
  const { pathname } = location;
  const signup = pathname === "/signup";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [providerMessage, setProviderMessage] = useState("");
  const destination = typeof location.state === "object" && location.state !== null &&
    "from" in location.state && typeof location.state.from === "string"
    ? location.state.from
    : "/app/home";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setProviderMessage("");
    setSubmitting(true);
    try {
      const user = signup
        ? await authService.signup({ name, phone, email, password })
        : await authService.login(phone, password);
      signIn(user);
      navigate(signup ? "/onboarding/vehicle" : destination, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't complete that request.");
    } finally {
      setSubmitting(false);
    }
  }

  function chooseProvider(provider: "Google" | "Apple") {
    setProviderMessage(
      `${provider} sign-in isn’t connected yet. Continue with your email and password for now.`,
    );
  }

  return (
    <AppLayout theme={theme}>
      <main className="auth-page">
        <Link aria-label="My Local Mechanic home" className="auth-brand" to="/">
          <span className="auth-brand__mark"><ShieldCheck size={17} /></span>
          <BrandLogo />
        </Link>
        <section className="auth-card">
          <span className="auth-kicker">{signup ? "YOUR DRIVER ACCOUNT" : "WELCOME BACK"}</span>
          <h1>{signup ? "Create your account" : "Welcome back"}</h1>
          <p>{signup ? "Sign up to keep your vehicles, bookings, and service records together." : "Sign in to pick up where you left off."}</p>

          <div className="auth-social">
            <button className="auth-social__button" onClick={() => chooseProvider("Google")} type="button">
              <span className="auth-social__google" aria-hidden="true">G</span>
              Continue with Google
            </button>
            <button className="auth-social__button" onClick={() => chooseProvider("Apple")} type="button">
              <Apple size={19} aria-hidden="true" />
              Continue with Apple
            </button>
          </div>
          <div className="auth-divider"><span>or continue with email</span></div>

          <form className="auth-form" onSubmit={submit}>
            {signup && (
              <label>
                <span>Full name</span>
                <div className="auth-input-wrap">
                  <UserRound size={17} aria-hidden="true" />
                  <input autoComplete="name" minLength={2} onChange={(event) => setName(event.target.value)} placeholder="e.g. Ama Mensah" required value={name} />
                </div>
              </label>
            )}
            {signup && (
              <label>
                <span>Email address</span>
                <div className="auth-input-wrap">
                  <Mail size={17} aria-hidden="true" />
                  <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required type="email" value={email} />
                </div>
              </label>
            )}
            <label>
              <span>{signup ? "Phone number" : "Phone number or email"}</span>
              <div className="auth-input-wrap">
                <Phone size={17} aria-hidden="true" />
                <input
                  autoComplete={signup ? "tel" : "username"}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={signup ? "+233 24 000 0000" : "Phone number or email"}
                  required
                  type={signup ? "tel" : "text"}
                  value={phone}
                />
              </div>
            </label>
            <label>
              <span>Password</span>
              <div className="auth-input-wrap">
                <LockKeyhole size={17} aria-hidden="true" />
                <input autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} onChange={(event) => setPassword(event.target.value)} placeholder={signup ? "At least 8 characters" : "Your password"} required type="password" value={password} />
              </div>
            </label>

            {providerMessage && <p className="auth-provider-message" role="status">{providerMessage}</p>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <button className="auth-submit" disabled={submitting} type="submit">
              {submitting ? "Please wait…" : signup ? "Create account" : "Sign in"} <ArrowRight size={17} />
            </button>
          </form>

          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to My Local Mechanic?"}{" "}
            <Link to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link>
          </p>
          <div className="auth-local-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Your account is protected. We never share your details with listed providers.</span>
          </div>
        </section>
      </main>
    </AppLayout>
  );
}
