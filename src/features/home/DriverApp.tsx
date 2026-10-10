import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BatteryCharging,
  Bell,
  BookOpen,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Compass,
  CreditCard,
  Download,
  FileText,
  Fuel,
  Gauge,
  Headphones,
  HelpCircle,
  HeartPulse,
  History,
  Home,
  KeyRound,
  LifeBuoy,
  LockKeyhole,
  LocateFixed,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Phone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Share2,
  ShoppingBag,
  ShieldCheck,
  Star,
  Sun,
  Thermometer,
  TriangleAlert,
  Trash2,
  Truck,
  UserRound,
  Wrench,
  X,
  Zap,
  Moon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DriverFeatureStart } from "../explore/DriverFeatures";
import corollaPhoto from "../../assets/corolla.jpg";
import mechanicPhoto from "../../assets/mechanic.jpg";
import { useAppStore } from "../../state/store";
import { emergencyService } from "../../services/emergency";
import { providerService } from "../../services/providers";
import type { ProviderProfile, RequestStatus } from "../../services/apiTypes";
import type { EmergencyStatus } from "../../state/emergencyMachine";

// The emergency walkthrough is a scripted UI state machine. As it progresses we
// mirror the meaningful stages onto a persisted service request so the job is
// visible to providers and survives a reload. Purely presentational stages
// (searching, results, confirming, paying) have no server equivalent and are skipped.
const emergencyBackendMap: Partial<Record<EmergencyStatus, RequestStatus>> = {
  requested: "requested",
  enRoute: "enRoute",
  arrived: "arrived",
  diagnosing: "diagnosing",
  awaitingApproval: "awaitingApproval",
  repairing: "repairing",
  awaitingParts: "awaitingParts",
  completed: "completed",
};

function initials(name?: string | null) {
  if (!name) return "MN";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "MN";
}

type Screen =
  | "home"
  | "profile"
  | "need"
  | "location"
  | "searching"
  | "results"
  | "confirm"
  | "sent"
  | "tracking"
  | "arrived"
  | "estimate"
  | "payment"
  | "rating"
  | "complete";

function screenForEmergency(status?: EmergencyStatus): Screen {
  if (!status || status === "idle" || status === "choosingProblem") return "need";
  if (status === "locating") return "location";
  if (status === "searching" || status === "providerDeclined" || status === "offline") return "searching";
  if (status === "results" || status === "noProvider") return "results";
  if (status === "confirming") return "confirm";
  if (status === "requested") return "sent";
  if (["matched", "enRoute", "nearby"].includes(status)) return "tracking";
  if (["arrived", "diagnosing"].includes(status)) return "arrived";
  if (["awaitingApproval", "repairing", "awaitingParts"].includes(status)) return "estimate";
  if (["completed", "paying"].includes(status)) return "payment";
  if (status === "paid") return "rating";
  return status === "reviewed" ? "complete" : "home";
}

type Scenario =
  | "provider-declined"
  | "nearby"
  | "cancelled"
  | "no-provider"
  | "location-denied"
  | "offline";

type Problem = {
  label: string;
  icon: LucideIcon;
  description?: string;
  urgent?: boolean;
};

const problems: Problem[] = [
  { label: "Car won't start", icon: Zap },
  { label: "Flat tire", icon: LifeBuoy },
  { label: "Engine problem", icon: Wrench },
  { label: "Dead battery", icon: BatteryCharging },
  { label: "Overheating", icon: Thermometer },
  { label: "Fuel problem", icon: Fuel },
  { label: "Accident", icon: TriangleAlert, urgent: true },
  { label: "Warning light", icon: CircleAlert },
  { label: "Locked out", icon: Car },
  { label: "I don't know", icon: MoreHorizontal, description: "We'll help you figure it out" },
];

const screenSteps: Partial<Record<Screen, number>> = {
  need: 1,
  location: 2,
  searching: 3,
  results: 3,
  confirm: 3,
};

