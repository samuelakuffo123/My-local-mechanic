import "./explore.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  FileText,
  Filter,
  Gauge,
  Heart,
  History,
  Image,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Minus,
  Navigation,
  Package,
  Paperclip,
  Phone,
  Plus,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  Truck,
  UserRound,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import mechanicPhoto from "../../assets/mechanic.jpg";
import partsPhoto from "../../assets/brake.jpg";
import tirePhoto from "../../assets/tyre.jpg";
import towPhoto from "../../assets/tow.jpg";
import { useAppStore } from "../../state/store";
import { bookingService } from "../../services/booking";
import { towService } from "../../services/tow";
import { vehicleService, type ServiceHistoryItem } from "../../services/vehicles";
import type { Vehicle } from "../../services/apiTypes";

const today = new Date();
const vehicleYear = today.getFullYear() - 4;
const vehicleSummary = `${vehicleYear} · GR 8241-22`;
const bookingDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7);
const bookingMonth = new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(bookingDate).toUpperCase();
const historyYear = today.getFullYear();
const historyDate = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(today.getTime() - 45 * 864e5));
const insuranceDate = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(today.getTime() + 180 * 864e5));
const roadworthyDate = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(today.getTime() + 41 * 864e5));

function vehicleLabel(vehicle: Vehicle) {
  return `${vehicle.make} ${vehicle.model}`;
}

function vehicleMeta(vehicle: Vehicle) {
  return `${vehicle.year} · ${vehicle.plate}`;
}

