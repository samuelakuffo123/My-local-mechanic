import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  Bell,
  BookOpen,
  Car,
  CalendarDays,
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
  Share2,
  ShoppingBag,
  ShieldCheck,
  Star,
  Sun,
  Thermometer,
  TriangleAlert,
  Trash2,
  UserRound,
  Wrench,
  X,
  Zap,
  Moon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DriverFeatureStart } from "../explore/DriverFeatures";
import { BrandLogo } from "../../components/BrandLogo";
import { authService } from "../../services/auth";
import { emergencyService } from "../../services/emergency";
import { providerService, type Provider } from "../../services/providers";
import { useAppStore } from "../../state/store";
import type { EmergencyStatus } from "../../state/emergencyMachine";

const MapboxLocationPicker = lazy(() => import("./MapboxLocationPicker"));

type Screen =
  | "home"
  | "profile"
  | "need"
  | "location"
  | "searching"
  | "confirm"
  | "sent"
  | "complete";

function screenForEmergency(status?: EmergencyStatus): Screen {
  if (!status || status === "idle" || status === "choosingProblem") return "need";
  if (status === "locating") return "location";
  if (["searching", "providerDeclined", "offline", "results", "noProvider"].includes(status)) return "searching";
  if (status === "confirming") return "confirm";
  if (status === "requested") return "sent";
  return "complete";
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
    <BrandLogo />
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
  onActivity,
  onEmergency,
  onHome,
  onNavigate,
  onProfile,
}: {
  active?: "Home" | "Activity" | "Profile";
  onActivity: () => void;
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
          onClick={() => label === "Home" ? onHome() : label === "Explore" ? onNavigate("explore") : label === "Emergency" ? onEmergency() : label === "Activity" ? onActivity() : onProfile()}
          type="button"
        >
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function HomeScreen({
  onEmergency,
  onActivity,
  onNavigate,
  onProfile,
}: {
  onEmergency: () => void;
  onActivity: () => void;
  onNavigate: (start: DriverFeatureStart) => void;
  onProfile: () => void;
}) {
  const user = useAppStore((state) => state.user);
  const vehicle = useAppStore((state) => state.activeVehicle);
  const initials = (user?.name ?? "Driver").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
  const firstName = user?.name.split(" ")[0] ?? "there";
  const formattedPlate = vehicle?.plate
    ? vehicle.plate.trim().toUpperCase().replace(/^([A-Z]{1,3})\s*(\d{1,4})\s*-\s*(\d{2,4})$/, "$1 $2-$3")
    : "";
  return (
    <div className="screen screen--home">
      <AppHeader
        trailing={
          <div className="header-actions">
            <div className="avatar">{initials}</div>
          </div>
        }
      />

      <main className="home-content">
        <section className="welcome">
          <p className="eyebrow">YOUR MY LOCAL MECHANIC GARAGE</p>
          <h1>Ready for the road, {firstName}?</h1>
          <p>{vehicle ? `Your ${vehicle.make} ${vehicle.model} is in your garage.` : "Add a vehicle to keep your service details together."}</p>
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
              <Car size={38} aria-hidden="true" />
            </div>
            <div className="vehicle-details">
              <h2>{vehicle ? `${vehicle.make} ${vehicle.model}` : "No vehicle yet"}</h2>
              {formattedPlate && <span className="ghana-plate">{formattedPlate}</span>}
              {vehicle ? (
                <p className="vehicle-meta">
                  <span>{vehicle.year}</span>
                  <i aria-hidden="true" />
                  <span>{vehicle.mileageKm.toLocaleString()} km</span>
                </p>
              ) : <p>Set up your vehicle profile</p>}
            </div>
          </div>
          <div className="vehicle-card__meta">
            {vehicle ? (
              <>
                <div className="vehicle-diagnostics">
                  <Gauge size={17} aria-hidden="true" />
                  <span>Live diagnostics are not connected</span>
                </div>
                <button aria-describedby="diagnostics-status" className="vehicle-diagnostics__action" disabled type="button">Connect diagnostics</button>
                <span className="sr-only" id="diagnostics-status">Live diagnostics are not available yet.</span>
              </>
            ) : (
              <span>Add a vehicle to keep its service details here.</span>
            )}
          </div>
        </section>

        <section className="emergency-card">
          <div className="emergency-card__header">
            <span className="emergency-card__icon"><LifeBuoy size={23} strokeWidth={1.75} /></span>
            <span className="emergency-card__copy">
              <strong>Need a mechanic now?</strong>
              <small>Choose a problem and pickup point.</small>
            </span>
          </div>
          <button className="emergency-request-button" onClick={onEmergency} type="button">Get roadside help <ArrowRight size={17} aria-hidden="true" /></button>
          <div className="emergency-card__footer">
            <p className="emergency-card__disclaimer">Requests are saved only; no mechanic is contacted.</p>
            <button className="emergency-tow-link" onClick={() => onNavigate("tow")} type="button">Tow estimate <ArrowRight size={14} aria-hidden="true" /></button>
          </div>
        </section>

        <section className="quick-section">
          <div className="section-heading">
            <div>
              <span className="overline">SERVICES</span>
              <h2>What do you need?</h2>
            </div>
            <button aria-label="See all services" className="text-button" onClick={() => onNavigate("hub")} type="button">
              All services <ArrowRight aria-hidden="true" size={15} />
            </button>
          </div>
          <div className="product-stack__grid">
            {[
              { title: "Mechanic service", status: "Sample listings", action: "Browse mechanics", description: "Explore local mechanic listings.", icon: Wrench, start: "explore" as DriverFeatureStart },
            ].map(({ title, status, action, description, icon: Icon, start }) => (
              <button key={title} className="product-card" onClick={() => onNavigate(start)} type="button">
                <div className="product-card__head">
                  <span className="product-card__icon"><Icon size={18} /></span>
                  <span className="product-card__tag">{status}</span>
                </div>
                <div className="product-card__body">
                  <strong>{title}</strong>
                  <p>{description}</p>
                </div>
                <div className="product-card__meta">
                  <span>{action}</span>
                  <ArrowRight size={18} aria-hidden="true" />
                </div>
              </button>
            ))}
            <article aria-disabled="true" className="product-card product-card--disabled">
              <div className="product-card__head">
                <span className="product-card__icon"><ShoppingBag size={18} /></span>
                <span className="product-card__tag">Coming soon</span>
              </div>
              <div className="product-card__body">
                <strong>Vehicle parts</strong>
                <p>Parts ordering is not available yet.</p>
              </div>
            </article>
          </div>
          <p className="services-note">Mechanic listings are examples; requests do not contact providers.</p>
        </section>

        <section className="nearby-section">
          <div className="section-heading">
            <div>
              <span className="overline">SERVICE DIRECTORY</span>
              <h2>Browse mechanic examples</h2>
            </div>
          </div>
          <div aria-label="Illustrative mechanic directory map; no live provider locations" className="nearby-card" role="img">
            <div className="nearby-card__map">
              <span className="map-grid" />
              <span className="map-road map-road--one" /><span className="map-road map-road--two" />
              <span className="map-pin map-pin--one"><Wrench size={13} /></span>
              <span className="map-pin map-pin--two"><Car size={13} /></span>
              <span className="map-pin map-pin--three"><Wrench size={13} /></span>
              <span className="map-pin map-pin--user"><Navigation size={12} fill="currentColor" /></span>
              <span className="nearest-chip"><Clock3 size={13} /> Example map · not live</span>
            </div>
          </div>
          <p className="activity-local-note">Listings are samples. Confirm availability directly.</p>
        </section>

      </main>
      <BottomNav onActivity={onActivity} onEmergency={onEmergency} onHome={() => undefined} onNavigate={onNavigate} onProfile={onProfile} />
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
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={disabled ? `${label} unavailable` : `${checked ? "Disable" : "Enable"} ${label}`}
      aria-pressed={checked}
      className={`profile-switch ${checked ? "on" : ""}`}
      onClick={onChange}
      disabled={disabled}
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
}: {
  panel: Exclude<ProfilePanel, null>;
  close: () => void;
  setTheme: (theme: "dark" | "light") => void;
  theme: "dark" | "light";
}) {
  const user = useAppStore((state) => state.user);
  const navigate = useNavigate();
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
    about: "About My Local Mechanic",
  };

  const notifyUnavailable = (label: string) => {
    setNotice(`${label} is not available yet. No changes were made.`);
  };

  return (
    <div className="profile-panel" role="dialog" aria-modal="true" aria-label={titles[panel]}>
      <header>
        <IconButton icon={ArrowLeft} label="Back to profile" onClick={close} />
        <strong>{titles[panel]}</strong>
        <span />
      </header>
      <main>
        {notice && <div className="profile-notice">{notice}</div>}
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
            <div className="profile-form">
              <label>Full name<input readOnly value={user?.name ?? ""} placeholder="Not provided" /></label>
              <label>Phone number<input readOnly value={user?.phone ?? ""} placeholder="Not provided" /></label>
              <label>Email address<input readOnly value={user?.email ?? ""} placeholder="Not provided" type="email" /></label>
            </div>
            <p className="profile-panel-intro">Profile editing and photo uploads require a connected account service.</p>
          </>
        )}
        {panel === "payments" && (
          <>
            <p className="profile-panel-intro">No payment methods are connected. Card and mobile-money details are not collected, and payments cannot be processed yet.</p>
          </>
        )}
        {panel === "addresses" && (
          <>
            <p className="profile-panel-intro">You have no saved addresses. Location is not tracked in the background or shared with providers.</p>
          </>
        )}
        {panel === "notifications" && (
          <section className="profile-toggle-list">
            <div><span><strong>Service updates</strong><small>Notification delivery is not connected yet.</small></span><SettingSwitch checked={false} disabled label="service updates" onChange={() => notifyUnavailable("Service notifications")} /></div>
            <div><span><strong>Maintenance reminders</strong><small>Reminder scheduling is not available yet.</small></span><SettingSwitch checked={false} disabled label="maintenance reminders" onChange={() => notifyUnavailable("Maintenance reminders")} /></div>
            <div><span><strong>Messages</strong><small>Push notifications are not configured.</small></span><SettingSwitch checked={false} disabled label="message notifications" onChange={() => notifyUnavailable("Message notifications")} /></div>
            <div><span><strong>Offers and product news</strong><small>Marketing preferences are not available yet.</small></span><SettingSwitch checked={false} disabled label="promotional updates" onChange={() => notifyUnavailable("Promotional updates")} /></div>
          </section>
        )}
        {panel === "privacy" && (
          <>
            <section className="profile-toggle-list">
              <div><span><strong>Location access</strong><small>Live location is not connected; enter a location manually.</small></span><SettingSwitch checked={false} disabled label="location access" onChange={() => notifyUnavailable("Location access")} /></div>
              <div><span><strong>Usage analytics</strong><small>Analytics collection is not configured.</small></span><SettingSwitch checked={false} disabled label="usage analytics" onChange={() => notifyUnavailable("Usage analytics")} /></div>
            </section>
            <div className="profile-permission-card"><MapPin size={19} /><span><strong>No background location tracking</strong><small>Location is entered manually and is not shared with providers.</small></span></div>
            <button className="profile-text-action" onClick={() => setNotice("Device permission controls are not needed because live location is not connected.")} type="button">Review app permissions <ArrowRight size={16} /></button>
            <button className="profile-text-action" onClick={() => notifyUnavailable("Privacy policy")} type="button">Privacy policy <ArrowRight size={16} /></button>
          </>
        )}
        {panel === "security" && (
          <>
            <section className="profile-toggle-list">
              <div><span><strong>Biometric unlock</strong><small>Device authentication is not configured.</small></span><SettingSwitch checked={false} disabled label="biometric unlock" onChange={() => notifyUnavailable("Biometric unlock")} /></div>
              <button onClick={() => notifyUnavailable("Password updates")} type="button"><span><strong>Change password</strong><small>Password changes are not available yet</small></span><ChevronRight size={17} /></button>
              <button onClick={() => notifyUnavailable("Two-step verification")} type="button"><span><strong>Two-step verification</strong><small>Phone verification is not configured</small></span><em>OFF</em><ChevronRight size={17} /></button>
              <button onClick={() => notifyUnavailable("Session management")} type="button"><span><strong>Active sessions</strong><small>Session controls are not available yet</small></span><ChevronRight size={17} /></button>
            </section>
          </>
        )}
        {panel === "support" && (
          <>
            <div className="support-hero"><Headphones size={25} /><span><strong>How can we help?</strong><small>Support messaging is not connected yet.</small></span><Button icon={MessageCircle} onClick={() => navigate("/app/chat")}>Open messages</Button></div>
            <section className="profile-link-list">
              <button onClick={() => notifyUnavailable("FAQs")} type="button"><BookOpen size={19} /><span><strong>Frequently asked questions</strong><small>Bookings, payments, towing, and parts</small></span><ChevronRight size={17} /></button>
              <button onClick={() => notifyUnavailable("Issue reporting")} type="button"><CircleAlert size={19} /><span><strong>Report an issue</strong><small>Tell us what went wrong</small></span><ChevronRight size={17} /></button>
              <button onClick={() => notifyUnavailable("Support tickets")} type="button"><FileText size={19} /><span><strong>Support tickets</strong><small>Contact support about an issue</small></span><ChevronRight size={17} /></button>
              <button onClick={() => notifyUnavailable("Safety centre")} type="button"><ShieldCheck size={19} /><span><strong>Safety centre</strong><small>Emergency guidance and trusted contacts</small></span><ChevronRight size={17} /></button>
            </section>
          </>
        )}
        {panel === "data" && (
          <>
            <div className="profile-data-hero"><Download size={24} /><span><strong>Your data belongs to you</strong><small>Download a copy of your account, vehicle, booking, and service information.</small></span></div>
            <Button icon={Download} onClick={() => notifyUnavailable("Data export")} variant="secondary">Request data export</Button>
            <section className="profile-danger-zone">
              <span className="overline">DANGER ZONE</span>
              <h2>Delete your account</h2>
              <p>This permanently removes your profile after active bookings, orders, and disputes are resolved. Locked service records remain available where legally required.</p>
              <Button icon={Trash2} onClick={() => notifyUnavailable("Account deletion")} variant="danger">Delete account</Button>
            </section>
          </>
        )}
        {panel === "about" && (
          <section className="profile-data-hero">
            <CircleAlert size={22} />
            <span><strong>My Local Mechanic</strong><small>Accounts, vehicles, and payment intents are stored securely. Online booking, provider dispatch, phone verification, live location, and payment processing are not available yet.</small></span>
          </section>
        )}
      </main>
    </div>
  );
}