function Button({
  children,
  variant = "primary",
  icon: Icon,
  onClick,
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "light";
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`button button--${variant} ${className}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {Icon && <Icon aria-hidden="true" size={18} strokeWidth={1.75} />}
      <span>{children}</span>
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      aria-label={label}
      className={`icon-button icon-button--${tone}`}
      onClick={onClick}
      type="button"
    >
      <Icon aria-hidden="true" size={20} strokeWidth={1.75} />
    </button>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="MechNow">
      <span className="brand__mark">
        <Navigation size={15} fill="currentColor" strokeWidth={2} />
      </span>
      <span>mechnow</span>
    </div>
  );
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>9:41</span>
      <div className="status-bar__icons">
        <Radio size={14} />
        <span className="battery">87</span>
      </div>
    </div>
  );
}

function AppHeader({
  title,
  onBack,
  step,
  trailing,
}: {
  title?: string;
  onBack?: () => void;
  step?: number;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="app-header">
      {onBack ? (
        <IconButton label="Go back" icon={ArrowLeft} onClick={onBack} />
      ) : (
        <Brand />
      )}
      {title && <p className="app-header__title">{title}</p>}
      {step ? (
        <span className="step-label">STEP {step} OF 3</span>
      ) : (
        trailing || <span className="header-spacer" />
      )}
    </header>
  );
}

function BottomNav({
  active = "Home",
  onEmergency,
  onHome,
  onNavigate,
  onProfile,
}: {
  active?: "Home" | "Profile";
  onEmergency: () => void;
  onHome: () => void;
  onNavigate: (start: DriverFeatureStart) => void;
  onProfile: () => void;
}) {
  const items = [
    { label: "Home", icon: Home },
    { label: "Explore", icon: Compass },
    { label: "Emergency", icon: LifeBuoy, emergency: true },
    { label: "Activity", icon: Clock3 },
    { label: "Profile", icon: UserRound },
  ];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(({ label, icon: Icon, emergency }) => (
        <button
          className={`${active === label ? "active" : ""} ${emergency ? "nav-emergency" : ""}`}
          key={label}
          onClick={() => label === "Home" ? onHome() : label === "Explore" ? onNavigate("explore") : label === "Emergency" ? onEmergency() : label === "Profile" ? onProfile() : undefined}
          type="button"
        >
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function EmergencySlider({ onComplete }: { onComplete: () => void }) {
  const [value, setValue] = useState(0);
  const finish = () => {
    if (value >= 86) {
      setValue(100);
      window.setTimeout(onComplete, 120);
    } else {
      setValue(0);
    }
  };
  return (
    <div className="emergency-slider" style={{ "--slide-progress": `${value}%` } as React.CSSProperties}>
      <input
        aria-label="Slide to request emergency help"
        max="100"
        min="0"
        onChange={(event) => setValue(Number(event.target.value))}
        onKeyUp={finish}
        onPointerUp={finish}
        type="range"
        value={value}
      />
      <span className="emergency-slider__track" aria-hidden="true">
        <i><ArrowRight size={18} /></i>
        <strong>{value >= 86 ? "Release to confirm" : "Slide for emergency help"}</strong>
        <ShieldCheck size={16} />
      </span>
    </div>
  );
}

function NearbyProviders({ onNavigate }: { onNavigate: (start: DriverFeatureStart) => void }) {
  const [state, setState] = useState<{ items: ProviderProfile[]; loading: boolean }>({ items: [], loading: true });
  useEffect(() => {
    let active = true;
    providerService
      .list("emergency")
      .then((items) => { if (active) setState({ items, loading: false }); })
      .catch(() => { if (active) setState({ items: [], loading: false }); });
    return () => { active = false; };
  }, []);

  if (state.loading) return <p className="text-button">Finding trusted help near you…</p>;
  if (state.items.length === 0) return <button className="text-button" onClick={() => onNavigate("explore")} type="button">No verified providers are online right now — open the map</button>;
  return (
    <>
      {state.items.slice(0, 6).map((provider) => (
        <button key={provider.id} onClick={() => onNavigate("explore")} type="button">
          <img alt={`${provider.businessName} mechanic`} src={mechanicPhoto} />
          <span><small><BadgeCheck size={12} fill="currentColor" /> VERIFIED</small><strong>{provider.businessName}</strong><em><Star size={12} fill="currentColor" /> {provider.rating.toFixed(1)}</em><i><span className="live-dot" /> Available · {provider.region ?? "Ghana"}</i></span>
        </button>
      ))}
    </>
  );
}

function HomeScreen({
  onEmergency,
  onNavigate,
  onProfile,
}: {
  onEmergency: () => void;
  onNavigate: (start: DriverFeatureStart) => void;
  onProfile: () => void;
}) {
  const user = useAppStore((state) => state.user);
  const vehicle = useAppStore((state) => state.activeVehicle);
  const firstName = user?.name.split(" ")[0] ?? "there";
  return (
    <div className="screen screen--home">
      <AppHeader
        trailing={
          <div className="header-actions">
            <IconButton label="Notifications" icon={Bell} />
            <div className="avatar">KA</div>
          </div>
        }
      />

      <main className="home-content">
        <section className="welcome">
          <p className="eyebrow">GOOD MORNING</p>
          <h1>Ready for the road, {firstName}?</h1>
          <p>{vehicle ? `Your ${vehicle.model} is in good shape.` : "Add a vehicle to get personalised maintenance guidance."}</p>
        </section>

        <section className="vehicle-card">
          <div className="vehicle-card__top">
            <span className="overline">PRIMARY VEHICLE</span>
            <button className="text-button" onClick={() => onNavigate("vehicles")} type="button">
              Manage
            </button>
          </div>
          <div className="vehicle-card__body">
            <div className="vehicle-visual">
              <img alt="White Toyota Corolla, three-quarter view" src={corollaPhoto} />
              <span className="vehicle-ground-shadow" />
            </div>
            <div className="vehicle-details">
              <h2>{vehicle ? `${vehicle.make} ${vehicle.model}` : "No vehicle yet"}</h2>
              {vehicle && <span className="ghana-plate"><i>GH</i> {vehicle.plate}</span>}
              <p>{vehicle ? `${vehicle.year} LE · ${vehicle.mileageKm.toLocaleString()} km` : "Set up your vehicle profile"}</p>
            </div>
            <div className="health-ring"><span><strong>82%</strong><small>healthy</small></span><i /></div>
          </div>
          <div className="vehicle-card__meta">
            <div><span>Service due in 1,820 km</span><strong>82%</strong></div>
            <i><b /></i>
          </div>
        </section>

        <section className="emergency-card">
          <div className="emergency-card__header">
            <span className="emergency-card__icon"><LifeBuoy size={23} strokeWidth={1.75} /></span>
            <span className="emergency-card__copy">
              <strong>Emergency help</strong>
              <small><i className="live-dot" /> 12 providers within 5 km</small>
            </span>
            <button
              onClick={() => {
                window.location.href = "tel:+233241234567";
              }}
              type="button"
            >
              <Phone size={14} /> Call support
            </button>
          </div>
          <EmergencySlider onComplete={onEmergency} />
        </section>

        <section className="nearby-section">
          <div className="section-heading">
            <div>
              <span className="overline">NEARBY HELP</span>
              <h2>Trusted help around Accra</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate("explore")} type="button">Open map</button>
          </div>
          <button className="nearby-card" onClick={() => onNavigate("explore")} type="button">
            <div className="nearby-card__map">
              <span className="map-grid" />
              <span className="map-road map-road--one" /><span className="map-road map-road--two" />
              <span className="map-pin map-pin--one"><Wrench size={13} /></span>
              <span className="map-pin map-pin--two"><Car size={13} /></span>
              <span className="map-pin map-pin--three"><Wrench size={13} /></span>
              <span className="map-pin map-pin--user"><Navigation size={12} fill="currentColor" /></span>
              <span className="nearest-chip"><Clock3 size={13} /> Nearest: 8 min</span>
            </div>
          </button>
          <div className="provider-carousel">
            <NearbyProviders onNavigate={onNavigate} />
          </div>
        </section>

        <section className="quick-section">
          <div className="section-heading">
            <div>
              <span className="overline">SERVICES</span>
              <h2>What do you need?</h2>
            </div>
          </div>
          <div className="quick-grid">
            {[
              { label: "Find mechanic", helper: "Mechanics nearby", icon: Search, start: "explore" as DriverFeatureStart },
              { label: "Book service", helper: "Pick a time", icon: Clock3, start: "booking" as DriverFeatureStart },
              { label: "Request tow", helper: "Flatbed or standard", icon: Truck, start: "tow" as DriverFeatureStart },
              { label: "Find parts", helper: "Matched to your car", icon: ShoppingBag, start: "parts" as DriverFeatureStart },
            ].map(({ label, helper, icon: Icon, start }) => (
              <button key={label} onClick={() => onNavigate(start)} type="button">
                <span><Icon size={25} strokeWidth={1.75} /></span>
                <strong>{label}</strong>
                <small>{helper}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="product-stack">
          <div className="section-heading">
            <div>
              <span className="overline">POPULAR BUNDLES</span>
              <h2>High-value service plans</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate("parts")} type="button">View all</button>
          </div>
          <div className="product-stack__grid">
            {[
              { title: "Roadside Rescue", tag: "Most booked", price: "GHS 120", description: "Battery jump, tire change, and lockout support in under 20 minutes.", icon: LifeBuoy },
              { title: "Premium Service", tag: "Best value", price: "GHS 420", description: "Full inspection, oil/filter, brake check, and 24-hour follow-up.", icon: Wrench },
              { title: "Parts + Fitment", tag: "Same day", price: "GHS 290", description: "Selected parts, delivery, and installation coordination for your car.", icon: ShoppingBag },
            ].map(({ title, tag, price, description, icon: Icon }) => (
              <button key={title} className="product-card" onClick={() => onNavigate("explore")} type="button">
                <div className="product-card__head">
                  <span className="product-card__icon"><Icon size={18} /></span>
                  <span className="product-card__tag">{tag}</span>
                </div>
                <div className="product-card__body">
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <div className="product-card__meta">
                  <span>{price}</span>
                  <ArrowRight size={16} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="insight-stack">
          <div className="section-heading">
            <div>
              <span className="overline">RECOMMENDED</span>
              <h2>Smart for your Corolla</h2>
            </div>
          </div>
          <div className="insight-grid">
            {[
              { label: "Battery health", value: "Good", detail: "All systems normal", tone: "green" },
              { label: "Brake service", value: "Due soon", detail: "In 800 km", tone: "amber" },
              { label: "Tire rotation", value: "Booked", detail: "Thu, 9:30 AM", tone: "blue" },
            ].map(({ label, value, detail, tone }) => (
              <div className={`insight-card insight-card--${tone}`} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="appointment">
          <div className="date-tile"><strong>18</strong><span>OCT</span></div>
          <div><span className="overline">UPCOMING</span><h3>Routine service</h3><p>9:30 AM · AutoHaus Accra</p></div>
          <ArrowRight size={18} />
        </section>
        <section className="home-status-card"><Gauge size={19} /><div><span className="overline">MAINTENANCE</span><strong>Next service in 1,820 km</strong><small>Suggested interval · Oil and filter</small></div><ChevronRight size={17} /></section>
        <section className="home-status-card"><History size={19} /><div><span className="overline">RECENT ACTIVITY</span><strong>Brake pads order confirmed</strong><small>Accra Parts Hub · GHS 680</small></div><ChevronRight size={17} /></section>
      </main>
      <BottomNav onEmergency={onEmergency} onHome={() => undefined} onNavigate={onNavigate} onProfile={onProfile} />
    </div>
  );
}

type ProfilePanel =
  | "personal"
  | "appearance"
  | "payments"
  | "addresses"
  | "notifications"
  | "privacy"
  | "security"
  | "support"
  | "data"
  | "about"
  | null;

function SettingSwitch({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      aria-label={`${checked ? "Disable" : "Enable"} ${label}`}
      aria-pressed={checked}
      className={`profile-switch ${checked ? "on" : ""}`}
      onClick={onChange}
      type="button"
    >
      <span />
    </button>
  );
}

function ProfilePanelSheet({
  panel,
  close,
  setTheme,
  theme,
  user,
}: {
  panel: Exclude<ProfilePanel, null>;
  close: () => void;
  setTheme: (theme: "dark" | "light") => void;
  theme: "dark" | "light";
  user: { name: string; phone: string; email: string } | null;
}) {
  const [serviceUpdates, setServiceUpdates] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [promotions, setPromotions] = useState(false);
  const [location, setLocation] = useState(true);
  const [analytics, setAnalytics] = useState(false);
  const [biometrics, setBiometrics] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const titles: Record<Exclude<ProfilePanel, null>, string> = {
    personal: "Personal information",
    appearance: "Appearance",
    payments: "Payment methods",
    addresses: "Saved addresses",
    notifications: "Notifications",
    privacy: "Privacy & location",
    security: "Security",
    support: "Help & support",
    data: "Your data & account",
    about: "About MechNow",
  };

  const handleDemoAction = (label: string) => {
    setNotice(`${label} is ready for the next release, and this preview keeps the flow moving without breaking the demo.`);
  };

  return (
    <div className="profile-panel" role="dialog" aria-modal="true" aria-label={titles[panel]}>
      <header>
        <IconButton icon={ArrowLeft} label="Back to profile" onClick={close} />
        <strong>{titles[panel]}</strong>
        <span />
      </header>
      <main>
        {notice && <div className="profile-demo-banner">{notice}</div>}
        {panel === "appearance" && (
          <>
            <p className="profile-panel-intro">Choose the appearance that feels best for you. Your preference is saved on this device.</p>
            <div className="appearance-options">
              <button className={theme === "light" ? "selected" : ""} onClick={() => setTheme("light")} type="button">
                <span className="appearance-preview appearance-preview--light"><i /><i /><i /></span>
                <span><Sun size={18} /><strong>Light</strong><small>Warm, clear surfaces</small></span>
                {theme === "light" && <CheckCircle2 size={18} />}
              </button>
              <button className={theme === "dark" ? "selected" : ""} onClick={() => setTheme("dark")} type="button">
                <span className="appearance-preview appearance-preview--dark"><i /><i /><i /></span>
                <span><Moon size={18} /><strong>Dark</strong><small>Calm, low-glare driving</small></span>
                {theme === "dark" && <CheckCircle2 size={18} />}
              </button>
            </div>
          </>
        )}
        {panel === "personal" && (
          <>
            <div className="profile-photo-editor"><div className="avatar avatar--large">{initials(user?.name)}</div><button onClick={() => handleDemoAction("Photo updates")} type="button">Change photo</button></div>
            <div className="profile-form">
              <label>Full name<input defaultValue={user?.name ?? ""} /></label>
              <label>Phone number<div className="profile-phone"><span>+233</span><input defaultValue={(user?.phone ?? "").replace(/^\+?233/, "").trim()} /></div></label>
              <label>Email address<input defaultValue={user?.email ?? ""} type="email" /></label>
              <label>Date of birth<input defaultValue="1991-08-14" type="date" /></label>
            </div>
            <Button onClick={() => handleDemoAction("Profile edits")}>Save changes</Button>
          </>
        )}
        {panel === "payments" && (
          <>
            <p className="profile-panel-intro">Choose how you pay for services, towing, and parts.</p>
            <section className="payment-settings-card payment-settings-card--momo">
              <span className="momo-logo">Mo</span><div><strong>MTN Mobile Money</strong><small>+233 24 ••• 4567 · Default</small></div><CheckCircle2 size={18} />
            </section>
            <section className="payment-settings-card">
              <CreditCard size={21} /><div><strong>Visa ending 8842</strong><small>Expires 08/27</small></div><MoreHorizontal size={18} />
            </section>
            <Button icon={Plus} onClick={() => handleDemoAction("New payment methods")} variant="secondary">Add payment method</Button>
            <div className="profile-security-note"><ShieldCheck size={17} /><span>Payments are verified securely. MechNow never stores your full card or MoMo PIN.</span></div>
          </>
        )}
        {panel === "addresses" && (
          <>
            <section className="address-setting"><span><Home size={19} /></span><div><strong>Home</strong><p>14 Nii Nortei Nyanchi Street</p><small>Airport Residential, Accra</small></div><button onClick={() => handleDemoAction("Home address editing")} type="button">Edit</button></section>
            <section className="address-setting"><span><Wrench size={19} /></span><div><strong>Work</strong><p>Independence Avenue</p><small>Ridge, Accra</small></div><button onClick={() => handleDemoAction("Work address editing")} type="button">Edit</button></section>
            <Button icon={Plus} onClick={() => handleDemoAction("New addresses")} variant="secondary">Add address</Button>
          </>
        )}
        {panel === "notifications" && (
          <section className="profile-toggle-list">
            <div><span><strong>Service updates</strong><small>Booking, provider, and repair status</small></span><SettingSwitch checked={serviceUpdates} label="service updates" onChange={() => setServiceUpdates(!serviceUpdates)} /></div>
            <div><span><strong>Maintenance reminders</strong><small>Upcoming service and document renewals</small></span><SettingSwitch checked={reminders} label="maintenance reminders" onChange={() => setReminders(!reminders)} /></div>
            <div><span><strong>Messages</strong><small>New messages from providers and vendors</small></span><SettingSwitch checked label="message notifications" onChange={() => setNotice("Message notifications will be managed from the chat and booking inbox.")} /></div>
            <div><span><strong>Offers and product news</strong><small>Occasional MechNow updates</small></span><SettingSwitch checked={promotions} label="promotional updates" onChange={() => setPromotions(!promotions)} /></div>
          </section>
        )}
        {panel === "privacy" && (
          <>
            <section className="profile-toggle-list">
              <div><span><strong>Location access</strong><small>Find nearby help and share with assigned providers</small></span><SettingSwitch checked={location} label="location access" onChange={() => setLocation(!location)} /></div>
              <div><span><strong>Usage analytics</strong><small>Help improve MechNow with anonymous diagnostics</small></span><SettingSwitch checked={analytics} label="usage analytics" onChange={() => setAnalytics(!analytics)} /></div>
            </section>
            <div className="profile-permission-card"><MapPin size={19} /><span><strong>Location is shared only when needed</strong><small>Your live location is visible only to an assigned provider during an active request.</small></span></div>
            <button className="profile-text-action" onClick={() => setNotice("Location permission is limited to nearby help requests and an active trip. No background tracking is enabled.")} type="button">Review app permissions <ArrowRight size={16} /></button>
            <button className="profile-text-action" onClick={() => setNotice("Privacy policy content is ready for legal review and approval before launch.")} type="button">Privacy policy <ArrowRight size={16} /></button>
          </>
        )}
        {panel === "security" && (
          <>
            <section className="profile-toggle-list">
              <div><span><strong>Biometric unlock</strong><small>Use fingerprint or face recognition</small></span><SettingSwitch checked={biometrics} label="biometric unlock" onChange={() => setBiometrics(!biometrics)} /></div>
              <button onClick={() => handleDemoAction("Password updates")} type="button"><span><strong>Change password</strong><small>Last changed 4 months ago</small></span><ChevronRight size={17} /></button>
              <button onClick={() => handleDemoAction("Two-step verification")} type="button"><span><strong>Two-step verification</strong><small>Secure your account with an OTP</small></span><em>ON</em><ChevronRight size={17} /></button>
              <button onClick={() => handleDemoAction("Session management")} type="button"><span><strong>Active sessions</strong><small>2 devices signed in</small></span><ChevronRight size={17} /></button>
            </section>
          </>
        )}
        {panel === "support" && (
          <>
            <div className="support-hero"><Headphones size={25} /><span><strong>How can we help?</strong><small>Support is available every day.</small></span><Button icon={MessageCircle}>Start a chat</Button></div>
            <section className="profile-link-list">
              <button onClick={() => handleDemoAction("FAQs")} type="button"><BookOpen size={19} /><span><strong>Frequently asked questions</strong><small>Bookings, payments, towing, and parts</small></span><ChevronRight size={17} /></button>
              <button onClick={() => handleDemoAction("Issue reporting")} type="button"><CircleAlert size={19} /><span><strong>Report an issue</strong><small>Tell us what went wrong</small></span><ChevronRight size={17} /></button>
              <button onClick={() => handleDemoAction("Support tickets")} type="button"><FileText size={19} /><span><strong>Support tickets</strong><small>MN-4821 · Waiting for your reply</small></span><em>1</em><ChevronRight size={17} /></button>
              <button onClick={() => handleDemoAction("Safety centre")} type="button"><ShieldCheck size={19} /><span><strong>Safety centre</strong><small>Emergency guidance and trusted contacts</small></span><ChevronRight size={17} /></button>
              <button onClick={() => { window.location.href = "tel:+233241234567"; }} type="button"><Phone size={19} /><span><strong>Call support</strong><small>+233 24 123 4567</small></span><ChevronRight size={17} /></button>
            </section>
          </>
        )}
        {panel === "data" && (
          <>
            <div className="profile-data-hero"><Download size={24} /><span><strong>Your data belongs to you</strong><small>Download a copy of your account, vehicle, booking, and service information.</small></span></div>
            <Button icon={Download} onClick={() => handleDemoAction("Data export")} variant="secondary">Request data export</Button>
            <section className="profile-danger-zone">
              <span className="overline">DANGER ZONE</span>
              <h2>Delete your account</h2>
              <p>This permanently removes your profile after active bookings, orders, and disputes are resolved. Locked service records remain available where legally required.</p>
              <Button icon={Trash2} onClick={() => handleDemoAction("Account deletion")} variant="danger">Delete account</Button>
            </section>
          </>
        )}
        {panel === "about" && (
          <section className="profile-data-hero">
            <CircleAlert size={22} />
            <span><strong>MechNow product preview</strong><small>This environment uses locally persisted seed data and a mock API for testing. No real provider is dispatched and no real payment is charged.</small></span>
          </section>
        )}
      </main>
    </div>
  );
}

function ProfileScreen({
  onEmergency,
  onHome,
  onNavigate,
  setTheme,
  theme,
}: {
  onEmergency: () => void;
  onHome: () => void;
  onNavigate: (start: DriverFeatureStart) => void;
  setTheme: (theme: "dark" | "light") => void;
  theme: "dark" | "light";
}) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<ProfilePanel>(null);
  const user = useAppStore((state) => state.user);
  const vehicle = useAppStore((state) => state.activeVehicle);
  const signOut = useAppStore((state) => state.signOut);
  const groups = [
    {
      label: "ACCOUNT",
      items: [
        { title: "Personal information", detail: "Name, phone, email", icon: UserRound, panel: "personal" as const },
        { title: "My vehicles", detail: vehicle ? `1 vehicle · ${vehicle.make} ${vehicle.model}` : "No vehicles added", icon: Car, action: () => onNavigate("vehicles") },
        { title: "Payment methods", detail: "MoMo and cards", icon: CreditCard, panel: "payments" as const },
        { title: "Saved addresses", detail: "Home and work", icon: MapPin, panel: "addresses" as const },
      ],
    },
    {
      label: "PREFERENCES",
      items: [
        { title: "Appearance", detail: `${theme === "dark" ? "Dark" : "Light"} theme`, icon: theme === "dark" ? Moon : Sun, panel: "appearance" as const },
        { title: "Notifications", detail: "Service updates and reminders", icon: Bell, panel: "notifications" as const },
        { title: "Privacy & location", detail: "Permissions and data sharing", icon: ShieldCheck, panel: "privacy" as const },
        { title: "Security", detail: "Password, biometrics, sessions", icon: LockKeyhole, panel: "security" as const },
      ],
    },
    {
      label: "HELP & DATA",
      items: [
        { title: "Help & support", detail: "FAQ, tickets, safety, contact", icon: HelpCircle, panel: "support" as const },
        { title: "Your data & account", detail: "Export or delete your account", icon: Download, panel: "data" as const },
        { title: "About MechNow", detail: "Version, testing, and legal information", icon: CircleAlert, panel: "about" as const },
      ],
    },
  ];
  return (
    <div className="screen profile-screen">
      <AppHeader title="Profile" trailing={<IconButton icon={Settings} label="Profile settings" onClick={() => setPanel("personal")} />} />
      <main className="profile-content">
        <section className="profile-identity">
          <div className="avatar avatar--large">{initials(user?.name)}</div>
          <div><span className="overline">VEHICLE OWNER</span><h1>{user?.name ?? "MechNow driver"}</h1><p>{user?.phone ?? "No phone number"}</p></div>
          <button aria-label="Edit personal information" onClick={() => setPanel("personal")} type="button"><ChevronRight size={19} /></button>
        </section>
        <section className="profile-completeness">
          <div><ShieldCheck size={18} /><span><strong>Your account is protected</strong><small>Phone verified · Security checks current</small></span></div>
          <span>92%</span>
          <i><b /></i>
        </section>
        {groups.map((group) => (
          <section className="profile-settings-group" key={group.label}>
            <span className="overline">{group.label}</span>
            <div>
              {group.items.map(({ title, detail, icon: Icon, ...item }) => (
                <button
                  key={title}
                  onClick={"action" in item ? item.action : () => setPanel(item.panel)}
                  type="button"
                >
                  <span className="profile-setting-icon"><Icon size={19} /></span>
                  <span><strong>{title}</strong><small>{detail}</small></span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          </section>
        ))}
        <button className="profile-signout" onClick={() => { void signOut().then(() => navigate("/login")); }} type="button"><LogOut size={18} /> Sign out</button>
        <p className="profile-version">MechNow for Ghana · Version 1.0 Demo</p>
      </main>
      <BottomNav active="Profile" onEmergency={onEmergency} onHome={onHome} onNavigate={onNavigate} onProfile={() => undefined} />
      {panel && <ProfilePanelSheet close={() => setPanel(null)} panel={panel} setTheme={setTheme} theme={theme} user={user} />}
    </div>
  );
}

function NeedScreen({
  selected,
  onSelect,
  onBack,
  onContinue,
}: {
  selected: string;
  onSelect: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const accident = selected === "Accident";
  return (
    <div className="screen">
      <AppHeader onBack={onBack} step={1} />
      <main className="flow-content">
        <div className="flow-heading">
          <span className="signal-label"><span /> EMERGENCY HELP</span>
          <h1>What do you need help with?</h1>
          <p>Choose the closest match. You can explain more to your provider.</p>
        </div>
        {accident && (
          <div className="notice notice--warning">
            <TriangleAlert size={20} />
            <div>
              <strong>Is anyone in immediate danger?</strong>
              <p>Contact Ghana emergency services first. MechNow is not a replacement for emergency services.</p>
              <button onClick={() => { window.location.href = "tel:112"; }} type="button">Call 112</button>
            </div>
          </div>
        )}
        <div className="problem-grid" role="radiogroup" aria-label="Type of vehicle problem">
          {problems.map(({ label, icon: Icon, description }) => (
            <button
              aria-checked={selected === label}
              className={selected === label ? "selected" : ""}
              key={label}
              onClick={() => onSelect(label)}
              role="radio"
              type="button"
            >
              <span className="problem-icon"><Icon size={22} strokeWidth={1.75} /></span>
              <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
              <span className="radio-mark">{selected === label && <Check size={13} />}</span>
            </button>
          ))}
        </div>
        <button className="other-problem" onClick={() => onSelect("Other")} type="button">
          <span><Menu size={20} /> Something else</span>
          <ArrowRight size={18} />
        </button>
      </main>
      <div className="sticky-action">
        <Button disabled={!selected} onClick={onContinue}>Continue</Button>
        <p>No payment is made until you confirm a provider.</p>
      </div>
    </div>
  );
}

function LocationScreen({
  onBack,
  onContinue,
  onDenied,
}: {
  onBack: () => void;
  onContinue: () => void;
  onDenied: () => void;
}) {
  return (
    <div className="screen">
      <AppHeader onBack={onBack} step={2} />
      <main className="flow-content location-layout">
        <div className="flow-heading">
          <span className="signal-label signal-label--blue"><LocateFixed size={13} /> YOUR LOCATION</span>
          <h1>Where should we send help?</h1>
          <p>We'll only share your live location with your assigned provider.</p>
        </div>
        <div className="location-map">
          <span className="map-grid" />
          <span className="street street--one" />
          <span className="street street--two" />
          <div className="location-pulse"><Navigation size={20} fill="currentColor" /></div>
          <span className="map-label map-label--one">Ringway Estates</span>
          <span className="map-label map-label--two">Osu</span>
        </div>
        <div className="location-card">
          <div className="location-card__icon"><MapPin size={20} /></div>
          <div><span className="overline">DETECTED LOCATION</span><strong>Oxford Street, Osu</strong><p>Accra, Greater Accra</p></div>
          <button onClick={onDenied} type="button">Edit</button>
        </div>
        <button className="manual-location" onClick={onDenied} type="button">
          <Search size={18} />
          <span>Enter location manually</span>
          <ArrowRight size={17} />
        </button>
        <div className="privacy-note"><ShieldCheck size={17} /><span>Your precise location is encrypted and only used for this request.</span></div>
      </main>
      <div className="sticky-action">
        <Button icon={LocateFixed} onClick={onContinue}>Use this location</Button>
      </div>
    </div>
  );
}

function SearchingScreen({ onCancel, onFound }: { onCancel: () => void; onFound: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onFound, 2400);
    return () => window.clearTimeout(timer);
  }, [onFound]);
  return (
    <div className="screen searching-screen">
      <AppHeader title="Finding help" />
      <main>
        <div className="search-radar" aria-label="Searching for providers nearby">
          <span className="radar-ring radar-ring--one" />
          <span className="radar-ring radar-ring--two" />
          <span className="radar-ring radar-ring--three" />
          <span className="provider-dot provider-dot--one"><Wrench size={13} /></span>
          <span className="provider-dot provider-dot--two"><Wrench size={13} /></span>
          <span className="provider-dot provider-dot--three"><Car size={13} /></span>
          <span className="search-radar__center"><Navigation size={22} fill="currentColor" /></span>
        </div>
        <div className="searching-copy">
          <span className="signal-label"><span /> SEARCHING LIVE</span>
          <h1>Finding available help near you…</h1>
          <p>Checking verified providers for the best mix of speed, rating, and price.</p>
        </div>
        <div className="search-checks">
          <span className="done"><Check size={15} /> Location confirmed</span>
          <span className="active"><RefreshCw size={15} /> Checking availability</span>
          <span><Clock3 size={15} /> Comparing arrival times</span>
        </div>
      </main>
      <div className="searching-footer">
        <p><ShieldCheck size={16} /> Your request hasn't been sent yet</p>
        <Button onClick={onCancel} variant="ghost">Cancel search</Button>
      </div>
    </div>
  );
}

const providers = [
  { name: "Kojo AutoCare", initials: "KA", eta: "8 min", distance: "2.4 km", rating: "4.9", jobs: "312", price: "GHS 120", recommended: true },
  { name: "Nii's Mobile Garage", initials: "NG", eta: "12 min", distance: "3.1 km", rating: "4.8", jobs: "186", price: "GHS 100", recommended: false },
];

function ProviderResults({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="screen">
      <AppHeader onBack={onBack} title="Available help" />
      <main className="flow-content results-content">
        <div className="results-heading">
          <div><span className="signal-label signal-label--green"><span /> 6 AVAILABLE NOW</span><h1>Help is close</h1></div>
          <button onClick={() => window.location.href = "/app/explore"} type="button"><Menu size={16} /> Filter</button>
        </div>
        <div className="route-summary"><MapPin size={17} /><span><strong>Oxford Street, Osu</strong><small>Car won't start · Toyota Corolla</small></span><button onClick={() => window.location.href = "/app/location"} type="button">Edit</button></div>
        <div className="provider-list">
          {providers.map((provider) => (
            <article className={`provider-card ${provider.recommended ? "provider-card--selected" : ""}`} key={provider.name}>
              {provider.recommended && <span className="recommended"><Zap size={12} fill="currentColor" /> BEST MATCH</span>}
              <div className="provider-card__header">
                <div className="provider-avatar">{provider.initials}</div>
                <div className="provider-identity">
                  <div><h2>{provider.name}</h2><ShieldCheck size={17} fill="currentColor" /></div>
                  <p><Star size={14} fill="currentColor" /> {provider.rating} <span>({provider.jobs} jobs)</span></p>
                </div>
                <IconButton label={`More about ${provider.name}`} icon={MoreHorizontal} />
              </div>
              <div className="provider-stats">
                <div><span>ETA</span><strong>{provider.eta}</strong></div>
                <div><span>DISTANCE</span><strong>{provider.distance}</strong></div>
                <div><span>STARTING AT</span><strong>{provider.price}</strong></div>
              </div>
              <div className="provider-card__footer">
                <span><span className="live-dot" /> Available now</span>
                <button onClick={onSelect} type="button">Choose provider <ArrowRight size={16} /></button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}

function HoldToConfirm({ onComplete }: { onComplete: () => void }) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const interval = useRef<number | null>(null);

  const stop = () => {
    if (interval.current) window.clearInterval(interval.current);
    interval.current = null;
    setHolding(false);
    setProgress(0);
  };

  const start = () => {
    if (interval.current) return;
    setHolding(true);
    const started = Date.now();
    interval.current = window.setInterval(() => {
      const next = Math.min(((Date.now() - started) / 1200) * 100, 100);
      setProgress(next);
      if (next >= 100) {
        if (interval.current) window.clearInterval(interval.current);
        interval.current = null;
        setHolding(false);
        onComplete();
      }
    }, 30);
  };

  useEffect(() => () => {
    if (interval.current) window.clearInterval(interval.current);
  }, []);

  return (
    <button
      aria-label="Hold for one second to confirm and request help"
      className={`hold-button ${holding ? "holding" : ""}`}
      onPointerCancel={stop}
      onPointerDown={start}
      onPointerLeave={stop}
      onPointerUp={() => progress < 100 && stop()}
      type="button"
    >
      <span className="hold-button__fill" style={{ width: `${progress}%` }} />
      <span className="hold-button__icon"><ArrowRight size={20} /></span>
      <span>{holding ? "Keep holding…" : "Hold to request help"}</span>
      <ShieldCheck size={18} />
    </button>
  );
}

function ConfirmScreen({ onBack, onConfirm }: { onBack: () => void; onConfirm: () => void }) {
  return (
    <div className="screen">
      <AppHeader onBack={onBack} title="Confirm request" />
      <main className="flow-content confirm-content">
        <div className="provider-hero">
          <div className="provider-avatar provider-avatar--large">KA</div>
          <span className="verified-chip"><ShieldCheck size={14} fill="currentColor" /> VERIFIED PROVIDER</span>
          <h1>Kojo AutoCare</h1>
          <p><Star size={15} fill="currentColor" /> 4.9 · 312 completed jobs</p>
        </div>
        <section className="eta-panel">
          <span className="eta-panel__icon"><Navigation size={22} fill="currentColor" /></span>
          <div><span>ESTIMATED ARRIVAL</span><strong>8–10 min</strong><small>2.4 km away · Available now</small></div>
          <span className="live-dot" />
        </section>
        <section className="request-details">
          <h2>Request details</h2>
          <dl>
            <div><dt><CircleAlert size={17} /> Problem</dt><dd>Car won't start</dd></div>
            <div><dt><Car size={17} /> Vehicle</dt><dd>Toyota Corolla · GR 8241-22</dd></div>
            <div><dt><MapPin size={17} /> Location</dt><dd>Oxford Street, Osu</dd></div>
          </dl>
        </section>
        <section className="price-panel">
          <div><span>Call-out fee</span><strong>GHS 120</strong></div>
          <p>Covers arrival and diagnosis. Any repair cost will be shared for your approval before work starts.</p>
        </section>
        <div className="assurance-row"><ShieldCheck size={18} /><span><strong>No surprise charges</strong><small>Price changes always need your approval.</small></span></div>
      </main>
      <div className="sticky-action sticky-action--dark">
        <HoldToConfirm onComplete={onConfirm} />
        <p>Keep holding for 1 second to prevent accidental requests.</p>
      </div>
    </div>
  );
}

function SentScreen({ onContinue }: { onContinue: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onContinue, 1800);
    return () => window.clearTimeout(timer);
  }, [onContinue]);
  return (
    <div className="screen centered-state">
      <AppHeader />
      <main>
        <div className="success-orbit"><Check size={32} /><span /></div>
        <span className="signal-label signal-label--green"><span /> REQUEST SENT</span>
        <h1>Your request is on its way.</h1>
        <p>We're connecting you with Kojo AutoCare now. This usually takes less than a minute.</p>
        <div className="connecting-card">
          <div className="provider-avatar">KA</div>
          <div><strong>Kojo AutoCare</strong><span>Confirming your request…</span></div>
          <RefreshCw className="spin" size={19} />
        </div>
      </main>
      <div className="centered-state__footer"><ShieldCheck size={16} /> You won't be charged until service begins.</div>
    </div>
  );
}

function SafetyActions({ onCancel }: { onCancel: () => void }) {
  return (
    <section className="safety-actions">
      <span className="overline">SAFETY & SUPPORT</span>
      <div>
        <button onClick={() => { window.location.href = "tel:+233241234567"; }} type="button"><Phone size={19} /><span>Call</span></button>
        <button onClick={async () => {
          const shareData = {
            title: "MechNow trip",
            text: "I’m in a service trip with MechNow. Track progress and share updates with my provider.",
            url: window.location.href,
          };
          if (navigator.share) {
            await navigator.share(shareData);
          } else {
            window.location.href = `mailto:?subject=${encodeURIComponent("MechNow trip")}&body=${encodeURIComponent(shareData.text + "\n" + shareData.url)}`;
          }
        }} type="button"><Share2 size={19} /><span>Share trip</span></button>
        <button onClick={() => { window.location.href = "mailto:support@mechnow.com?subject=Trip%20support"; }} type="button"><Headphones size={19} /><span>Support</span></button>
        <button onClick={onCancel} type="button"><X size={19} /><span>Cancel</span></button>
      </div>
      <button className="report-link" onClick={() => { window.location.href = "mailto:support@mechnow.com?subject=Safety%20issue%20report"; }} type="button">Report a safety issue</button>
    </section>
  );
}

function TrackingScreen({
  onArrived,
  onScenario,
}: {
  onArrived: () => void;
  onScenario: (value: Scenario) => void;
}) {
  return (
    <div className="screen tracking-screen">
      <div className="tracking-map">
        <span className="map-grid" />
        <span className="route-line" />
        <span className="route-start"><MapPin size={16} /></span>
        <span className="route-provider"><Car size={17} /></span>
        <div className="tracking-top">
          <IconButton label="Back to home" icon={ArrowLeft} />
          <span><span className="live-dot" /> LIVE TRACKING</span>
          <IconButton label="More options" icon={MoreHorizontal} />
        </div>
        <span className="map-eta">8 MIN</span>
      </div>
      <main className="tracking-sheet">
        <div className="sheet-handle" />
        <span className="signal-label signal-label--green"><span /> PROVIDER EN ROUTE</span>
        <div className="arrival-heading"><div><h1>Kojo is on the way</h1><p>Arriving in <strong>8–10 minutes</strong></p></div><div className="eta-number"><strong>8</strong><span>MIN</span></div></div>
        <div className="provider-contact">
          <div className="provider-avatar">KA</div>
          <div><strong>Kojo Mensah</strong><span>Kojo AutoCare · Toyota Hilux</span><small>GT 4198-22</small></div>
          <IconButton label="Chat with Kojo" icon={MessageCircle} />
          <IconButton label="Call Kojo" icon={Phone} />
        </div>
        <div className="status-timeline">
          {["Matched", "En route", "Nearby", "Arrived"].map((item, index) => (
            <div className={index < 2 ? "complete" : index === 2 ? "current" : ""} key={item}>
              <span>{index < 2 ? <Check size={12} /> : null}</span><small>{item}</small>
            </div>
          ))}
        </div>
        <div className="safety-tip"><ShieldCheck size={18} /><span><strong>Stay somewhere safe and visible</strong><small>Turn on your hazard lights if you're roadside.</small></span></div>
        <SafetyActions onCancel={() => onScenario("cancelled")} />
      </main>
    </div>
  );
}

function ArrivedScreen({ onEstimate }: { onEstimate: () => void }) {
  return (
    <div className="screen">
      <AppHeader title="Active service" trailing={<span className="live-chip"><span /> LIVE</span>} />
      <main className="flow-content service-content">
        <div className="service-status">
          <span className="service-status__icon"><Wrench size={25} /></span>
          <span className="overline">SERVICE IN PROGRESS</span>
          <h1>Diagnosing your vehicle</h1>
          <p>Kojo is checking why your Corolla won't start.</p>
          <div className="elapsed"><Clock3 size={16} /> 06:42 elapsed</div>
        </div>
        <div className="service-timeline">
          {[
            ["Provider arrived", "10:18 AM", true],
            ["Service started", "10:22 AM", true],
            ["Diagnosing", "In progress", true],
            ["Estimate ready", "Next", false],
            ["Repairing", "", false],
            ["Completed", "", false],
          ].map(([label, meta, active], index) => (
            <div className={active ? "active" : ""} key={label as string}>
              <span>{index < 2 ? <Check size={13} /> : index === 2 ? <RefreshCw size={13} /> : null}</span>
              <div><strong>{label}</strong>{meta && <small>{meta}</small>}</div>
            </div>
          ))}
        </div>
        <div className="provider-contact">
          <div className="provider-avatar">KA</div>
          <div><strong>Kojo Mensah</strong><span>Working on your vehicle</span></div>
          <IconButton label="Chat with Kojo" icon={MessageCircle} />
          <IconButton label="Call Kojo" icon={Phone} />
        </div>
        <SafetyActions onCancel={() => undefined} />
      </main>
    </div>
  );
}

function EstimateScreen({ onApprove, onBack }: { onApprove: () => void; onBack: () => void }) {
  return (
    <div className="screen">
      <AppHeader onBack={onBack} title="Review estimate" />
      <main className="flow-content estimate-content">
        <div className="estimate-heading">
          <span className="estimate-icon"><Wrench size={23} /></span>
          <span className="signal-label signal-label--blue">ESTIMATE READY</span>
          <h1>Battery replacement</h1>
          <p>Kojo found that your battery is no longer holding charge.</p>
        </div>
        <section className="diagnosis">
          <span className="overline">PROVIDER'S DIAGNOSIS</span>
          <p>Battery tested at 8.4V and failed the load test. Replacement is recommended to get you safely back on the road.</p>
        </section>
        <section className="cost-breakdown">
          <h2>Cost breakdown</h2>
          <div><span>Call-out & diagnosis</span><strong>GHS 120</strong></div>
          <div><span><strong>12V Atlas battery</strong><small>18-month warranty · Qty 1</small></span><strong>GHS 680</strong></div>
          <div><span>Installation labour</span><strong>GHS 80</strong></div>
          <div className="cost-total"><span>Total</span><strong>GHS 880</strong></div>
        </section>
        <div className="approval-lock"><ShieldCheck size={19} /><span><strong>This total is protected</strong><small>Any increase requires your approval before work continues.</small></span></div>
        <section className="estimate-meta">
          <div><Clock3 size={17} /><span><small>ESTIMATED TIME</small><strong>25–35 minutes</strong></span></div>
          <div><ShieldCheck size={17} /><span><small>PARTS WARRANTY</small><strong>18 months</strong></span></div>
        </section>
      </main>
      <div className="sticky-action estimate-actions">
        <Button onClick={onApprove}>Approve GHS 880</Button>
        <div><Button variant="secondary">Ask a question</Button><Button variant="ghost">Reject</Button></div>
      </div>
    </div>
  );
}

function PaymentScreen({ onPaid }: { onPaid: () => void }) {
  return (
    <div className="screen">
      <AppHeader title="Service complete" />
      <main className="flow-content payment-content">
        <div className="completion-mark"><Check size={28} /></div>
        <span className="signal-label signal-label--green">REPAIR COMPLETED</span>
        <h1>You're ready for the road</h1>
        <p>Battery replaced and vehicle start tested successfully.</p>
        <section className="receipt-card">
          <span className="overline">SERVICE SUMMARY</span>
          <div><span>Provider</span><strong>Kojo AutoCare</strong></div>
          <div><span>Vehicle</span><strong>Toyota Corolla</strong></div>
          <div><span>Service</span><strong>Battery replacement</strong></div>
          <div><span>Date</span><strong>{new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date())}</strong></div>
          <div className="cost-total"><span>Total due</span><strong>GHS 880</strong></div>
        </section>
        <section className="payment-method">
          <div><span className="momo-logo">Mo</span><span><strong>MTN Mobile Money</strong><small>+233 24 ••• 4567</small></span></div>
          <button onClick={() => { window.location.href = "/app/profile"; }} type="button">Change</button>
        </section>
      </main>
      <div className="sticky-action">
        <Button icon={CreditCard} onClick={onPaid}>Pay GHS 880</Button>
        <p>Payment is verified securely. A receipt will be saved to Activity.</p>
      </div>
    </div>
  );
}

function RatingScreen({ onFinish }: { onFinish: () => void }) {
  const [rating, setRating] = useState(0);
  return (
    <div className="screen centered-state rating-screen">
      <AppHeader title="Rate your service" />
      <main>
        <div className="provider-avatar provider-avatar--large">KA</div>
        <h1>How did Kojo do?</h1>
        <p>Your feedback helps drivers choose trusted providers.</p>
        <div className="stars" aria-label="Choose a rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button aria-label={`${value} stars`} key={value} onClick={() => setRating(value)} type="button">
              <Star fill={value <= rating ? "currentColor" : "none"} size={34} />
            </button>
          ))}
        </div>
        <p className="rating-label">{rating ? (rating === 5 ? "Excellent" : "Thanks for your feedback") : "Tap to rate"}</p>
        <div className="rating-tags">
          {["Professional", "Arrived quickly", "Clear pricing", "Quality work"].map((tag) => <button key={tag} onClick={() => {}} type="button">{tag}</button>)}
        </div>
      </main>
      <div className="sticky-action">
        <Button disabled={!rating} onClick={onFinish}>Submit review</Button>
        <Button variant="ghost" onClick={onFinish}>Skip for now</Button>
      </div>
    </div>
  );
}

function CompleteScreen({ onHome }: { onHome: () => void }) {
  return (
    <div className="screen centered-state complete-screen">
      <AppHeader />
      <main>
        <div className="success-orbit"><Check size={32} /></div>
        <h1>All sorted.</h1>
        <p>Your receipt and service record are saved to Activity. Drive safely, Kwame.</p>
        <Button onClick={onHome}>Back to home</Button>
      </main>
    </div>
  );
}

const scenarioCopy: Record<Scenario, { label: string; title: string; body: string; icon: LucideIcon; tone: string }> = {
  "provider-declined": { label: "AUTO-RETRYING", title: "Your first provider couldn't make it.", body: "No action needed. We're already finding the next best available provider.", icon: RefreshCw, tone: "amber" },
  nearby: { label: "PROVIDER NEARBY", title: "Kojo is almost there.", body: "Look for a white Toyota Hilux, GT 4198-22. Stay somewhere safe and visible.", icon: Navigation, tone: "blue" },
  cancelled: { label: "REQUEST CANCELLED", title: "Your request was cancelled.", body: "Kojo has been notified. You haven't been charged for the service.", icon: X, tone: "neutral" },
  "no-provider": { label: "SEARCH COMPLETE", title: "We couldn't find available help nearby.", body: "Try widening the search area, request a tow, or call our support team.", icon: Search, tone: "amber" },
  "location-denied": { label: "LOCATION NEEDED", title: "We can't access your location.", body: "Enter your location manually so we can find help near you.", icon: MapPin, tone: "amber" },
  offline: { label: "YOU'RE OFFLINE", title: "Your request hasn't been sent yet.", body: "We'll retry when you're back online. Keep this screen open if you can.", icon: Radio, tone: "danger" },
};

function ScenarioScreen({
  scenario,
  onClose,
  onContinue,
}: {
  scenario: Scenario;
  onClose: () => void;
  onContinue: () => void;
}) {
  const data = scenarioCopy[scenario];
  const Icon = data.icon;
  return (
    <div className="screen scenario-screen">
      <AppHeader onBack={onClose} title="Emergency request" />
      <main>
        <div className={`scenario-icon scenario-icon--${data.tone}`}><Icon size={30} /></div>
        <span className={`signal-label signal-label--${data.tone}`}>{scenario === "provider-declined" && <span />}{data.label}</span>
        <h1>{data.title}</h1>
        <p>{data.body}</p>
        {scenario === "provider-declined" && <div className="retry-card"><RefreshCw className="spin" size={19} /><span><strong>Contacting Nii's Mobile Garage</strong><small>12 min away · 4.8 rating</small></span></div>}
        {scenario === "nearby" && <div className="retry-card"><Car size={20} /><span><strong>White Toyota Hilux</strong><small>GT 4198-22 · Kojo Mensah</small></span><Button icon={Phone}>Call</Button></div>}
        {scenario === "offline" && <div className="notice notice--danger"><Radio size={19} /><div><strong>Not sent yet</strong><p>Don't assume a provider is coming until you see a confirmation.</p></div></div>}
        {scenario === "location-denied" && <div className="fake-input"><label htmlFor="manual-address">Street or landmark</label><div><Search size={18} /><input id="manual-address" placeholder="e.g. Accra Mall, Spintex Road" /></div></div>}
      </main>
      <div className="sticky-action">
        {scenario === "no-provider" ? (
          <><Button onClick={onContinue}>Widen search area</Button><Button variant="secondary" icon={Car}>Request a tow instead</Button><Button variant="ghost" icon={Phone}>Call support</Button></>
        ) : scenario === "cancelled" ? (
          <Button onClick={onClose}>Back to home</Button>
        ) : scenario === "location-denied" ? (
          <Button onClick={onContinue}>Find help at this location</Button>
        ) : scenario === "offline" ? (
          <Button variant="secondary" icon={RefreshCw}>Try again</Button>
        ) : (
          <Button onClick={onContinue}>{scenario === "nearby" ? "I see the provider" : "Continue"}</Button>
        )}
      </div>
    </div>
  );
}

export default function DriverApp({ initialScreen = "home" }: { initialScreen?: Screen }) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState<Screen>(() => initialScreen === "need" ? screenForEmergency(useAppStore.getState().emergencyRequest?.status) : initialScreen);
  const [selectedProblem, setSelectedProblem] = useState("");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const emergencyRequest = useAppStore((state) => state.emergencyRequest);
  const vehicle = useAppStore((state) => state.activeVehicle);
  const startEmergency = useAppStore((state) => state.startEmergency);
  const transitionRequest = useAppStore((state) => state.transitionEmergency);
  const clearEmergency = useAppStore((state) => state.clearEmergency);
  const backendRequestId = useRef<string | null>(null);

  const beginEmergency = () => {
    if (emergencyRequest && ["reviewed", "cancelled"].includes(emergencyRequest.status)) clearEmergency();
    if (!emergencyRequest || ["reviewed", "cancelled"].includes(emergencyRequest.status)) startEmergency();
    backendRequestId.current = null;
    navigate("/app/emergency/problem");
  };

  const syncEmergency = async (statuses: EmergencyStatus[]) => {
    try {
      if (!backendRequestId.current) {
        if (!statuses.includes("requested") || !vehicle) return;
        const request = await emergencyService.submit({
          vehicleId: vehicle.id,
          problem: selectedProblem || "Emergency assistance requested",
          location: { label: "Oxford Street, Osu" },
        });
        backendRequestId.current = request.id;
        return;
      }
      for (const status of statuses) {
        const mapped = emergencyBackendMap[status];
        if (mapped) await emergencyService.progress(backendRequestId.current, mapped);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const advanceEmergency = (statuses: EmergencyStatus[], nextScreen: Screen) => {
    try {
      statuses.forEach((status) => transitionRequest(status));
      setScreen(nextScreen);
    } catch (error) {
      console.error(error);
    }
    void syncEmergency(statuses);
  };

  const openDriverFeatures = (start: DriverFeatureStart) => {
    const routes: Record<DriverFeatureStart, string> = {
      hub: "/app/services",
      explore: "/app/explore",
      booking: "/app/book",
      vehicles: "/app/vehicles",
      tow: "/app/tow",
      parts: "/app/parts",
      chat: "/app/chat",
    };
    navigate(routes[start]);
  };

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen, scenario]);

  useEffect(() => {
    if (initialScreen === "need" && !emergencyRequest) startEmergency();
  }, [emergencyRequest, initialScreen, startEmergency]);

  const content = useMemo(() => {
    if (scenario) {
      return (
        <ScenarioScreen
          onClose={() => { setScenario(null); if (scenario === "cancelled") setScreen("home"); }}
          onContinue={() => { setScenario(null); setScreen(scenario === "nearby" ? "arrived" : scenario === "location-denied" ? "searching" : "tracking"); }}
          scenario={scenario}
        />
      );
    }
    switch (screen) {
      case "home": return <HomeScreen onEmergency={beginEmergency} onNavigate={openDriverFeatures} onProfile={() => navigate("/app/profile")} />;
      case "profile": return <ProfileScreen onEmergency={beginEmergency} onHome={() => navigate("/app/home")} onNavigate={openDriverFeatures} setTheme={setTheme} theme={theme} />;
      case "need": return <NeedScreen onBack={() => navigate("/app/home")} onContinue={() => advanceEmergency(["locating"], "location")} onSelect={setSelectedProblem} selected={selectedProblem} />;
      case "location": return <LocationScreen onBack={() => setScreen("need")} onContinue={() => advanceEmergency(["searching"], "searching")} onDenied={() => setScenario("location-denied")} />;
      case "searching": return <SearchingScreen onCancel={() => { setScreen("home"); setSelectedProblem(""); }} onFound={() => advanceEmergency(["results"], "results")} />;
      case "results": return <ProviderResults onBack={() => setScreen("location")} onSelect={() => advanceEmergency(["confirming"], "confirm")} />;
      case "confirm": return <ConfirmScreen onBack={() => setScreen("results")} onConfirm={() => advanceEmergency(["requested"], "sent")} />;
      case "sent": return <SentScreen onContinue={() => advanceEmergency(["matched", "enRoute"], "tracking")} />;
      case "tracking": return <TrackingScreen onArrived={() => advanceEmergency(["nearby", "arrived"], "arrived")} onScenario={setScenario} />;
      case "arrived": return <ArrivedScreen onEstimate={() => advanceEmergency(["diagnosing", "awaitingApproval"], "estimate")} />;
      case "estimate": return <EstimateScreen onApprove={() => advanceEmergency(["repairing", "completed", "paying"], "payment")} onBack={() => setScreen("arrived")} />;
      case "payment": return <PaymentScreen onPaid={() => advanceEmergency(["paid"], "rating")} />;
      case "rating": return <RatingScreen onFinish={() => advanceEmergency(["reviewed"], "complete")} />;
      case "complete": return <CompleteScreen onHome={() => setScreen("home")} />;
      default: return null;
    }
  }, [emergencyRequest, navigate, scenario, screen, selectedProblem, theme]);

  return content;
}
