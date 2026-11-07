import "./explore.css";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Car,
  Check,
  CheckCircle2,
  CircleAlert,
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
import { bookingService, type Booking as SavedBooking } from "../../services/booking";
import { chatService, type ChatMessage } from "../../services/chat";
import { partsService, type Product } from "../../services/parts";
import { providerService, type Provider } from "../../services/providers";
import { towService } from "../../services/tow";
import { vehicleService } from "../../services/vehicles";
import type { Vehicle } from "../../state/types";
import { useAppStore } from "../../state/store";

export type DriverFeatureStart = "hub" | "explore" | "booking" | "vehicles" | "tow" | "parts" | "chat";
type Page =
  | DriverFeatureStart
  | "booking-confirmed"
  | "history"
  | "cart"
  | "thread";

function SButton({
  children,
  onClick,
  variant = "primary",
  icon: Icon,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button className={`s2-button s2-button--${variant}`} disabled={disabled} onClick={onClick} type={type}>
      {Icon && <Icon size={18} strokeWidth={1.75} />}
      <span>{children}</span>
    </button>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="s2-error" role="alert">
      <CircleAlert aria-hidden="true" size={18} />
      <div><p>{message}</p>{onRetry && <button onClick={onRetry} type="button">Try again</button>}</div>
    </div>
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
    { page: "explore" as Page, icon: MapPin, label: "Provider directory", copy: "Browse example listings; verify providers yourself", tone: "blue" },
    { page: "booking" as Page, icon: CalendarDays, label: "Save a booking request", copy: "Requests are not sent to providers yet", tone: "violet" },
    { page: "tow" as Page, icon: Truck, label: "Tow estimate", copy: "Indicative price only; no dispatch", tone: "amber" },
    { page: "parts" as Page, icon: ShoppingBag, label: "Parts catalog", copy: "Catalog and checkout are not available yet", tone: "green" },
    { page: "vehicles" as Page, icon: Car, label: "My vehicles", copy: "Manage vehicles saved to your account", tone: "steel" },
    { page: "chat" as Page, icon: MessageCircle, label: "Booking messages", copy: "Save messages; provider replies are unavailable", tone: "blue" },
  ];
  return (
    <div className="s2-screen s2-hub">
      <Header onBack={onExit} eyebrow="DRIVER SERVICES" title="Services" />
      <main>
        <span className="s2-kicker">VEHICLE CARE</span>
        <h1>What can we help with?</h1>
        <p>Manage your vehicle details, save booking requests, and calculate indicative tow estimates.</p>
        <div className="s2-visual-card">
          <img alt="" aria-hidden="true" src={mechanicPhoto} />
          <span><strong>Vehicle care, made simple</strong><small>Explore your options and keep your service details together.</small></span>
        </div>
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
  const [providers, setProviders] = useState<Provider[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    providerService.list(25)
      .then((list) => { if (active) setProviders(list); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load the provider directory."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  const filteredProviders = providers.filter((provider) =>
    `${provider.name} ${provider.type} ${provider.services.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="s2-screen s2-directory">
      <Header onBack={back} title="Provider directory" />
      <main className="s2-directory-main">
        <p>Example listings from the local directory. Availability, credentials, and contact details are not verified.</p>
        <label className="s2-market-search"><Search size={18} /><input aria-label="Search providers" onChange={(event) => setQuery(event.target.value)} placeholder="Search providers or services" value={query} /></label>
        {loading && <p role="status">Loading directory…</p>}
        {error && <ErrorNotice message={error} onRetry={() => setAttempt((value) => value + 1)} />}
        {!loading && !error && !filteredProviders.length && <div className="s2-empty-state"><img alt="" aria-hidden="true" src={mechanicPhoto} /><h2>{query ? "No matching providers" : "No provider listings yet"}</h2><p>{query ? "Try another name or service." : "Check back later for directory listings."}</p></div>}
        <div className="s2-directory-list">{filteredProviders.map((provider) => (
          <article className="s2-directory-card" key={provider.id}>
            <div className="s2-provider-avatar">{provider.name.slice(0, 2).toUpperCase()}</div>
            <div><h2>{provider.name}</h2><p>{provider.type} · {provider.distanceKm} km · {provider.etaMinutes} min estimated</p><small>{provider.services.join(", ")}</small></div>
            <SButton onClick={() => go("booking")}>Request booking</SButton>
          </article>
        ))}</div>
      </main>
    </div>
  );
}

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Booking({ go, back, onCreated }: { go: (page: Page) => void; back: () => void; onCreated: (booking: SavedBooking) => void }) {
  const [step, setStep] = useState(1);
  const [service, setService] = useState("Vehicle diagnostics");
  const [vehicleId, setVehicleId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [startsAt, setStartsAt] = useState(() => localDateTimeValue(new Date(Date.now() + 86_400_000)));
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const titles = ["Choose a service", "Choose provider & vehicle", "Pick a date & time", "Review booking"];

  useEffect(() => {
    let active = true;
    Promise.all([vehicleService.list(), providerService.list()])
      .then(([savedVehicles, availableProviders]) => {
        if (!active) return;
        setVehicles(savedVehicles);
        setProviders(availableProviders.filter((provider) => provider.type === "mechanic"));
        setVehicleId(savedVehicles.find((vehicle) => vehicle.primary)?.id ?? savedVehicles[0]?.id ?? "");
        setProviderId(availableProviders.find((provider) => provider.type === "mechanic")?.id ?? "");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Couldn't load booking options."))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
  const selectedProvider = providers.find((provider) => provider.id === providerId);
  const canContinue = step !== 2 || Boolean(selectedVehicle && selectedProvider);

  async function submitBooking() {
    if (!selectedVehicle || !selectedProvider) return;
    setSaving(true);
    setError("");
    try {
      const booking = await bookingService.create({
        providerId: selectedProvider.id,
        vehicleId: selectedVehicle.id,
        startsAt: new Date(startsAt).toISOString(),
        service,
      }, useAppStore.getState().user);
      onCreated(booking);
      go("booking-confirmed");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this booking.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="s2-screen">
      <Header eyebrow={`STEP ${step} OF 4`} onBack={() => step === 1 ? back() : setStep(step - 1)} title={titles[step - 1]} />
      <div className="s2-progress"><span style={{ width: `${step * 25}%` }} /></div>
      <main className="s2-booking">
        {loading && <p role="status">Loading your saved vehicles and service directory…</p>}
        {!loading && step === 1 && <div className="s2-choice-list">{["Vehicle diagnostics", "Brake inspection", "Routine service", "Battery service"].map((name) => <button className={service === name ? "selected" : ""} key={name} onClick={() => setService(name)} type="button"><span className="s2-choice-icon"><Wrench size={19} /></span><span><strong>{name}</strong><small>Provider availability and final pricing will be confirmed separately.</small></span><span><i>{service === name && <Check size={13} />}</i></span></button>)}</div>}
        {!loading && step === 2 && (
          <div className="s2-booking-selects">
            {!vehicles.length ? <div className="s2-empty-state"><h2>Add a vehicle to continue</h2><p>A saved vehicle is required for a booking.</p><SButton onClick={() => go("vehicles")}>Open My vehicles</SButton></div> : (
              <label>Vehicle<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.year} {vehicle.make} {vehicle.model}{vehicle.primary ? " · Primary" : ""}</option>)}</select></label>
            )}
            {!providers.length ? <div className="s2-empty-state"><h2>No mechanic listings available</h2><p>Bookings are saved for your records only. Provider notifications are not connected yet.</p></div> : (
              <label>Mechanic<select value={providerId} onChange={(event) => setProviderId(event.target.value)}>{providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name} · directory listing</option>)}</select></label>
            )}
            <p className="s2-calm-note"><ShieldCheck size={17} /><span>Directory listings are sample data and have not been independently verified.</span></p>
          </div>
        )}
        {!loading && step === 3 && <div className="s2-date-time"><label htmlFor="booking-start">Requested date and time</label><input id="booking-start" min={localDateTimeValue(new Date())} onChange={(event) => setStartsAt(event.target.value)} type="datetime-local" value={startsAt} /><p className="s2-calm-note">This is a requested time, not a confirmed provider appointment.</p></div>}
        {!loading && step === 4 && <div className="s2-review"><section><div className="s2-provider-avatar">{selectedProvider?.name.slice(0, 2).toUpperCase() ?? "—"}</div><span><strong>{selectedProvider?.name ?? "No provider selected"}</strong><small>Sample directory listing</small></span></section><dl><div><dt>Service</dt><dd>{service}</dd></div><div><dt>Vehicle</dt><dd>{selectedVehicle ? `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}` : "Not selected"}</dd></div><div><dt>Requested</dt><dd>{new Date(startsAt).toLocaleString()}</dd></div></dl><div className="s2-calm-note"><FileText size={17} /><span>Your request will be saved to Activity. This does not notify the provider or confirm an appointment.</span></div></div>}
        {error && <ErrorNotice message={error} />}
      </main>
      <div className="s2-sticky">
        <SButton disabled={loading || saving || (step === 2 && !canContinue) || (step === 4 && (!selectedVehicle || !selectedProvider || Number.isNaN(new Date(startsAt).getTime())))} onClick={() => step === 4 ? void submitBooking() : setStep(step + 1)}>{saving ? "Saving…" : step === 4 ? "Save booking request" : "Continue"}</SButton>
      </div>
    </div>
  );
}

function BookingConfirmed({ booking, go }: { booking: SavedBooking | null; go: (page: Page) => void }) {
  return (
    <div className="s2-screen s2-success">
      <main><div><Check size={31} /></div><span className="s2-kicker">REQUEST SAVED</span><h1>Your booking request is saved.</h1><p>The provider has not been notified and your appointment is not confirmed.</p>{booking && <section><CalendarDays size={20} /><span><strong>{booking.service}</strong><small>{new Date(booking.startsAt).toLocaleString()}</small></span></section>}<SButton onClick={() => go("hub")}>Back to services</SButton></main>
    </div>
  );
}

function Vehicles({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const setActiveVehicle = useAppStore((state) => state.setVehicle);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [plate, setPlate] = useState("");
  const [mileage, setMileage] = useState("0");
  const [primary, setPrimary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadVehicles() {
    setError("");
    try {
      const saved = await vehicleService.list();
      setVehicles(saved);
      setActiveVehicle(saved.find((vehicle) => vehicle.primary) ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't load your vehicles.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadVehicles(); }, []);

  function startAdd() {
    setEditingId(null);
    setMake("");
    setModel("");
    setYear(String(new Date().getFullYear()));
    setPlate("");
    setMileage("0");
    setPrimary(vehicles.length === 0);
    setShowForm(true);
  }

  function startEdit(vehicle: Vehicle) {
    setEditingId(vehicle.id);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(String(vehicle.year));
    setPlate(vehicle.plate);
    setMileage(String(vehicle.mileageKm));
    setPrimary(vehicle.primary);
    setShowForm(true);
  }

  async function saveVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const details = {
        make: make.trim(),
        model: model.trim(),
        year: Number(year),
        plate: plate.trim().toUpperCase(),
        mileageKm: Number(mileage),
        primary,
      };
      if (editingId) await vehicleService.update(editingId, details);
      else await vehicleService.create(details);
      setShowForm(false);
      await loadVehicles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save this vehicle.");
    } finally {
      setSaving(false);
    }
  }

  async function removeVehicle(id: string) {
    setError("");
    try {
      await vehicleService.remove(id);
      await loadVehicles();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't remove this vehicle.");
    }
  }

  return (
    <div className="s2-screen">
      <Header action={<button aria-label="Add vehicle" onClick={startAdd} type="button"><Plus size={20} /></button>} onBack={back} title="My vehicles" />
      <main className="s2-vehicles">
        {loading && <p role="status">Loading your vehicles…</p>}
        {!loading && !vehicles.length && <div className="s2-empty-state"><img alt="" aria-hidden="true" src={tirePhoto} /><h2>No vehicles saved yet</h2><p>Add a vehicle to use booking and parts features.</p><SButton onClick={startAdd}>Add a vehicle</SButton></div>}
        {!loading && vehicles.map((vehicle) => (
          <section className="s2-vehicle-hero" key={vehicle.id}>
            <div className="s2-vehicle-top"><span>{vehicle.primary ? "PRIMARY VEHICLE" : "SAVED VEHICLE"}</span><button onClick={() => startEdit(vehicle)} type="button">Edit</button></div>
            <div className="s2-car-display"><Car size={72} strokeWidth={1.2} /><span /></div>
            <h1>{vehicle.year} {vehicle.make} {vehicle.model}</h1>
            <p>{vehicle.plate || "No plate added"} · {vehicle.mileageKm.toLocaleString()} km</p>
            <div className="s2-vehicle-actions">
              {!vehicle.primary && <button onClick={async () => {
                try {
                  await vehicleService.update(vehicle.id, { ...vehicle, primary: true });
                  await loadVehicles();
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Couldn't set the primary vehicle.");
                }
              }} type="button">Set as primary</button>}
              <button onClick={() => go("history")} type="button">Booking requests <ArrowRight size={15} /></button>
              <button onClick={() => void removeVehicle(vehicle.id)} type="button">Remove</button>
            </div>
          </section>
        ))}
        {showForm && <form className="s2-vehicle-form" onSubmit={(event) => void saveVehicle(event)}>
          <h2>{editingId ? "Edit vehicle" : "Add a vehicle"}</h2>
          <label>Make<input maxLength={40} onChange={(event) => setMake(event.target.value)} required value={make} /></label>
          <label>Model<input maxLength={40} onChange={(event) => setModel(event.target.value)} required value={model} /></label>
          <label>Year<input max={new Date().getFullYear() + 1} min="1950" onChange={(event) => setYear(event.target.value)} required type="number" value={year} /></label>
          <label>Plate<input maxLength={16} onChange={(event) => setPlate(event.target.value)} value={plate} /></label>
          <label>Mileage (km)<input min="0" onChange={(event) => setMileage(event.target.value)} required type="number" value={mileage} /></label>
          <label className="s2-checkbox"><input checked={primary} onChange={(event) => setPrimary(event.target.checked)} type="checkbox" /> Make primary vehicle</label>
          <div><SButton disabled={saving} type="submit">{saving ? "Saving…" : "Save vehicle"}</SButton><SButton onClick={() => setShowForm(false)} variant="ghost">Cancel</SButton></div>
        </form>}
        {error && <ErrorNotice message={error} />}
      </main>
    </div>
  );
}

function HistoryList({ back }: { back: () => void }) {
  const [bookings, setBookings] = useState<SavedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    bookingService.list()
      .then((saved) => { if (active) setBookings(saved); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load your booking requests."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Booking requests" />
      <main className="s2-history">
        {loading && <p role="status">Loading booking requests…</p>}
        {error && <ErrorNotice message={error} />}
        {!loading && !error && !bookings.length && <div className="s2-empty-state"><History size={30} /><h2>No booking requests yet</h2><p>Requests you save will appear here. This is not a completed service history.</p></div>}
        {bookings.map((booking) => <article className="s2-history-item" key={booking.id}><span className="s2-history-date"><CalendarDays size={16} /></span><span><strong>{booking.service}</strong><small>Vehicle {booking.vehicleId} · Provider {booking.providerId}</small><em>Saved request · not confirmed</em></span><span><strong>{new Date(booking.startsAt).toLocaleDateString()}</strong><small>{new Date(booking.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</small></span></article>)}
      </main>
    </div>
  );
}

function Tow({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [step, setStep] = useState(1);
  const [towType, setTowType] = useState<"flatbed" | "wheel-lift" | "standard">("flatbed");
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [distance, setDistance] = useState("");
  const [estimate, setEstimate] = useState<{ distanceKm: number; type: string; totalGhs: number; etaMinutes: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const vehicle = useAppStore((state) => state.activeVehicle);

  async function calculateEstimate() {
    setLoading(true);
    setError("");
    try {
      setEstimate(await towService.estimate(Number(distance), towType));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't calculate a tow estimate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="s2-screen">
      <Header eyebrow={`STEP ${step} OF 4`} onBack={() => step === 1 ? back() : setStep(step - 1)} title={["Vehicle", "Pickup & destination", "Tow type", "Estimate"][step - 1]} />
      <div className="s2-progress"><span style={{ width: `${step * 25}%` }} /></div>
      <main className="s2-tow">
        {step === 1 && <><div className="s2-service-image"><img alt="" aria-hidden="true" src={towPhoto} /></div><h1>Which vehicle needs a tow?</h1>{vehicle ? <article className="s2-directory-card"><Car size={28} /><div><h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2><p>{vehicle.plate || "No plate added"}</p></div></article> : <div className="s2-empty-state"><h2>Add a vehicle first</h2><p>A saved vehicle is required to estimate towing.</p><SButton onClick={() => go("vehicles")}>Open My vehicles</SButton></div>}</>}
        {step === 2 && <div className="s2-tow-inputs"><label>Pickup location<input maxLength={200} onChange={(event) => setPickup(event.target.value)} placeholder="Street or landmark" value={pickup} /></label><label>Destination<input maxLength={200} onChange={(event) => setDestination(event.target.value)} placeholder="Street or landmark" value={destination} /></label><label>Estimated distance (km)<input max="1000" min="0.1" onChange={(event) => setDistance(event.target.value)} placeholder="Enter the route distance" type="number" value={distance} /></label><p>Distance is entered manually because live maps and route calculation are not connected.</p></div>}
        {step === 3 && <><h1>Choose a tow type</h1><div className="s2-tow-types">{[["flatbed", "Flatbed", "All wheels off the road"], ["wheel-lift", "Wheel-lift", "Lifted axle towing"], ["standard", "Standard", "Standard towing"]].map(([value, name, copy]) => <button className={towType === value ? "selected" : ""} key={value} onClick={() => setTowType(value as typeof towType)} type="button"><span><Truck size={23} /></span><span><strong>{name}</strong><small>{copy}</small></span><i>{towType === value && <Check size={13} />}</i></button>)}</div></>}
        {step === 4 && <div className="s2-tow-review"><h1>Estimate only</h1><dl><div><dt>Vehicle</dt><dd>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Not selected"}</dd></div><div><dt>Pickup</dt><dd>{pickup}</dd></div><div><dt>Destination</dt><dd>{destination}</dd></div><div><dt>Tow type</dt><dd>{towType}</dd></div><div><dt>Distance</dt><dd>{distance} km</dd></div></dl>{estimate && <div className="s2-estimate-card"><span><small>ESTIMATED PRICE</small><strong>GHS {estimate.totalGhs.toFixed(2)}</strong></span><span><small>INDICATIVE ETA</small><strong>{estimate.etaMinutes} min</strong></span></div>}<p><ShieldCheck size={16} /> {estimate ? "This estimate does not request or dispatch a tow." : "Calculate a server estimate using the distance you entered."}</p></div>}
        {error && <ErrorNotice message={error} />}
      </main>
      <div className="s2-sticky"><SButton disabled={!vehicle || loading || (step === 2 && (!pickup.trim() || !destination.trim() || Number(distance) <= 0))} onClick={() => {
        if (step === 4) {
          if (estimate) back();
          else void calculateEstimate();
        } else {
          setEstimate(null);
          setStep(step + 1);
        }
      }}>{loading ? "Calculating…" : step === 4 ? estimate ? "Done" : "Calculate estimate" : "Continue"}</SButton></div>
    </div>
  );
}

function Marketplace({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cartCount, setCartCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const vehicle = useAppStore((state) => state.activeVehicle);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      Promise.all([partsService.search(query), partsService.getCart()])
        .then(([list, cart]) => {
          if (!active) return;
          setProducts(list);
          setCartCount(cart.reduce((total, item) => total + item.quantity, 0));
          setError("");
        })
        .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load the parts catalog."); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  async function addToCart(product: Product) {
    setSavingId(product.id);
    setError("");
    try {
      const current = await partsService.getCart();
      const existing = current.find((item) => item.productId === product.id);
      const next = existing
        ? current.map((item) => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { productId: product.id, quantity: 1 }];
      await partsService.saveCart(next);
      setCartCount(next.reduce((total, item) => total + item.quantity, 0));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update your cart.");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="s2-screen">
      <Header action={<button aria-label={`Shopping cart, ${cartCount} items`} onClick={() => go("cart")} type="button"><ShoppingCart size={19} />{cartCount > 0 && <span className="s2-cart-count">{cartCount}</span>}</button>} onBack={back} title="Parts" />
      <main className="s2-market">
        <label className="s2-market-search"><Search size={18} /><input aria-label="Search parts" onChange={(event) => setQuery(event.target.value)} placeholder="Search parts, brands or vehicles" value={query} /></label>
        <div className="s2-market-vehicle"><Car size={19} /><span><small>SHOPPING FOR</small><strong>{vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "No vehicle selected"}</strong></span></div>
        <p className="s2-calm-note"><ShieldCheck size={17} /><span>Catalog listings and checkout are not available yet. No orders or payments can be placed.</span></p>
        {loading && <p role="status">Searching parts catalog…</p>}
        {error && <ErrorNotice message={error} />}
        {!loading && !error && !products.length && <div className="s2-empty-state"><img alt="" aria-hidden="true" src={partsPhoto} /><h2>{query ? "No matching parts" : "No parts listed yet"}</h2><p>{query ? "Try another part or vehicle name." : "Parts aren't listed in the catalog yet."}</p></div>}
        <div className="s2-product-grid">{products.map((product) => {
          const compatible = Boolean(vehicle && product.compatibleVehicleIds.includes(vehicle.id));
          return <article className="s2-catalog-product" key={product.id}><h2>{product.name}</h2><p>{compatible ? "Compatibility listed for your vehicle" : "Vehicle compatibility not confirmed"}</p><strong>GHS {product.priceGhs.toFixed(2)}</strong><SButton disabled={!compatible || savingId === product.id} onClick={() => void addToCart(product)}>{savingId === product.id ? "Adding…" : "Add to cart"}</SButton></article>;
        })}</div>
      </main>
    </div>
  );
}

function Cart({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCart() {
    const [savedItems, catalog] = await Promise.all([partsService.getCart(), partsService.search("")]);
    setItems(savedItems);
    setProducts(catalog);
  }
  useEffect(() => {
    let active = true;
    loadCart()
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load your cart."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function updateCart(next: { productId: string; quantity: number }[]) {
    setError("");
    try {
      await partsService.saveCart(next);
      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't update your cart.");
    }
  }

  return (
    <div className="s2-screen">
      <Header onBack={back} title="Your cart" />
      <main className="s2-cart">
        {loading && <p role="status">Loading your saved cart…</p>}
        {error && <ErrorNotice message={error} />}
        {!loading && !error && !items.length && <div className="s2-empty-state"><img alt="" aria-hidden="true" src={partsPhoto} /><h2>Your cart is empty</h2><p>Items you save from the catalog will appear here. Checkout is not available.</p><SButton onClick={() => go("parts")}>Browse parts</SButton></div>}
        {items.map((item) => {
          const product = products.find((entry) => entry.id === item.productId);
          return <article className="s2-history-item" key={item.productId}><Package size={20} /><span><strong>{product?.name ?? "Catalog item unavailable"}</strong><small>Quantity {item.quantity}{product ? ` · GHS ${product.priceGhs.toFixed(2)} each` : ""}</small></span><button onClick={() => void updateCart(items.filter((entry) => entry.productId !== item.productId))} type="button">Remove</button></article>;
        })}
        <p className="s2-calm-note"><ShieldCheck size={17} /><span>Payment and order fulfillment are not available. No purchases can be made from this cart.</span></p>
      </main>
      <div className="s2-sticky"><SButton onClick={() => go("parts")} variant="secondary">Continue browsing</SButton></div>
    </div>
  );
}

function Conversations({ onOpenThread, back }: { onOpenThread: (booking: SavedBooking) => void; back: () => void }) {
  const [bookings, setBookings] = useState<SavedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    bookingService.list()
      .then((saved) => { if (active) setBookings(saved); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load your bookings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function openThread(booking: SavedBooking) {
    setOpeningId(booking.id);
    setError("");
    try {
      await onOpenThread(booking);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't open this conversation.");
    } finally {
      setOpeningId("");
    }
  }

  return (
    <div className="s2-screen">
      <Header onBack={back} title="Messages" />
      <main className="s2-conversations">
        <p className="s2-calm-note"><MessageCircle size={17} /><span>Messages are saved to your account. Providers are not connected to reply yet.</span></p>
        {loading && <p role="status">Loading your booking requests…</p>}
        {error && <ErrorNotice message={error} />}
        {!loading && !error && !bookings.length && <div className="s2-empty-state"><MessageCircle size={28} /><h2>No conversations yet</h2><p>Save a booking request to start a conversation record.</p></div>}
        {bookings.map((booking) => <button className="s2-conversation-booking" disabled={openingId === booking.id} key={booking.id} onClick={() => void openThread(booking)} type="button"><span className="s2-provider-avatar"><MessageCircle size={18} /></span><span><strong>{booking.service}</strong><small>Requested {new Date(booking.startsAt).toLocaleString()}</small></span><span>{openingId === booking.id ? "Opening…" : "Open"}</span></button>)}
      </main>
    </div>
  );
}

function Thread({ back, threadId, booking }: { back: () => void; threadId: string; booking: SavedBooking }) {
  const user = useAppStore((state) => state.user);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    chatService.list(threadId)
      .then((saved) => { if (active) setMessages(saved); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Couldn't load this conversation."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [threadId]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await chatService.send({ threadId, body }, user);
      setMessages((current) => [...current, message]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't send this message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="s2-screen s2-thread">
      <Header onBack={back} title="Booking messages" />
      <div className="s2-context-banner"><CalendarDays size={17} /><span><strong>{booking.service}</strong><small>{new Date(booking.startsAt).toLocaleString()}</small></span></div>
      <main>
        {loading && <p role="status">Loading messages…</p>}
        {error && <ErrorNotice message={error} />}
        {!loading && !error && !messages.length && <p className="s2-chat-empty">No messages yet. Your message will be saved here.</p>}
        {messages.map((message) => <div className={`s2-message ${message.senderId === user?.id ? "outgoing" : "incoming"}`} key={message.id}>{message.body}<small>{new Date(message.createdAt).toLocaleString()} · {message.state}</small></div>)}
      </main>
      <form className="s2-composer" onSubmit={(event) => void sendMessage(event)}>
        <label><span className="sr-only">Message about booking</span><input maxLength={2000} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message" value={draft} /></label>
        <button aria-label="Send message" disabled={!draft.trim() || sending} type="submit"><Send size={18} /></button>
      </form>
    </div>
  );
}

export default function DriverFeatures({ start = "hub", onExit }: { start?: DriverFeatureStart; onExit: () => void }) {
  const [stack, setStack] = useState<Page[]>([start]);
  const [createdBooking, setCreatedBooking] = useState<SavedBooking | null>(null);
  const [selectedThread, setSelectedThread] = useState<{ id: string; booking: SavedBooking } | null>(null);
  const page = stack[stack.length - 1];
  const go = (next: Page) => setStack((current) => [...current, next]);
  const back = () => stack.length > 1 ? setStack((current) => current.slice(0, -1)) : onExit();
  const view = useMemo(() => {
    switch (page) {
      case "hub": return <ModuleHub go={go} onExit={onExit} />;
      case "explore": return <Explore back={back} go={go} />;
      case "booking": return <Booking back={back} go={go} onCreated={setCreatedBooking} />;
      case "booking-confirmed": return <BookingConfirmed booking={createdBooking} go={go} />;
      case "vehicles": return <Vehicles back={back} go={go} />;
      case "history": return <HistoryList back={back} />;
      case "tow": return <Tow back={back} go={go} />;
      case "parts": return <Marketplace back={back} go={go} />;
      case "cart": return <Cart back={back} go={go} />;
      case "chat": return <Conversations back={back} onOpenThread={async (booking) => {
        const thread = await chatService.createThread(booking.id);
        setSelectedThread({ id: thread.id, booking });
        go("thread");
      }} />;
      case "thread": return selectedThread ? <Thread back={back} booking={selectedThread.booking} threadId={selectedThread.id} /> : <Conversations back={back} onOpenThread={async (booking) => {
        const thread = await chatService.createThread(booking.id);
        setSelectedThread({ id: thread.id, booking });
        go("thread");
      }} />;
      default: return <ModuleHub go={go} onExit={onExit} />;
    }
  }, [createdBooking, page, selectedThread, stack.length]);
  return view;
}