function ProfileScreen({
  onActivity,
  onEmergency,
  onHome,
  onNavigate,
  setTheme,
  theme,
}: {
  onActivity: () => void;
  onEmergency: () => void;
  onHome: () => void;
  onNavigate: (start: DriverFeatureStart) => void;
  setTheme: (theme: "dark" | "light") => void;
  theme: "dark" | "light";
}) {
  const navigate = useNavigate();
  const [panel, setPanel] = useState<ProfilePanel>(null);
  const [signOutError, setSignOutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const user = useAppStore((state) => state.user);
  const vehicle = useAppStore((state) => state.activeVehicle);
  const groups = [
    {
      label: "ACCOUNT",
      items: [
        { title: "Personal information", detail: "Name, phone, email", icon: UserRound, panel: "personal" as const },
        { title: "My vehicles", detail: vehicle ? `Primary: ${vehicle.make} ${vehicle.model}` : "No vehicles added", icon: Car, action: () => onNavigate("vehicles") },
        { title: "Payment methods", detail: "No payment methods connected", icon: CreditCard, panel: "payments" as const },
        { title: "Saved addresses", detail: "No saved addresses", icon: MapPin, panel: "addresses" as const },
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
        { title: "About My Local Mechanic", detail: "Version and service information", icon: CircleAlert, panel: "about" as const },
      ],
    },
  ];
  return (
    <div className="screen profile-screen">
      <AppHeader title="Profile" />
      <main className="profile-content">
        <section className="profile-identity">
          <div className="avatar avatar--large">{(user?.name ?? "D").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div><span className="overline">DRIVER ACCOUNT</span><h1>{user?.name ?? "Driver"}</h1><p>{user?.phone ?? "No phone number"}</p></div>
          <button aria-label="Edit personal information" onClick={() => setPanel("personal")} type="button"><ChevronRight size={19} /></button>
        </section>
        <section className="profile-completeness">
          <div><ShieldCheck size={18} /><span><strong>Account security</strong><small>Phone verification has not been configured.</small></span></div>
          <span>API</span>
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
        {signOutError && <p role="alert">{signOutError}</p>}
        <button className="profile-signout" disabled={signingOut} onClick={async () => {
          setSignOutError("");
          setSigningOut(true);
          try {
            await authService.logout();
            useAppStore.getState().signOut();
            navigate("/login", { replace: true });
          } catch (cause) {
            setSignOutError(cause instanceof Error ? cause.message : "We couldn't sign you out.");
          } finally {
            setSigningOut(false);
          }
        }} type="button"><LogOut size={18} /> {signingOut ? "Signing out…" : "Sign out"}</button>
        <p className="profile-version">Made for local drivers in Ghana</p>
      </main>
      <BottomNav active="Profile" onActivity={onActivity} onEmergency={onEmergency} onHome={onHome} onNavigate={onNavigate} onProfile={() => undefined} />
      {panel && <ProfilePanelSheet close={() => setPanel(null)} panel={panel} setTheme={setTheme} theme={theme} />}
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
          <p>Choose the closest match. You can review a mechanic and your pickup area next.</p>
        </div>
        {accident && (
          <div className="notice notice--warning">
            <TriangleAlert size={20} />
            <div>
              <strong>Is anyone in immediate danger?</strong>
              <p>Contact Ghana emergency services first. My Local Mechanic is not a replacement for emergency services.</p>
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
        <p>Live dispatch is not connected. You’ll review the request before saving it.</p>
      </div>
    </div>
  );
}

function LocationScreen({
  location,
  coordinates,
  onChange,
  onCoordinatesChange,
  onBack,
  onContinue,
}: {
  location: string;
  coordinates: { lat: number; lng: number } | null;
  onChange: (value: string) => void;
  onCoordinatesChange: (value: { lat: number; lng: number } | null) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Location access isn’t available here. Enter a nearby street or landmark instead.");
      return;
    }

    setLocationError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        onCoordinatesChange({ lat: coords.latitude, lng: coords.longitude });
        onChange("Current location");
        setLocating(false);
      },
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Enter a nearby street or landmark instead."
            : error.code === error.TIMEOUT
              ? "We couldn’t get your location in time. Try again or enter it manually."
              : "We couldn’t determine your location. Enter a nearby street or landmark instead.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="screen">
      <AppHeader onBack={onBack} step={2} />
      <main className="flow-content location-layout">
        <div className="flow-heading">
          <span className="signal-label signal-label--blue"><MapPin size={13} /> PICKUP LOCATION</span>
          <h1>Where should the mechanic meet you?</h1>
          <p>Set a pickup point so the mechanic can find your vehicle.</p>
        </div>
        <Suspense fallback={<div className="mapbox-map-placeholder" role="status">Loading the interactive map…</div>}>
          <MapboxLocationPicker
            coordinates={coordinates}
            location={location}
            onChange={onChange}
            onCoordinatesChange={onCoordinatesChange}
          />
        </Suspense>
        <button className="use-location-button" disabled={locating} onClick={useCurrentLocation} type="button">
          <LocateFixed size={17} /> {locating ? "Getting your location…" : "Use my current location"}
        </button>
        {locationError && <p className="location-error" role="alert">{locationError}</p>}
        <div className="privacy-note"><ShieldCheck size={17} /><span>When map features are enabled, searches and selected map coordinates go to Mapbox for lookup. Your request is saved to your account only when you submit it. Live provider dispatch isn’t available yet.</span></div>
      </main>
      <div className="sticky-action">
        <Button disabled={!location.trim()} onClick={onContinue}>See mechanic options</Button>
        <p>Options are sample listings, not live availability.</p>
      </div>
    </div>
  );
}

function SearchingScreen({
  location,
  initialSelectedId,
  onCancel,
  onContinue,
}: {
  location: string;
  initialSelectedId: string;
  onCancel: () => void;
  onContinue: (provider: Provider) => void;
}) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    providerService.list(25)
      .then((list) => {
        if (active) setProviders(list.filter((provider) => provider.type === "mechanic"));
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "We couldn’t load mechanic examples.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt]);

  const selectedProvider = providers.find((provider) => provider.id === selectedId);

  return (
    <div className="screen provider-choice-screen">
      <AppHeader onBack={onCancel} step={3} />
      <main className="flow-content">
        <div className="flow-heading">
          <span className="signal-label signal-label--blue"><Wrench size={14} /> MECHANIC OPTIONS</span>
          <h1>Choose a mechanic.</h1>
          <p>Examples near your pickup area: {location}. Availability and arrival times aren’t live.</p>
        </div>
        <div className="provider-map-preview">
          <span className="map-grid" />
          <span className="street street--one" />
          <span className="street street--two" />
          <span className="location-pulse"><MapPin size={18} /></span>
          <span className="provider-map-pin provider-map-pin--one"><Wrench size={14} /></span>
          <span className="provider-map-pin provider-map-pin--two"><Wrench size={14} /></span>
          <span className="provider-map-preview__caption">Illustrative map · example mechanic locations</span>
        </div>
        <div className="provider-example-note"><CircleAlert size={16} /><span>These are sample profiles. Choosing one saves your preference; it does not contact the mechanic.</span></div>
        {loading && <p className="provider-state" role="status">Loading mechanic options…</p>}
        {error && <div className="provider-error" role="alert"><p>{error}</p><button onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></div>}
        {!loading && !error && !providers.length && <p className="provider-state">No mechanic listings are available right now.</p>}
        {!loading && !error && providers.length > 0 && (
          <div className="provider-choice-list" role="radiogroup" aria-label="Example mechanics">
            {providers.map((provider) => (
              <button
                aria-checked={selectedId === provider.id}
                className={`provider-choice${selectedId === provider.id ? " selected" : ""}`}
                key={provider.id}
                onClick={() => setSelectedId(provider.id)}
                role="radio"
                type="button"
              >
                <span className="provider-choice__avatar"><Wrench size={20} /></span>
                <span className="provider-choice__details">
                  <strong>{provider.name}</strong>
                  <small>{provider.distanceKm} km · {provider.etaMinutes} min estimate · ★ {provider.rating.toFixed(1)}</small>
                  <em>Example listing · not verified</em>
                </span>
                <span className="radio-mark">{selectedId === provider.id && <Check size={13} />}</span>
              </button>
            ))}
          </div>
        )}
      </main>
      <div className="sticky-action">
        <Button disabled={!selectedProvider || loading || Boolean(error)} onClick={() => selectedProvider && onContinue(selectedProvider)}>
          Review request
        </Button>
        <p>No provider is notified and no payment is taken.</p>
      </div>
    </div>
  );
}

function ConfirmScreen({ onBack, onConfirm, problem, location, providerName, saving, error }: {
  onBack: () => void;
  onConfirm: () => void;
  problem: string;
  location: string;
  providerName: string;
  saving: boolean;
  error: string;
}) {
  const vehicle = useAppStore((state) => state.activeVehicle);
  return (
    <div className="screen">
      <AppHeader onBack={onBack} title="Review roadside request" />
      <main className="flow-content confirm-content">
        <div className="flow-heading">
          <span className="signal-label signal-label--amber"><CircleAlert size={14} /> REQUEST ONLY</span>
          <h1>Review before saving.</h1>
          <p>This saves your request for your records. It doesn’t book or contact the selected mechanic.</p>
        </div>
        <section className="request-details">
          <h2>Request details</h2>
          <dl>
            <div><dt><CircleAlert size={17} /> Problem</dt><dd>{problem}</dd></div>
            <div><dt><Car size={17} /> Vehicle</dt><dd>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ""}` : "No vehicle saved"}</dd></div>
            <div><dt><MapPin size={17} /> Pickup area</dt><dd>{location}</dd></div>
            <div><dt><Wrench size={17} /> Mechanic</dt><dd>{providerName}</dd></div>
          </dl>
        </section>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </main>
      <div className="sticky-action">
        <Button disabled={saving} onClick={onConfirm}>{saving ? "Saving request…" : "Save request"}</Button>
        <p>No provider is notified; payment is not available.</p>
      </div>
    </div>
  );
}

function SentScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="screen centered-state">
      <AppHeader />
      <main>
        <div className="success-orbit"><Check size={32} /><span /></div>
        <span className="signal-label signal-label--green">SAVED TO YOUR ACCOUNT</span>
        <h1>Your request is saved.</h1>
        <p>No provider has been notified. Do not wait for assistance based on this saved request.</p>
        <Button onClick={onContinue}>View activity</Button>
      </main>
      <div className="centered-state__footer"><ShieldCheck size={16} /> No dispatch or payment has taken place.</div>
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
            title: "My Local Mechanic trip",
            text: "I’m managing a service request with My Local Mechanic.",
            url: window.location.href,
          };
          if (navigator.share) {
            await navigator.share(shareData);
          } else {
            window.location.href = `mailto:?subject=${encodeURIComponent("My Local Mechanic trip")}&body=${encodeURIComponent(shareData.text + "\n" + shareData.url)}`;
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

function PaymentScreen({ onSave }: { onSave: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function saveIntent() {
    setSaving(true);
    setError("");
    try {
      await onSave();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't save the payment intent.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="screen">
      <AppHeader title="Payment details" />
      <main className="flow-content payment-content">
        <div className="completion-mark"><Check size={28} /></div>
        <span className="signal-label signal-label--amber">NOT CHARGED</span>
        <h1>Review the estimated total</h1>
        <p>No mechanic has been dispatched. This is a sample estimate, not a provider quote or completed repair.</p>
        <section className="receipt-card">
          <span className="overline">ILLUSTRATIVE ESTIMATE</span>
          <div><span>Service</span><strong>Roadside assistance</strong></div>
          <div className="cost-total"><span>Estimated amount</span><strong>GHS 880</strong></div>
        </section>
        <p className="activity-local-note">This records a pending payment intent only. No payment method is connected and no money will be charged.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </main>
      <div className="sticky-action">
        <Button disabled={saving} icon={CreditCard} onClick={saveIntent}>{saving ? "Saving…" : "Save payment intent · no charge"}</Button>
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

function CompleteScreen({ onActivity, onHome }: { onActivity: () => void; onHome: () => void }) {
  return (
    <div className="screen centered-state complete-screen">
      <AppHeader />
      <main>
        <div className="success-orbit"><Check size={32} /></div>
        <h1>No active request.</h1>
        <p>Provider dispatch and payment are not available. Any saved request remains in your activity.</p>
        <Button onClick={onActivity} variant="secondary">View activity</Button>
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
        {scenario === "location-denied" && <div className="scenario-address-input"><label htmlFor="manual-address">Street or landmark</label><div><Search size={18} /><input id="manual-address" placeholder="e.g. Accra Mall, Spintex Road" /></div></div>}
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
  const [selectedProblem, setSelectedProblem] = useState(() => useAppStore.getState().emergencyRequest?.problem ?? "");
  const [locationLabel, setLocationLabel] = useState(() => useAppStore.getState().emergencyRequest?.location?.label ?? "");
  const [locationCoordinates, setLocationCoordinates] = useState<{ lat: number; lng: number } | null>(() => {
    const location = useAppStore.getState().emergencyRequest?.location;
    return typeof location?.lat === "number" && typeof location.lng === "number"
      ? { lat: location.lat, lng: location.lng }
      : null;
  });
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [requestError, setRequestError] = useState("");
  const [requestSaving, setRequestSaving] = useState(false);
  const theme = useAppStore((state) => state.theme);
  const setTheme = useAppStore((state) => state.setTheme);
  const emergencyRequest = useAppStore((state) => state.emergencyRequest);
  const startEmergency = useAppStore((state) => state.startEmergency);
  const updateEmergency = useAppStore((state) => state.updateEmergency);
  const transitionRequest = useAppStore((state) => state.transitionEmergency);
  const clearEmergency = useAppStore((state) => state.clearEmergency);
  const user = useAppStore((state) => state.user);

  const beginEmergency = () => {
    if (emergencyRequest && ["reviewed", "cancelled", "requested", "noProvider", "offline", "completed", "paid"].includes(emergencyRequest.status)) clearEmergency();
    if (!useAppStore.getState().emergencyRequest) startEmergency();
    setSelectedProblem("");
    setLocationLabel("");
    setLocationCoordinates(null);
    setSelectedProvider(null);
    setRequestError("");
    navigate("/app/emergency/problem");
  };

  const advanceEmergency = (statuses: EmergencyStatus[], nextScreen: Screen) => {
    try {
      statuses.forEach((status) => transitionRequest(status));
      setRequestError("");
      setScreen(nextScreen);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The request could not continue.");
    }
  };

  const saveEmergencyRequest = async () => {
    setRequestSaving(true);
    setRequestError("");
    try {
      const current = useAppStore.getState().emergencyRequest;
      if (!current) throw new Error("No active roadside request was found.");
      if (current.status === "confirming") transitionRequest("requested");
      const request = useAppStore.getState().emergencyRequest;
      if (!request) throw new Error("No active roadside request was found.");
      await emergencyService.save(request, user);
      setScreen("sent");
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : "We couldn't save your roadside request.");
    } finally {
      setRequestSaving(false);
    }
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
  }, [screen]);

  useEffect(() => {
    if (initialScreen === "need" && !emergencyRequest) startEmergency();
  }, [emergencyRequest, initialScreen, startEmergency]);

  const content = useMemo(() => {
    switch (screen) {
      case "home": return <HomeScreen onActivity={() => navigate("/app/activity")} onEmergency={beginEmergency} onNavigate={openDriverFeatures} onProfile={() => navigate("/app/profile")} />;
      case "profile": return <ProfileScreen onActivity={() => navigate("/app/activity")} onEmergency={beginEmergency} onHome={() => navigate("/app/home")} onNavigate={openDriverFeatures} setTheme={setTheme} theme={theme} />;
      case "need": return <NeedScreen onBack={() => {
        clearEmergency();
        navigate("/app/home");
      }} onContinue={() => {
        updateEmergency({ problem: selectedProblem });
        advanceEmergency(["locating"], "location");
      }} onSelect={setSelectedProblem} selected={selectedProblem} />;
      case "location": return <LocationScreen coordinates={locationCoordinates} location={locationLabel} onBack={() => advanceEmergency(["choosingProblem"], "need")} onChange={setLocationLabel} onCoordinatesChange={setLocationCoordinates} onContinue={() => {
        updateEmergency({ location: { label: locationLabel.trim(), ...(locationCoordinates ?? {}) } });
        advanceEmergency(["searching"], "searching");
      }} />;
      case "searching": return <SearchingScreen initialSelectedId={selectedProvider?.id ?? emergencyRequest?.providerId ?? ""} location={locationLabel} onCancel={() => advanceEmergency(["locating"], "location")} onContinue={(provider) => {
        setSelectedProvider(provider);
        updateEmergency({ providerId: provider.id });
        const status = useAppStore.getState().emergencyRequest?.status;
        advanceEmergency(status === "searching" ? ["results", "confirming"] : ["confirming"], "confirm");
      }} />;
      case "confirm": return <ConfirmScreen error={requestError} location={locationLabel} onBack={() => advanceEmergency(["results"], "searching")} onConfirm={() => void saveEmergencyRequest()} problem={selectedProblem} providerName={selectedProvider?.name ?? "Selected mechanic"} saving={requestSaving} />;
      case "sent": return <SentScreen onContinue={() => navigate("/app/activity")} />;
      case "complete": return <CompleteScreen onActivity={() => navigate("/app/activity")} onHome={() => navigate("/app/home")} />;
      default: return null;
    }
  }, [emergencyRequest, locationLabel, navigate, requestError, requestSaving, screen, selectedProblem, setTheme, theme, user]);

  return content;
}