function formatMoney(value: number) {
  return `GHS ${value.toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" }).format(new Date(value)).toUpperCase();
}

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

function useAsyncData<T>(load: () => Promise<T>, initial: T, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: true, error: null });
  const run = useCallback(load, deps);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    run()
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error: unknown) => { if (active) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Something went wrong." })); });
    return () => { active = false; };
  }, [run]);
  return state;
}

export type DriverFeatureStart = "hub" | "explore" | "booking" | "vehicles" | "tow" | "parts" | "chat";
type Page =
  | DriverFeatureStart
  | "profile"
  | "booking-confirmed"
  | "history"
  | "history-detail"
  | "reminders"
  | "tow-estimate"
  | "tow-tracking"
  | "tow-receipt"
  | "product"
  | "cart"
  | "checkout"
  | "order"
  | "thread";

function SButton({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <button className={`s2-button s2-button--${variant}`} disabled={disabled} onClick={onClick} type="button">
      {Icon && <Icon size={18} strokeWidth={1.75} />}
      <span>{children}</span>
    </button>
  );
}

function Header({
  title,
  eyebrow,
  onBack,
  action,
}: {
  title: string;
  eyebrow?: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
  return (
    <header className="s2-header">
      <button aria-label="Go back" onClick={onBack} type="button"><ArrowLeft size={20} /></button>
      <div>{eyebrow && <span>{eyebrow}</span>}<strong>{title}</strong></div>
      {action || <i />}
    </header>
  );
}

function ModuleHub({ go, onExit }: { go: (page: Page) => void; onExit: () => void }) {
  const modules = [
    { page: "explore" as Page, icon: MapPin, label: "Explore nearby", copy: "Map, filters & verified providers", tone: "blue" },
    { page: "booking" as Page, icon: CalendarDays, label: "Book a service", copy: "Choose service, date & time", tone: "violet" },
    { page: "tow" as Page, icon: Truck, label: "Request a tow", copy: "Upfront estimate & live tracking", tone: "amber" },
    { page: "parts" as Page, icon: ShoppingBag, label: "Parts marketplace", copy: "Compatible parts from local vendors", tone: "green" },
    { page: "vehicles" as Page, icon: Car, label: "My vehicles", copy: "History, reminders & documents", tone: "steel" },
    { page: "chat" as Page, icon: MessageCircle, label: "Messages", copy: "Chat with providers and vendors", tone: "blue" },
  ];
  return (
    <div className="s2-screen s2-hub">
      <Header onBack={onExit} eyebrow="DRIVER SERVICES" title="Services" />
      <main>
        <span className="s2-kicker">BUILT FOR THE ROAD AHEAD</span>
        <h1>What can we help with?</h1>
        <p>Find trusted help, maintain your vehicle, or shop verified parts.</p>
        <div className="s2-module-grid">
          {modules.map(({ page, icon: Icon, label, copy, tone }) => (
            <button key={page} onClick={() => go(page)} type="button">
              <span className={`s2-module-icon s2-tone-${tone}`}><Icon size={22} /></span>
              <strong>{label}</strong><small>{copy}</small><ArrowRight size={16} />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function Explore({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [sheet, setSheet] = useState(true);
  const [filters, setFilters] = useState(false);
  const [savedProvider, setSavedProvider] = useState(false);
  const [activeFilters, setActiveFilters] = useState(["Open now", "Verified"]);

  const toggleFilter = (item: string) => {
    setActiveFilters((current) =>
      current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item],
    );
  };

  return (
    <div className="s2-screen s2-explore">
      <div className="s2-map">
        <span className="map-grid" />
        <div className="s2-map-top">
          <button aria-label="Back" onClick={back} type="button"><ArrowLeft size={20} /></button>
          <label><Search size={18} /><input aria-label="Search nearby providers" placeholder="Mechanics near me" /></label>
          <button aria-label="Map settings" onClick={() => setFilters(true)} type="button"><Settings2 size={19} /></button>
        </div>
        <div className="s2-filter-row">
          {["Open now", "Verified", "Within 5 km"].map((item) => (
            <button
              className={activeFilters.includes(item) ? "active" : ""}
              key={item}
              onClick={() => toggleFilter(item)}
              type="button"
            >
              {item}
              {activeFilters.includes(item) && <X size={12} />}
            </button>
          ))}
          <button onClick={() => setFilters(true)} type="button"><SlidersHorizontal size={14} /> Filters</button>
        </div>
        <span className="s2-road s2-road-a" /><span className="s2-road s2-road-b" /><span className="s2-road s2-road-c" />
        {[
          ["mechanic", "24%", "36%", Wrench],
          ["tow", "68%", "28%", Truck],
          ["shop", "74%", "62%", Store],
          ["mechanic", "30%", "68%", Wrench],
        ].map(([kind, left, top, Icon], i) => {
          const MarkerIcon = Icon as LucideIcon;
          return <button aria-label={`${kind} provider marker`} className={`s2-marker s2-marker--${kind}`} key={i} onClick={() => setSheet(true)} style={{ left: left as string, top: top as string }} type="button"><MarkerIcon size={15} /></button>;
        })}
        <span className="s2-user-marker"><Navigation size={15} fill="currentColor" /></span>
        <button className="s2-recenter" onClick={() => setSheet(true)} type="button"><Navigation size={18} /></button>
      </div>
      {sheet && (
        <section className="s2-provider-sheet">
          <button aria-label="Collapse provider details" className="s2-sheet-handle" onClick={() => setSheet(false)} type="button" />
          <div className="s2-provider-photo"><img alt="Mechanic working in a vehicle workshop" src={mechanicPhoto} /><span>OPEN UNTIL 6:00 PM</span><button aria-label="Save provider" className={savedProvider ? "saved" : ""} onClick={() => setSavedProvider((value) => !value)} type="button"><Heart size={18} fill={savedProvider ? "currentColor" : "none"} /></button></div>
          <div className="s2-provider-title"><div><span className="s2-verified"><BadgeCheck size={14} fill="currentColor" /> VERIFIED</span><h1>Kojo AutoCare</h1><p><Star size={14} fill="currentColor" /> 4.9 <span>312 reviews</span> · Osu</p></div><strong>2.4<span>km</span></strong></div>
          <div className="s2-service-chips"><span>Diagnostics</span><span>Electrical</span><span>Brakes</span><span>+4</span></div>
          <div className="s2-price-line"><span>Services from <strong>GHS 120</strong></span><span><Clock3 size={14} /> Next slot 2:30 PM</span></div>
          <div className="s2-sheet-actions">
            <SButton onClick={() => go("profile")}>View profile</SButton>
            <button aria-label="Chat with Kojo AutoCare" onClick={() => go("thread")} type="button"><MessageCircle size={19} /></button>
            <button aria-label="Call Kojo AutoCare" onClick={() => window.location.href = "tel:+233241234567"} type="button"><Phone size={19} /></button>
            <button aria-label="Get directions" onClick={() => window.open("https://maps.google.com/?q=Kojo+AutoCare+Osu+Accra", "_blank", "noopener,noreferrer")} type="button"><Navigation size={19} /></button>
          </div>
        </section>
      )}
      {filters && <FilterSheet close={() => setFilters(false)} />}
    </div>
  );
}

function FilterSheet({ close }: { close: () => void }) {
  const [selectedType, setSelectedType] = useState("Mechanic");
  const [openNow, setOpenNow] = useState(true);

  return (
    <div className="s2-overlay" role="dialog" aria-modal="true" aria-label="Filter providers">
      <button aria-label="Close filters" className="s2-scrim" onClick={close} type="button" />
      <section className="s2-filter-sheet">
        <div className="s2-sheet-header"><span /><strong>Filter providers</strong><button onClick={close} type="button"><X size={20} /></button></div>
        <div className="s2-filter-group"><label>Provider type</label><div>{["Mechanic", "Tow operator", "Service centre", "Parts vendor"].map((x) => <button className={selectedType === x ? "selected" : ""} key={x} onClick={() => setSelectedType(x)} type="button">{x}{selectedType === x && <Check size={13} />}</button>)}</div></div>
        <div className="s2-filter-group"><label>Distance</label><input aria-label="Maximum distance" max="25" min="1" type="range" defaultValue="5" /><div className="s2-range-label"><span>1 km</span><strong>Within 5 km</strong><span>25 km</span></div></div>
        <div className="s2-filter-group"><label>Availability</label><div><button className={openNow ? "selected" : ""} onClick={() => setOpenNow((value) => !value)} type="button">Open now {openNow && <Check size={13} />}</button><button onClick={() => setOpenNow(false)} type="button">Available today</button></div></div>
        <div className="s2-filter-actions"><button onClick={() => { setSelectedType("Mechanic"); setOpenNow(true); }} type="button">Clear all</button><SButton onClick={close}>Show 18 providers</SButton></div>
      </section>
    </div>
  );
}

function Profile({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [tab, setTab] = useState("Overview");
  return (
    <div className="s2-screen s2-profile">
      <Header action={<button aria-label="Share profile" type="button" disabled><Share2 size={19} /></button>} onBack={back} title="Provider profile" />
      <div className="s2-profile-hero">
        <img alt="Kojo AutoCare workshop mechanic" src={mechanicPhoto} />
        <div className="s2-profile-avatar">KA</div>
      </div>
      <main>
        <div className="s2-profile-heading"><span className="s2-verified"><BadgeCheck size={14} fill="currentColor" /> VERIFIED PROVIDER</span><h1>Kojo AutoCare</h1><p>Mobile mechanic · Osu, Accra</p><div><span><Star size={14} fill="currentColor" /> 4.9 (312)</span><span><MapPin size={14} /> 2.4 km</span><span className="open">Open</span></div></div>
        <div className="s2-profile-actions"><SButton onClick={() => go("booking")}>Book service</SButton><button type="button" onClick={() => go("thread")}><MessageCircle size={19} /><span>Chat</span></button><button type="button" onClick={() => window.location.href = "tel:+233241234567"}><Phone size={19} /><span>Call</span></button></div>
        <div className="s2-tabs">{["Overview", "Services", "Reviews", "Portfolio"].map((x) => <button className={tab === x ? "active" : ""} key={x} onClick={() => setTab(x)} type="button">{x}</button>)}</div>
        {tab === "Overview" ? (
          <>
            <section className="s2-about"><h2>Reliable care, wherever you are</h2><p>Mobile diagnostics and repairs for Toyota, Honda, Nissan and Hyundai vehicles across central Accra.</p><div><span><ShieldCheck size={16} /> Identity checked</span><span><ShieldCheck size={16} /> Business registered</span><span><ShieldCheck size={16} /> Location verified</span></div></section>
            <section className="s2-services-preview"><div className="s2-section-title"><h2>Popular services</h2><button onClick={() => setTab("Services")} type="button">See all</button></div>{[["Vehicle diagnostics", "From GHS 120", "30–45 min"], ["Brake inspection", "From GHS 90", "30 min"], ["Battery replacement", "From GHS 760", "45 min"]].map((x) => <button key={x[0]} onClick={() => go("booking")} type="button"><span><strong>{x[0]}</strong><small>{x[2]}</small></span><span>{x[1]} <ChevronRight size={15} /></span></button>)}</section>
            <section className="s2-availability"><div><CalendarDays size={19} /><span><strong>Next available today</strong><small>2:30 PM, 3:30 PM, 5:00 PM</small></span></div><button onClick={() => go("booking")} type="button">View times</button></section>
          </>
        ) : (
          <section className="s2-tab-placeholder"><span>{tab === "Reviews" ? "4.9" : tab === "Services" ? "12" : "24"}</span><h2>{tab}</h2><p>{tab === "Reviews" ? "Customers consistently praise clear pricing and fast arrivals." : tab === "Services" ? "Diagnostics, electrical, brakes, batteries and routine maintenance." : "Recent repairs and workshop highlights from Kojo AutoCare."}</p></section>
        )}
        <button className="s2-emergency-link" onClick={() => go("tow")} type="button"><LifeBuoy size={18} /><span><strong>Need urgent help?</strong><small>Request emergency assistance instead</small></span><ArrowRight size={17} /></button>
      </main>
    </div>
  );
}

function Booking({ vehicle, go, back }: { vehicle: Vehicle | null; go: (page: Page) => void; back: () => void }) {
  const [step, setStep] = useState(1);
  const [service, setService] = useState("Vehicle diagnostics");
  const [slot, setSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titles = ["Choose a service", "Choose your vehicle", "Pick a date & time", "Add details", "Review booking"];

  const confirm = async () => {
    if (!vehicle) {
      setError("Add a vehicle before booking a service.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await bookingService.create({
        vehicleId: vehicle.id,
        service,
        problem: [service, notes.trim()].filter(Boolean).join(" — "),
      });
      go("booking-confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the booking.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="s2-screen">
      <Header eyebrow={`STEP ${step} OF 5`} onBack={() => step === 1 ? back() : setStep(step - 1)} title={titles[step - 1]} />
      <div className="s2-progress"><span style={{ width: `${step * 20}%` }} /></div>
      <main className="s2-booking">
        {step === 1 && <div className="s2-choice-list">{[["Vehicle diagnostics", "Find the cause of a warning or issue", "GHS 120"], ["Brake inspection", "Full braking system safety check", "GHS 90"], ["Routine service", "Oil, filters and 20-point inspection", "GHS 450"], ["Battery service", "Test, charge or replacement", "GHS 80"]].map(([name, copy, price]) => <button className={service === name ? "selected" : ""} key={name} onClick={() => setService(name)} type="button"><span className="s2-choice-icon"><Wrench size={19} /></span><span><strong>{name}</strong><small>{copy}</small></span><span><strong>From {price}</strong><i>{service === name && <Check size={13} />}</i></span></button>)}</div>}
        {step === 2 && <div className="s2-vehicle-choice"><span className="s2-kicker">SELECT A VEHICLE</span>{vehicle ? <button className="selected" type="button" disabled><span className="s2-car-visual"><Car size={40} /></span><span><strong>{vehicleLabel(vehicle)}</strong><small>{vehicleMeta(vehicle)}</small>{vehicle.primary && <em>PRIMARY</em>}</span><i><Check size={14} /></i></button> : <p className="s2-page-copy">No vehicle on file. Add a vehicle from My vehicles before booking.</p>}<button onClick={() => go("vehicles")} type="button"><Plus size={18} /> Manage vehicles</button></div>}
        {step === 3 && <div className="s2-date-time"><span className="s2-kicker">{bookingMonth} · GMT</span><div className="s2-date-row">{[["FRI", "17"], ["SAT", "18"], ["SUN", "19"], ["MON", "20"], ["TUE", "21"]].map(([day, date], i) => <button className={i === 1 ? "selected" : i === 2 ? "disabled" : ""} disabled={i === 2} key={date} type="button"><span>{day}</span><strong>{date}</strong>{i === 2 && <small>Closed</small>}</button>)}</div><h2>Available times</h2><div className="s2-time-grid">{["9:00 AM", "10:30 AM", "12:00 PM", "2:30 PM", "3:30 PM", "5:00 PM"].map((time, i) => <button className={slot === time ? "selected" : i === 1 ? "booked" : ""} disabled={i === 1} key={time} onClick={() => setSlot(time)} type="button">{time}{i === 1 && <small>Booked</small>}</button>)}</div><div className="s2-timezone"><Clock3 size={15} /> Times shown in Africa/Accra (GMT)</div></div>}
        {step === 4 && <div className="s2-notes"><label htmlFor="booking-notes">Describe what you've noticed</label><textarea id="booking-notes" onChange={(e) => setNotes(e.target.value)} placeholder="For example: The warning light came on yesterday and the car feels slow to start." value={notes} /><button type="button" disabled><Camera size={20} /><span><strong>Add photos</strong><small>Help the mechanic prepare before your visit</small></span><Plus size={18} /></button><div className="s2-calm-note"><ShieldCheck size={17} /><span>Your notes and photos are only shared with Kojo AutoCare.</span></div></div>}
        {step === 5 && <div className="s2-review"><section><div className="s2-provider-avatar">MN</div><span><strong>Matched on confirmation</strong><small><BadgeCheck size={12} fill="currentColor" /> Verified provider</small></span></section><dl><div><dt>Service</dt><dd>{service}</dd></div><div><dt>Vehicle</dt><dd>{vehicle ? `${vehicleLabel(vehicle)} · ${vehicle.year}` : "No vehicle selected"}</dd></div><div><dt>Date</dt><dd>Saturday, 18 October</dd></div><div><dt>Time</dt><dd>{slot || "2:30 PM"} GMT</dd></div><div><dt>Estimated total</dt><dd>From GHS 120</dd></div></dl><div className="s2-policy"><FileText size={17} /><span><strong>Free cancellation until 12:30 PM</strong><small>Late cancellations may incur a GHS 30 fee.</small></span></div></div>}
      </main>
      <div className="s2-sticky">
        {error && <p role="alert">{error}</p>}
        <SButton disabled={(step === 3 && !slot) || submitting} onClick={() => (step === 5 ? void confirm() : setStep(step + 1))}>{step === 5 ? (submitting ? "Creating…" : "Confirm booking") : "Continue"}</SButton>
      </div>
    </div>
  );
}

function BookingConfirmed({ go }: { go: (page: Page) => void }) {
  return (
    <div className="s2-screen s2-success">
      <main><div><Check size={31} /></div><span className="s2-kicker">BOOKING CONFIRMED</span><h1>You're booked for Saturday.</h1><p>Kojo AutoCare will expect your Toyota Corolla at 2:30 PM.</p><section><CalendarDays size={20} /><span><strong>18 October · 2:30 PM</strong><small>Kojo AutoCare, Osu · Africa/Accra (GMT)</small></span></section><SButton onClick={() => go("hub")}>Done</SButton><SButton variant="ghost">Add to calendar</SButton></main>
    </div>
  );
}

function Vehicles({ vehicle, go, back, onChanged }: { vehicle: Vehicle | null; go: (page: Page) => void; back: () => void; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", year: String(today.getFullYear()), plate: "", mileageKm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.make.trim() || !form.model.trim() || !form.plate.trim()) {
      setError("Make, model and plate are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await vehicleService.create({ make: form.make.trim(), model: form.model.trim(), year: Number(form.year) || today.getFullYear(), plate: form.plate.trim().toUpperCase(), mileageKm: Number(form.mileageKm) || 0, primary: !vehicle });
      setAdding(false);
      setForm({ make: "", model: "", year: String(today.getFullYear()), plate: "", mileageKm: "" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save vehicle.");
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="s2-screen">
        <Header onBack={() => setAdding(false)} title="Add a vehicle" />
        <main className="s2-notes">
          <form onSubmit={submit}>
            <label htmlFor="v-make">Make</label>
            <input id="v-make" onChange={(e) => setForm({ ...form, make: e.target.value })} placeholder="Toyota" value={form.make} />
            <label htmlFor="v-model">Model</label>
            <input id="v-model" onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Corolla" value={form.model} />
            <label htmlFor="v-year">Year</label>
            <input id="v-year" onChange={(e) => setForm({ ...form, year: e.target.value })} type="number" value={form.year} />
            <label htmlFor="v-plate">Plate</label>
            <input id="v-plate" onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="GR 8241-22" value={form.plate} />
            <label htmlFor="v-mileage">Mileage (km)</label>
            <input id="v-mileage" onChange={(e) => setForm({ ...form, mileageKm: e.target.value })} placeholder="42000" type="number" value={form.mileageKm} />
            {error && <p role="alert">{error}</p>}
            <button className="s2-button s2-button--primary" disabled={saving} type="submit"><span>{saving ? "Saving…" : "Save vehicle"}</span></button>
          </form>
        </main>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="s2-screen">
        <Header action={<button aria-label="Add vehicle" onClick={() => setAdding(true)} type="button"><Plus size={20} /></button>} onBack={back} title="My vehicles" />
        <main className="s2-vehicles">
          <section className="s2-tab-placeholder"><Car size={40} /><h2>No vehicles yet</h2><p>Add your vehicle to book services, view history and get maintenance reminders.</p><button className="s2-button s2-button--primary" onClick={() => setAdding(true)} type="button"><span><Plus size={18} /> Add a vehicle</span></button></section>
        </main>
      </div>
    );
  }

  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Add vehicle" onClick={() => setAdding(true)} type="button"><Plus size={20} /></button>} onBack={back} title="My vehicles" />
      <main className="s2-vehicles">
        <section className="s2-vehicle-hero"><div className="s2-vehicle-top"><span>{vehicle.primary ? "PRIMARY VEHICLE" : "VEHICLE"}</span><button type="button" onClick={() => setAdding(true)}>Add</button></div><div className="s2-car-display"><Car size={72} strokeWidth={1.2} /><span /></div><h1>{vehicleLabel(vehicle)}</h1><p>{vehicleMeta(vehicle)}</p><div className="s2-health-row"><span><CheckCircle2 size={16} /> Vehicle health</span><strong>Registered</strong></div></section>
        <div className="s2-mileage"><Gauge size={20} /><span><small>CURRENT MILEAGE</small><strong>{vehicle.mileageKm.toLocaleString("en-GH")} km</strong></span><button type="button" onClick={() => go("reminders")}>View</button></div>
        <div className="s2-vehicle-metrics"><button onClick={() => go("reminders")} type="button"><span className="s2-tone-amber"><Clock3 size={19} /></span><strong>Reminders</strong><small>Maintenance schedule</small><ArrowRight size={15} /></button><button onClick={() => go("history")} type="button"><span className="s2-tone-blue"><History size={19} /></span><strong>Service records</strong><small>Completed jobs</small><ArrowRight size={15} /></button></div>
        <section className="s2-documents"><div className="s2-section-title"><h2>Documents & renewals</h2><button type="button" onClick={() => go("history")}>View all</button></div><button type="button" onClick={() => go("history-detail")}><span className="s2-tone-green"><ShieldCheck size={18} /></span><span><strong>Insurance</strong><small>Add or update your policy</small></span><em>ACTIVE</em></button><button type="button" onClick={() => go("history-detail")}><span className="s2-tone-amber"><FileText size={18} /></span><span><strong>Roadworthy certificate</strong><small>Renews in 41 days</small></span><em className="due">DUE SOON</em></button></section>
        <button className="s2-add-vehicle" onClick={() => setAdding(true)} type="button"><Plus size={18} /> Add another vehicle</button>
      </main>
    </div>
  );
}

function HistoryList({ items, loading, go, back }: { items: ServiceHistoryItem[]; loading: boolean; go: (page: Page) => void; back: () => void }) {
  const total = items.reduce((sum, item) => sum + (item.payment?.amountGhs ?? item.approvedEstimate?.totalGhs ?? 0), 0);
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Service history" />
      <main className="s2-history">
        <div className="s2-history-summary"><span><strong>{items.length}</strong><small>SERVICE RECORDS</small></span><span><strong>{formatMoney(total)}</strong><small>TOTAL MAINTENANCE</small></span></div>
        <div className="s2-year"><span>{historyYear}</span><i /></div>
        {loading && <p className="s2-history-empty">Loading service records…</p>}
        {!loading && items.length === 0 && <p className="s2-history-empty">No completed services yet. Provider records appear here after a job is closed.</p>}
        {!loading && items.map((item) => {
          const price = item.payment?.amountGhs ?? item.approvedEstimate?.totalGhs ?? 0;
          return (
            <button key={item.request.id} onClick={() => go("history-detail")} type="button">
              <span className="s2-history-date">{formatDay(item.request.completedAt ?? item.request.updatedAt)}</span>
              <span><strong>{item.request.problem}</strong><small>{item.request.provider?.businessName ?? "Assigned provider"}</small><em><ShieldCheck size={11} /> Provider-added, locked</em></span>
              <span><strong>{price ? formatMoney(price) : "—"}</strong><small>{item.request.ref}</small><ChevronRight size={15} /></span>
            </button>
          );
        })}
      </main>
    </div>
  );
}

function HistoryDetail({ back }: { back: () => void }) {
  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Download invoice" onClick={() => window.open("https://example.com/invoice.pdf", "_blank", "noopener,noreferrer")} type="button"><FileText size={19} /></button>} onBack={back} title="Service record" />
      <main className="s2-record">
        <span className="s2-locked"><ShieldCheck size={13} /> PROVIDER-ADDED · LOCKED</span><h1>Routine service</h1><p>{historyDate} · 42,180 km</p>
        <section><h2>Work completed</h2>{["Engine oil and filter replaced", "20-point vehicle inspection", "Tyre pressure adjusted", "Brake fluid checked"].map((x) => <div key={x}><Check size={14} /> {x}</div>)}</section>
        <section><h2>Cost breakdown</h2><dl><div><dt>Parts</dt><dd>GHS 310</dd></div><div><dt>Labour</dt><dd>GHS 140</dd></div><div><dt>Total paid</dt><dd>GHS 450</dd></div></dl></section>
        <section className="s2-record-provider"><div className="s2-provider-avatar">KA</div><span><strong>Kojo AutoCare</strong><small>Osu, Accra · +233 24 123 4567</small></span><button onClick={() => window.location.href = "tel:+233241234567"} type="button"><Phone size={18} /></button></section>
        <button className="s2-invoice" onClick={() => window.open("https://example.com/invoice.pdf", "_blank", "noopener,noreferrer")} type="button"><FileText size={19} /><span><strong>Invoice #MN-250812-0842</strong><small>PDF · 184 KB</small></span><ArrowRight size={16} /></button>
      </main>
    </div>
  );
}

function Reminders({ back }: { back: () => void }) {
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Maintenance reminders" />
      <main className="s2-reminders">
        <div className="s2-reminder-hero"><Gauge size={24} /><span><small>CURRENT MILEAGE</small><strong>42,180 km</strong></span></div>
        {[["Oil & filter change", "Due in 1,820 km", "44,000 km", "Suggested interval", "blue"], ["Roadworthy renewal", "Due in 41 days", roadworthyDate, "Official expiry", "amber"], ["Tyre rotation", "Due in 4,320 km", "46,500 km", "Suggested interval", "steel"]].map(([name, due, target, source, tone]) => <article key={name}><span className={`s2-tone-${tone}`}><Clock3 size={20} /></span><div><strong>{name}</strong><p>{due}</p><small>{source} · {target}</small></div><button aria-label={`More options for ${name}`} type="button" disabled><Settings2 size={17} /></button></article>)}
        <div className="s2-suggested-note"><ShieldCheck size={17} /><span><strong>About suggested intervals</strong><small>These are general guidance unless marked as manufacturer-sourced. Check your owner's manual for exact requirements.</small></span></div>
      </main>
    </div>
  );
}

function Tow({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [step, setStep] = useState(1);
  const [towType, setTowType] = useState("Flatbed");
  return (
    <div className="s2-screen">
      <Header eyebrow={`STEP ${step} OF 4`} onBack={() => step === 1 ? back() : setStep(step - 1)} title={["Vehicle", "Pickup & destination", "Tow type", "Review request"][step - 1]} />
      <div className="s2-progress"><span style={{ width: `${step * 25}%` }} /></div>
      <main className="s2-tow">
        {step === 1 && <><div className="s2-tow-visual"><img alt="Tow vehicle on a city road at night" src={towPhoto} /><span><Truck size={25} /> TOW ASSISTANCE</span></div><h1>Which vehicle needs a tow?</h1><button className="s2-tow-vehicle selected" type="button" disabled><Car size={38} /><span><strong>Toyota Corolla</strong><small>{vehicleSummary}</small></span><i><Check size={14} /></i></button></>}
        {step === 2 && <><h1>Where are we going?</h1><div className="s2-route-inputs"><label><span className="pickup-dot" /> Pickup<input aria-label="Pickup location" defaultValue="Oxford Street, Osu" /></label><i /><label><MapPin size={16} /> Destination<input aria-label="Tow destination" defaultValue="Toyota Ghana, Ringway" /></label></div><div className="s2-mini-map"><span className="map-grid" /><span className="s2-route-draw" /><span className="pickup-dot" /><MapPin size={22} /></div></>}
        {step === 3 && <><h1>Choose a tow type</h1><p className="s2-page-copy">Not sure? Flatbed is the safest option for most vehicles.</p><div className="s2-tow-types">{[["Flatbed", "Safest · All wheels off the road", "RECOMMENDED"], ["Wheel-lift", "For short distances and clear access", ""], ["Standard", "For older vehicles without drivetrain risk", ""]].map(([name, copy, badge]) => <button className={towType === name ? "selected" : ""} key={name} onClick={() => setTowType(name)} type="button"><span><Truck size={23} /></span><span><strong>{name}</strong><small>{copy}</small>{badge && <em>{badge}</em>}</span><i>{towType === name && <Check size={13} />}</i></button>)}</div></>}
        {step === 4 && <div className="s2-tow-review"><div className="s2-tow-route"><span><i className="pickup-dot" /><strong>Oxford Street, Osu</strong><small>Pickup</small></span><hr /><span><MapPin size={17} /><strong>Toyota Ghana, Ringway</strong><small>Destination · 6.8 km</small></span></div><dl><div><dt>Vehicle</dt><dd>Toyota Corolla</dd></div><div><dt>Tow type</dt><dd>{towType}</dd></div></dl><div className="s2-estimate-card"><span><small>ESTIMATED PRICE</small><strong>GHS 280–340</strong></span><span><small>ARRIVAL</small><strong>12–18 min</strong></span></div><p><ShieldCheck size={16} /> Final price is confirmed before dispatch.</p></div>}
      </main>
      <div className="s2-sticky"><SButton onClick={() => step === 4 ? go("tow-estimate") : setStep(step + 1)}>{step === 4 ? "See final estimate" : "Continue"}</SButton></div>
    </div>
  );
}

function TowEstimate({ vehicle, go, back }: { vehicle: Vehicle | null; go: (page: Page) => void; back: () => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = async () => {
    if (!vehicle) {
      setError("Add a vehicle before requesting a tow.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await towService.request({ vehicleId: vehicle.id, problem: "Vehicle breakdown — tow requested", location: { label: "Oxford Street, Osu" } });
      go("tow-tracking");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not request a tow.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="s2-screen">
      <Header onBack={back} title="Tow estimate" />
      <main className="s2-tow-estimate"><span className="s2-kicker">UPFRONT PRICE</span><h1>GHS 320</h1><p>Includes dispatch, loading and 6.8 km transport.</p><section><div><Truck size={20} /><span><small>ARRIVAL</small><strong>12–18 minutes</strong></span></div><div><Navigation size={20} /><span><small>DISTANCE</small><strong>6.8 km</strong></span></div><div><Car size={20} /><span><small>TOW TYPE</small><strong>Flatbed</strong></span></div></section><div className="s2-price-breakdown"><h2>Price details</h2><div><span>Base dispatch</span><strong>GHS 180</strong></div><div><span>Distance · 6.8 km</span><strong>GHS 140</strong></div><div><span>Total</span><strong>GHS 320</strong></div></div><div className="s2-calm-note"><ShieldCheck size={17} /><span>This price won't change unless your route or vehicle details change.</span></div></main>
      <div className="s2-sticky">{error && <p role="alert">{error}</p>}<SButton disabled={submitting} onClick={() => void request()}>{submitting ? "Requesting…" : "Confirm & request tow"}</SButton><p>No charge until an operator accepts.</p></div>
    </div>
  );
}

function TowTracking({ go }: { go: (page: Page) => void }) {
  const [status, setStatus] = useState(0);
  const statuses = ["En route", "Arrived", "Vehicle loaded", "Driving", "Destination reached"];
  return (
    <div className="s2-screen s2-tow-tracking">
      <div className="s2-tow-map"><span className="map-grid" /><span className="s2-route-draw" /><span className="s2-tow-truck"><Truck size={18} /></span><span className="s2-tow-destination"><MapPin size={18} /></span><div className="s2-live-label"><span /> LIVE TOW TRACKING</div></div>
      <main><span className="s2-kicker">{statuses[status].toUpperCase()}</span><div className="s2-tow-status"><div><h1>{status < 2 ? "Kofi is on the way" : status === 2 ? "Your vehicle is secure" : "Heading to Ringway"}</h1><p>{status < 2 ? "Arriving in 12 minutes" : "Toyota Corolla · GR 8241-22"}</p></div><strong>{status < 2 ? "12" : "6.8"}<small>{status < 2 ? "MIN" : "KM"}</small></strong></div><div className="s2-operator"><div className="s2-provider-avatar">KM</div><span><strong>Kofi Mensah</strong><small>RoadLift Ghana · GW 2241-23</small></span><button type="button" disabled><MessageCircle size={18} /></button><button type="button" disabled><Phone size={18} /></button></div><div className="s2-tow-timeline">{statuses.concat("Completed").map((x, i) => <div className={i < status ? "done" : i === status ? "active" : ""} key={x}><i>{i < status && <Check size={11} />}</i><span>{x}</span></div>)}</div><button className="s2-demo-next" onClick={() => status === 4 ? go("tow-receipt") : setStatus(status + 1)} type="button">{status === 4 ? "Complete tow" : `Mark ${statuses[status + 1]}`} <ArrowRight size={15} /></button></main>
    </div>
  );
}

function TowReceipt({ go }: { go: (page: Page) => void }) {
  return (
    <div className="s2-screen s2-success"><main><div><Check size={31} /></div><span className="s2-kicker">TOW COMPLETED</span><h1>Your vehicle arrived safely.</h1><p>Toyota Corolla was delivered to Toyota Ghana, Ringway.</p><section><FileText size={20} /><span><strong>GHS 320 paid with MoMo</strong><small>Receipt #MN-TOW-10528</small></span></section><SButton onClick={() => go("hub")}>Done</SButton></main></div>
  );
}

const products = [
  { name: "Brembo front brake pads", fit: `Toyota Corolla ${vehicleYear - 1}–${vehicleYear + 2}`, price: "GHS 680", image: partsPhoto, compatible: true },
  { name: "Continental EcoContact 6", fit: "205/55 R16 · Single tyre", price: "GHS 1,150", image: tirePhoto, compatible: true },
];

function Marketplace({ go, back }: { go: (page: Page) => void; back: () => void }) {
  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Shopping cart" onClick={() => go("cart")} type="button"><ShoppingCart size={19} /><span className="s2-cart-count">1</span></button>} onBack={back} title="Parts" />
      <main className="s2-market">
        <label className="s2-market-search"><Search size={18} /><input aria-label="Search parts" placeholder="Search parts, brands or vehicles" /><Camera size={18} /></label>
        <div className="s2-market-vehicle"><Car size={19} /><span><small>SHOPPING FOR</small><strong>{vehicleYear} Toyota Corolla</strong></span><button type="button" disabled>Change</button></div>
        <div className="s2-categories">{[["Brakes", LifeBuoy], ["Tyres", Car], ["Battery", Zap], ["Engine", Settings2], ["Fluids", Package]].map(([x, Icon]) => { const I = Icon as LucideIcon; return <button key={x as string} type="button" disabled><span><I size={20} /></span>{x as string}</button>; })}</div>
        <section className="s2-market-banner"><span className="s2-kicker">VEHICLE-SMART SHOPPING</span><h1>Parts that fit.<br />Confidence that lasts.</h1><p>We check compatibility against your primary vehicle.</p><ShieldCheck size={42} /></section>
        <div className="s2-section-title"><h2>Recommended for your Corolla</h2><button type="button" disabled><Filter size={15} /> Filter</button></div>
        <div className="s2-product-grid">{products.map((product, i) => <button key={product.name} onClick={() => go("product")} type="button"><div><img alt={product.name} src={product.image} /><span><Check size={11} /> FITS YOUR CAR</span><i><Heart size={16} /></i></div><small>{i === 0 ? "BREMBO" : "CONTINENTAL"}</small><strong>{product.name}</strong><p>{product.fit}</p><b>{product.price}</b></button>)}</div>
      </main>
    </div>
  );
}

function Product({ go, back }: { go: (page: Page) => void; back: () => void }) {
  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Share product" type="button" disabled><Share2 size={19} /></button>} onBack={back} title="Product details" />
      <main className="s2-product"><div className="s2-product-image"><img alt="Brembo brake component" src={partsPhoto} /><button type="button" disabled><Heart size={19} /></button><span>1 / 4</span></div><span className="s2-kicker">BREMBO</span><h1>Front brake pad set</h1><p>P 83 159 · Ceramic compound</p><div className="s2-rating"><Star size={15} fill="currentColor" /> 4.8 <span>42 reviews</span></div><strong className="s2-product-price">GHS 680</strong><div className="s2-compatible"><CheckCircle2 size={21} /><span><strong>Compatible with your vehicle</strong><small>{vehicleYear} Toyota Corolla 1.8L · Front axle</small></span></div><section className="s2-vendor-card"><div className="s2-provider-avatar">AP</div><span><strong>Accra Parts Hub</strong><small><BadgeCheck size={12} fill="currentColor" /> Verified vendor · Tema</small></span><ChevronRight size={17} /></section><section className="s2-delivery"><div><Truck size={18} /><span><strong>Delivery tomorrow</strong><small>GHS 25 · Order within 2h 14m</small></span></div><div><Store size={18} /><span><strong>Pickup today</strong><small>Community 12, Tema · Free</small></span></div></section><button className="s2-compatibility-warning" type="button" disabled><ShieldCheck size={17} /><span><strong>How compatibility is checked</strong><small>Using your vehicle year, model, trim and engine.</small></span><ArrowRight size={16} /></button></main>
      <div className="s2-sticky s2-cart-action"><div><button type="button" disabled><Minus size={16} /></button><strong>1</strong><button type="button" disabled><Plus size={16} /></button></div><SButton onClick={() => go("cart")} icon={ShoppingCart}>Add to cart</SButton></div>
    </div>
  );
}

function Cart({ go, back }: { go: (page: Page) => void; back: () => void }) {
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Your cart" />
      <main className="s2-cart"><div className="s2-cart-vendor"><div><Store size={17} /><span><strong>Accra Parts Hub</strong><small>Verified vendor · Tema</small></span></div><article><img alt="Brembo brake component" src={partsPhoto} /><span><strong>Front brake pad set</strong><small>Brembo · P 83 159</small><em><Check size={11} /> Compatible</em></span><div><strong>GHS 680</strong><span><button type="button" disabled><Minus size={13} /></button>1<button type="button" disabled><Plus size={13} /></button></span></div></article><div className="s2-vendor-subtotal"><span>Vendor subtotal</span><strong>GHS 680</strong></div></div><div className="s2-cart-vendor"><div><Store size={17} /><span><strong>MotorCare Direct</strong><small>Verified vendor · Accra</small></span></div><article className="s2-cart-warning"><div className="s2-placeholder-part"><Package size={26} /></div><span><strong>Cabin air filter</strong><small>Universal listing</small><em><ShieldCheck size={11} /> Compatibility not confirmed</em></span><div><strong>GHS 95</strong><span><button type="button" disabled><Minus size={13} /></button>1<button type="button" disabled><Plus size={13} /></button></span></div></article><div className="s2-vendor-subtotal"><span>Vendor subtotal</span><strong>GHS 95</strong></div></div><section className="s2-cart-summary"><div><span>Items</span><strong>GHS 775</strong></div><div><span>Delivery</span><strong>GHS 40</strong></div><div><span>Total</span><strong>GHS 815</strong></div></section></main>
      <div className="s2-sticky"><SButton onClick={() => go("checkout")}>Checkout · GHS 815</SButton></div>
    </div>
  );
}

function Checkout({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [method, setMethod] = useState("MoMo");
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Checkout" />
      <main className="s2-checkout"><section><div className="s2-section-title"><h2>Delivery address</h2><button type="button" disabled>Change</button></div><div className="s2-address"><MapPin size={18} /><span><strong>Home</strong><small>14 Nii Nortei Nyanchi Street, Airport Residential, Accra</small></span></div></section><section><h2>Delivery</h2><label><input defaultChecked name="delivery" type="radio" /><span><strong>Standard delivery</strong><small>Tomorrow, 19 October</small></span><b>GHS 40</b></label><label><input name="delivery" type="radio" /><span><strong>Pickup from vendors</strong><small>Ready at different locations</small></span><b>Free</b></label></section><section><h2>Payment method</h2>{[["MoMo", "MTN Mobile Money · ••• 4567"], ["Card", "Visa · ••• 8842"], ["Cash", "Cash on pickup only"]].map(([name, copy]) => <button className={method === name ? "selected" : ""} key={name} onClick={() => setMethod(name)} type="button"><span className={`s2-pay-logo s2-pay-${name.toLowerCase()}`}>{name === "MoMo" ? "Mo" : name === "Card" ? <CreditCard size={18} /> : "GHS"}</span><span><strong>{name}</strong><small>{copy}</small></span><i>{method === name && <Check size={13} />}</i></button>)}</section><section className="s2-checkout-total"><div><span>Items & delivery</span><strong>GHS 815</strong></div><div><span>Total</span><strong>GHS 815</strong></div></section><div className="s2-calm-note"><ShieldCheck size={17} /><span>Payment is verified server-side before your order is confirmed.</span></div></main>
      <div className="s2-sticky"><SButton onClick={() => go("order")}>Pay GHS 815</SButton></div>
    </div>
  );
}

function OrderTracking({ go }: { go: (page: Page) => void }) {
  return (
    <div className="s2-screen">
      <Header onBack={() => go("hub")} title="Order #MN-10482" />
      <main className="s2-order"><div className="s2-order-hero"><Package size={30} /><span className="s2-kicker">ORDER CONFIRMED</span><h1>Arriving tomorrow</h1><p>We'll notify you when each vendor dispatches your items.</p></div><div className="s2-order-timeline">{[["Order confirmed", "Today · 11:42 AM", true], ["Preparing your items", "In progress", true], ["Out for delivery", "Tomorrow", false], ["Delivered", "", false]].map(([label, meta, active], i) => <div className={active ? "active" : ""} key={label as string}><i>{i === 0 ? <Check size={12} /> : null}</i><span><strong>{label}</strong><small>{meta}</small></span></div>)}</div><section><span className="s2-kicker">2 VENDORS · 2 ITEMS</span><div><img alt="Brake component" src={partsPhoto} /><span><strong>Accra Parts Hub</strong><small>Front brake pad set</small></span><em>GHS 680</em></div><div><span className="s2-placeholder-part"><Package size={23} /></span><span><strong>MotorCare Direct</strong><small>Cabin air filter</small></span><em>GHS 95</em></div></section><SButton onClick={() => go("thread")} variant="secondary" icon={MessageCircle}>Message a vendor</SButton></main>
    </div>
  );
}

function Conversations({ go, back }: { go: (page: Page) => void; back: () => void }) {
  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Search conversations" type="button" disabled><Search size={19} /></button>} onBack={back} title="Messages" />
      <main className="s2-conversations"><div className="s2-conversation-filter"><button className="active" type="button" disabled>All</button><button type="button" disabled>Services</button><button type="button" disabled>Orders</button></div>{[["KA", "Kojo AutoCare", "I can take a look at that warning light…", "10:24 AM", "2"], ["AP", "Accra Parts Hub", "Your brake pads are ready to dispatch.", "Yesterday", ""], ["RL", "RoadLift Ghana", "Thanks for choosing RoadLift.", "12 Oct", ""]].map(([initials, name, copy, time, count], i) => <button key={name} onClick={() => i === 0 && go("thread")} type="button"><span className="s2-provider-avatar">{initials}</span><span><strong>{name}</strong><small>{copy}</small></span><span><small>{time}</small>{count && <em>{count}</em>}</span></button>)}</main>
    </div>
  );
}

function Thread({ back }: { back: () => void }) {
  const [messages, setMessages] = useState(["Hi Kojo, the warning light came back on this morning."]);
  const [draft, setDraft] = useState("");
  return (
    <div className="s2-screen s2-thread">
      <Header action={<button aria-label="Call Kojo" type="button" disabled><Phone size={19} /></button>} onBack={back} title="Kojo AutoCare" />
      <div className="s2-context-banner"><CalendarDays size={17} /><span><strong>Regarding your Toyota Corolla booking</strong><small>18 Oct · 2:30 PM</small></span><ChevronRight size={16} /></div>
      <main>
        <span className="s2-chat-date">TODAY</span>
        <div className="s2-message incoming">Good morning, Kwame. What can I help you with before Saturday?<small>10:21 AM</small></div>
        {messages.map((message, i) => <div className="s2-message outgoing" key={`${message}-${i}`}>{message}<small>{i === messages.length - 1 ? "Delivered · now" : "10:24 AM"}</small></div>)}
        <div className="s2-message incoming s2-photo-message"><div><Image size={22} /><span>Diagnostic reference.jpg</span></div>Please send a clear photo like this if you can.<small>10:25 AM</small></div>
        <div className="s2-typing"><span /><span /><span /> Kojo is typing</div>
      </main>
      <form className="s2-composer" onSubmit={(event) => { event.preventDefault(); if (draft.trim()) { setMessages([...messages, draft]); setDraft(""); } }}>
        <button aria-label="Attach photo or file" type="button" disabled><Paperclip size={20} /></button>
        <label><span className="sr-only">Message Kojo AutoCare</span><input onChange={(e) => setDraft(e.target.value)} placeholder="Write a message" value={draft} /></label>
        <button aria-label="Send message" disabled={!draft.trim()} type="submit"><Send size={18} /></button>
      </form>
    </div>
  );
}

export default function DriverFeatures({ start = "hub", onExit }: { start?: DriverFeatureStart; onExit: () => void }) {
  const activeVehicle = useAppStore((state) => state.activeVehicle);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [stack, setStack] = useState<Page[]>([start]);

  const refreshVehicles = useCallback(async () => {
    try {
      setVehicles(await vehicleService.list());
    } catch {
      // The vehicle list is best-effort; screens fall back to an empty state.
    }
  }, []);

  useEffect(() => { void refreshVehicles(); }, [refreshVehicles]);

  const currentVehicle = activeVehicle ?? vehicles[0] ?? null;
  const history = useAsyncData<ServiceHistoryItem[]>(() => (currentVehicle ? vehicleService.history(currentVehicle.id) : Promise.resolve([])), [], [currentVehicle?.id]);

  const page = stack[stack.length - 1];
  const go = (next: Page) => setStack((current) => [...current, next]);
  const back = () => stack.length > 1 ? setStack((current) => current.slice(0, -1)) : onExit();
  const view = useMemo(() => {
    switch (page) {
      case "hub": return <ModuleHub go={go} onExit={onExit} />;
      case "explore": return <Explore back={back} go={go} />;
      case "profile": return <Profile back={back} go={go} />;
      case "booking": return <Booking back={back} go={go} vehicle={currentVehicle} />;
      case "booking-confirmed": return <BookingConfirmed go={go} />;
      case "vehicles": return <Vehicles back={back} go={go} onChanged={refreshVehicles} vehicle={currentVehicle} />;
      case "history": return <HistoryList back={back} go={go} items={history.data} loading={history.loading} />;
      case "history-detail": return <HistoryDetail back={back} />;
      case "reminders": return <Reminders back={back} />;
      case "tow": return <Tow back={back} go={go} />;
      case "tow-estimate": return <TowEstimate back={back} go={go} vehicle={currentVehicle} />;
      case "tow-tracking": return <TowTracking go={go} />;
      case "tow-receipt": return <TowReceipt go={go} />;
      case "parts": return <Marketplace back={back} go={go} />;
      case "product": return <Product back={back} go={go} />;
      case "cart": return <Cart back={back} go={go} />;
      case "checkout": return <Checkout back={back} go={go} />;
      case "order": return <OrderTracking go={go} />;
      case "chat": return <Conversations back={back} go={go} />;
      case "thread": return <Thread back={back} />;
      default: return <ModuleHub go={go} onExit={onExit} />;
    }
  }, [page, stack.length, currentVehicle, history.data, history.loading, refreshVehicles]);
  return view;
}
