import "./explore.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Gauge,
  History,
  LifeBuoy,
  MapPin,
  MessageCircle,
  Navigation,
  Phone,
  Plus,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Star,
  Truck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { useAppStore } from "../../state/store";
import { bookingService } from "../../services/booking";
import { towService } from "../../services/tow";
import { vehicleService, type ServiceHistoryItem } from "../../services/vehicles";
import type { NearbyProvider, ServiceRequest, Vehicle } from "../../services/apiTypes";
import { errorMessage } from "../../services/errorMessage";
import { LiveMap } from "../../components/LiveMap";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useNearbyProviders } from "../../hooks/useNearbyProviders";

const today = new Date();
const roadworthyDate = new Intl.DateTimeFormat("en-GH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Accra",
}).format(new Date(today.getFullYear(), today.getMonth() + 2, 28));

export type DriverFeatureStart = "hub" | "explore" | "booking" | "vehicles" | "tow" | "parts" | "chat";
type Page = DriverFeatureStart | "booking-confirmed" | "history" | "reminders" | "tow-estimate" | "tow-submitted";

type BookingSummary = { service: string; vehicle: string; when: string; ref?: string };
type TowSummary = { ref?: string; pickup: string; destination: string; estimateGhs: number; distanceKm: number };

function vehicleLabel(vehicle: Vehicle) {
  return [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim() || "Vehicle";
}

function vehicleMeta(vehicle: Vehicle) {
  const parts = [String(vehicle.year), vehicle.plate, vehicle.mileageKm ? `${vehicle.mileageKm.toLocaleString("en-GH")} km` : null].filter(Boolean);
  return parts.join(" · ");
}

function formatMoney(value: number) {
  return `GHS ${Math.round(value).toLocaleString("en-GH")}`;
}

function providerKindMeta(type: NearbyProvider["type"]) {
  if (type === "tow") return { label: "Tow operator", icon: Truck, tone: "tow" as const };
  if (type === "vendor") return { label: "Parts shop", icon: ShoppingBag, tone: "shop" as const };
  return { label: "Mechanic", icon: Wrench, tone: "mechanic" as const };
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recent";
  return date.toLocaleDateString("en-GH", { day: "numeric", month: "short", timeZone: "Africa/Accra" });
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Accra",
  }).format(value);
}

function formatMonthHeading(value: Date) {
  return new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(value).toUpperCase();
}

function buildSlots() {
  const slots: { date: Date; label: string }[] = [];
  for (let day = 0; day < 7; day += 1) {
    const base = new Date(today);
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + day);
    if (base.getDay() === 0) continue; // closed Sundays
    for (const hour of [9, 11, 14, 16]) {
      const slot = new Date(base);
      slot.setHours(hour, 0, 0, 0);
      if (slot.getTime() > Date.now() + 60 * 60 * 1000) {
        slots.push({ date: slot, label: formatDateTime(slot) });
      }
    }
  }
  return slots.slice(0, 8);
}

type AsyncState<T> = { data: T; loading: boolean };

function useAsyncData<T>(load: () => Promise<T>, initial: T, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: true });
  useEffect(() => {
    let cancelled = false;
    setState((current) => ({ ...current, loading: true }));
    void load()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ data: initial, loading: false });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

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

function Header({ title, eyebrow, onBack }: { title: string; eyebrow?: string; onBack: () => void }) {
  return (
    <header className="s2-header">
      <button aria-label="Go back" onClick={onBack} type="button">
        <ArrowLeft size={20} />
      </button>
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <strong>{title}</strong>
      </div>
      <i />
    </header>
  );
}

function ModuleHub({ go, onExit }: { go: (page: Page) => void; onExit: () => void }) {
  const modules = [
    { page: "explore" as Page, icon: MapPin, label: "Explore", copy: "Find help and services", tone: "blue" },
    { page: "booking" as Page, icon: CalendarDays, label: "Book a service", copy: "Create a service request", tone: "violet" },
    { page: "tow" as Page, icon: Truck, label: "Request a tow", copy: "Get an estimate and submit", tone: "amber" },
    { page: "parts" as Page, icon: ShoppingBag, label: "Parts", copy: "Ordering coming soon", tone: "green" },
    { page: "vehicles" as Page, icon: Car, label: "My vehicles", copy: "Vehicles and records", tone: "steel" },
    { page: "chat" as Page, icon: MessageCircle, label: "Messages", copy: "Messaging coming soon", tone: "blue" },
  ];
  return (
    <div className="s2-screen s2-hub">
      <Header onBack={onExit} eyebrow="DRIVER SERVICES" title="Services" />
      <main>
        <span className="s2-kicker">MECHNOW</span>
        <h1>What do you need help with?</h1>
        <p>Book service, request a tow, or manage the vehicles on your account.</p>
        <div className="s2-module-grid">
          {modules.map(({ page, icon: Icon, label, copy, tone }) => (
            <button key={page} onClick={() => go(page)} type="button">
              <span className={`s2-module-icon s2-tone-${tone}`}>
                <Icon size={22} />
              </span>
              <strong>{label}</strong>
              <small>{copy}</small>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function Explore({ back, go }: { back: () => void; go: (page: Page) => void }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<"all" | NearbyProvider["type"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(params.get("provider"));
  const geo = useGeolocation({ immediate: true });
  const nearby = useNearbyProviders(geo.point ? { lat: geo.point.lat, lng: geo.point.lng } : null);

  const visible = useMemo(
    () => (filter === "all" ? nearby.items : nearby.items.filter((provider) => provider.type === filter)),
    [filter, nearby.items],
  );
  const selected = visible.find((provider) => provider.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !visible.some((provider) => provider.id === selectedId)) setSelectedId(null);
  }, [selectedId, visible]);

  const focus = useMemo(() => {
    if (selected?.lat != null && selected?.lng != null) return { lat: selected.lat, lng: selected.lng };
    if (geo.point) return { lat: geo.point.lat, lng: geo.point.lng };
    return null;
  }, [geo.point, selected?.id, selected?.lat, selected?.lng]);

  const counts = useMemo(
    () => ({
      all: nearby.items.length,
      mechanic: nearby.items.filter((provider) => provider.type === "mechanic").length,
      tow: nearby.items.filter((provider) => provider.type === "tow").length,
      vendor: nearby.items.filter((provider) => provider.type === "vendor").length,
    }),
    [nearby.items],
  );

  const requestProvider = (provider: NearbyProvider) => {
    if (provider.type === "tow") {
      go("tow");
      return;
    }
    if (provider.type === "vendor") {
      go("parts");
      return;
    }
    navigate("/app/emergency/problem");
  };

  const openDirections = (provider: NearbyProvider) => {
    if (provider.lat == null || provider.lng == null) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${provider.lat},${provider.lng}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <div className="s2-screen s2-explore">
      <Header onBack={back} eyebrow="NEAR YOU" title="Explore" />
      <main className="explore-main">
        <h1 className="sr-only">Explore verified providers near you</h1>
        <div className="explore-filters" role="group" aria-label="Filter nearby providers">
          {([
            ["all", "All", counts.all],
            ["mechanic", "Mechanics", counts.mechanic],
            ["tow", "Tow", counts.tow],
            ["vendor", "Shops", counts.vendor],
          ] as const).map(([key, label, count]) => (
            <button
              aria-pressed={filter === key}
              className={filter === key ? "active" : ""}
              key={key}
              onClick={() => setFilter(key)}
              type="button"
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>

        <section className="explore-map" aria-label="Nearby providers map">
          <LiveMap
            user={geo.point ? { lat: geo.point.lat, lng: geo.point.lng, label: geo.point.label ?? "You", kind: "user" } : null}
            markers={visible.map((provider) => ({
              id: provider.id,
              lat: provider.lat as number,
              lng: provider.lng as number,
              label: provider.businessName.replace(/\s*\(demo\)$/i, ""),
              kind: provider.type === "vendor" ? "shop" : provider.type,
              active: provider.id === selectedId,
            }))}
            focus={focus}
            onMarkerSelect={setSelectedId}
            height={286}
            interactive
          />
          <button className="explore-recenter" onClick={() => geo.request()} type="button">
            <Navigation size={15} />
            {geo.loading ? "Locating…" : geo.point ? "Recenter" : "Find me"}
          </button>
          {!nearby.loading && nearby.items.length === 0 && (
            <div className="explore-map__empty">
              <MapPin size={20} />
              <strong>No verified providers on the map yet</strong>
              <small>Try again in a moment or request help directly.</small>
            </div>
          )}
        </section>

        <div className="explore-summary">
          <div>
            <span className="overline">VERIFIED DIRECTORY</span>
            <h2>{nearby.loading ? "Finding help around you…" : `${visible.length} ${visible.length === 1 ? "place" : "places"} nearby`}</h2>
          </div>
          {geo.error && <small>{geo.error}</small>}
        </div>

        {nearby.loading ? (
          <div className="explore-list" aria-hidden="true">
            {[0, 1, 2].map((index) => <span className="explore-skeleton" key={index} />)}
          </div>
        ) : visible.length ? (
          <section className="explore-list" aria-label="Nearby providers">
            {visible.map((provider, index) => {
              const meta = providerKindMeta(provider.type);
              const Icon = meta.icon;
              return (
                <button
                  aria-pressed={provider.id === selectedId}
                  className={`explore-card explore-card--${meta.tone}${provider.id === selectedId ? " is-selected" : ""}`}
                  key={provider.id}
                  onClick={() => setSelectedId(provider.id)}
                  style={{ "--card-index": index } as React.CSSProperties}
                  type="button"
                >
                  <span className="explore-card__icon"><Icon size={20} /></span>
                  <span className="explore-card__body">
                    <small><BadgeCheck size={12} fill="currentColor" /> VERIFIED {meta.label.toUpperCase()}</small>
                    <strong>{provider.businessName.replace(/\s*\(demo\)$/i, "")}</strong>
                    <p>{provider.specialisations.slice(0, 2).join(" · ") || provider.address || provider.region || "Accra"}</p>
                    <em>
                      <span><Star size={12} fill="currentColor" /> {provider.rating > 0 ? provider.rating.toFixed(1) : "New"}</span>
                      <span><MapPin size={12} /> {provider.distanceKm != null ? `${provider.distanceKm} km` : provider.region ?? "Accra"}</span>
                      <span className={provider.available ? "is-open" : "is-busy"}>{provider.available ? "Open now" : "Busy"}</span>
                    </em>
                  </span>
                  <ChevronRight size={17} />
                </button>
              );
            })}
          </section>
        ) : (
          <section className="explore-empty">
            <span><Wrench size={22} /></span>
            <h2>Nothing in this category yet</h2>
            <p>Switch the filter or request roadside help directly — we'll find the closest verified provider.</p>
            <SButton icon={LifeBuoy} onClick={() => navigate("/app/emergency/problem")}>Request emergency help</SButton>
          </section>
        )}

        {selected && (
          <section className="explore-detail">
            <div className="explore-detail__head">
              <span className={`explore-card__icon explore-card__icon--${providerKindMeta(selected.type).tone}`}>
                {(() => {
                  const Icon = providerKindMeta(selected.type).icon;
                  return <Icon size={20} />;
                })()}
              </span>
              <div>
                <small>{providerKindMeta(selected.type).label} · {selected.available ? "Open now" : "Busy"}</small>
                <strong>{selected.businessName.replace(/\s*\(demo\)$/i, "")}</strong>
                <p>{selected.address ?? selected.region ?? "Accra"}</p>
              </div>
              <button aria-label="Close details" onClick={() => setSelectedId(null)} type="button">×</button>
            </div>
            <div className="explore-detail__meta">
              <span><Star size={13} fill="currentColor" /> {selected.rating > 0 ? selected.rating.toFixed(1) : "New"}</span>
              <span><MapPin size={13} /> {selected.distanceKm != null ? `${selected.distanceKm} km away` : "Distance pending"}</span>
              {selected.lat != null && selected.lng != null && <span><Clock3 size={13} /> ~{Math.max(3, Math.round((selected.distanceKm ?? 4) * 3))} min</span>}
            </div>
            <div className="explore-detail__actions">
              <SButton onClick={() => requestProvider(selected)}>
                {selected.type === "vendor" ? "Browse parts" : selected.type === "tow" ? "Request tow" : "Request help"}
              </SButton>
              <SButton disabled={selected.lat == null} icon={Navigation} onClick={() => openDirections(selected)} variant="secondary">
                Directions
              </SButton>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function ComingSoon({ back, title, body, icon: Icon }: { back: () => void; title: string; body: string; icon: LucideIcon }) {
  return (
    <div className="s2-screen">
      <Header onBack={back} title={title} />
      <main className="s2-vehicles">
        <section className="s2-tab-placeholder">
          <Icon size={28} />
          <h2>{title}</h2>
          <p>{body}</p>
        </section>
      </main>
    </div>
  );
}

function Booking({
  vehicle,
  vehiclesLoading,
  go,
  back,
  onCreated,
}: {
  vehicle: Vehicle | null;
  vehiclesLoading: boolean;
  go: (page: Page) => void;
  back: () => void;
  onCreated: (summary: BookingSummary) => void;
}) {
  const [step, setStep] = useState(1);
  const [service, setService] = useState("Vehicle diagnostics");
  const [slot, setSlot] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = useMemo(buildSlots, []);
  const titles = ["Choose a service", "Confirm vehicle", "Pick a time", "Add details", "Review request"];

  const confirm = async () => {
    if (!vehicle) {
      setError("Add a vehicle before booking a service.");
      return;
    }
    if (!slot) {
      setError("Choose a preferred time.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const problem = [service, `Preferred time: ${slot}`, notes.trim() ? `Notes: ${notes.trim()}` : ""].filter(Boolean).join(". ");
      const created = await bookingService.create({ vehicleId: vehicle.id, service, problem });
      onCreated({ service, vehicle: vehicleLabel(vehicle), when: slot, ref: (created as ServiceRequest | undefined)?.ref });
      go("booking-confirmed");
    } catch (err) {
      setError(errorMessage(err, "We couldn't submit your booking. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="s2-screen">
      <Header eyebrow={`STEP ${step} OF 5`} onBack={() => (step === 1 ? back() : setStep(step - 1))} title={titles[step - 1]} />
      <div className="s2-progress">
        <span style={{ width: `${step * 20}%` }} />
      </div>
      <main className="s2-booking">
        {step === 1 && (
          <div className="s2-choice-list">
            {[
              ["Vehicle diagnostics", "Find the cause of a warning or issue"],
              ["Brake inspection", "Full braking system safety check"],
              ["Routine service", "Oil, filters and inspection"],
              ["Battery service", "Test, charge or replacement"],
            ].map(([name, copy]) => (
              <button className={service === name ? "selected" : ""} key={name} onClick={() => setService(name)} type="button">
                <span className="s2-choice-icon">
                  <Wrench size={19} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{copy}</small>
                </span>
                <span>
                  <i>{service === name && <Check size={13} />}</i>
                </span>
              </button>
            ))}
          </div>
        )}
        {step === 2 && (
          <div className="s2-vehicle-choice">
            <span className="s2-kicker">SELECT A VEHICLE</span>
            {vehiclesLoading && <p className="s2-page-copy">Loading your vehicles…</p>}
            {!vehiclesLoading && vehicle && (
              <button className="selected" type="button" disabled>
                <span className="s2-car-visual">
                  <Car size={40} />
                </span>
                <span>
                  <strong>{vehicleLabel(vehicle)}</strong>
                  <small>{vehicleMeta(vehicle)}</small>
                  {vehicle.primary && <em>PRIMARY</em>}
                </span>
                <i>
                  <Check size={14} />
                </i>
              </button>
            )}
            {!vehiclesLoading && !vehicle && <p className="s2-page-copy">No vehicle on file. Add a vehicle before booking.</p>}
            <button onClick={() => go("vehicles")} type="button">
              <Plus size={18} /> Manage vehicles
            </button>
          </div>
        )}
        {step === 3 && (
          <div className="s2-date-time">
            <span className="s2-kicker">{formatMonthHeading(today)} · AFRICA/ACCRA</span>
            <h2>Choose a preferred time</h2>
            {slots.length === 0 ? (
              <p className="s2-page-copy">No time slots are available right now. Try again later.</p>
            ) : (
              <div className="s2-time-grid">
                {slots.map((item) => (
                  <button className={slot === item.label ? "selected" : ""} key={item.label} onClick={() => setSlot(item.label)} type="button">
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            <div className="s2-timezone">
              <Clock3 size={15} /> A provider will confirm the exact appointment time.
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="s2-notes">
            <label htmlFor="booking-notes">Describe what you’ve noticed</label>
            <textarea
              id="booking-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="For example: the warning light came on yesterday and the car feels slow to start."
              value={notes}
            />
            <div className="s2-calm-note">
              <ShieldCheck size={17} />
              <span>Your request details are shared only with the provider handling the job.</span>
            </div>
          </div>
        )}
        {step === 5 && (
          <div className="s2-review">
            <section>
              <div className="s2-provider-avatar">MN</div>
              <span>
                <strong>Service request</strong>
                <small>We’ll notify you when a provider responds</small>
              </span>
            </section>
            <dl>
              <div>
                <dt>Service</dt>
                <dd>{service}</dd>
              </div>
              <div>
                <dt>Vehicle</dt>
                <dd>{vehicle ? `${vehicleLabel(vehicle)} · ${vehicle.year}` : "No vehicle selected"}</dd>
              </div>
              <div>
                <dt>Preferred time</dt>
                <dd>{slot || "Not selected"}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{notes.trim() || "None"}</dd>
              </div>
            </dl>
          </div>
        )}
      </main>
      <div className="s2-sticky">
        {error && <p role="alert">{error}</p>}
        <SButton disabled={(step === 2 && !vehicle) || (step === 3 && !slot) || submitting} onClick={() => (step === 5 ? void confirm() : setStep(step + 1))}>
          {step === 5 ? (submitting ? "Submitting…" : "Submit request") : "Continue"}
        </SButton>
      </div>
    </div>
  );
}

function BookingConfirmed({ go, summary }: { go: (page: Page) => void; summary: BookingSummary | null }) {
  const navigate = useNavigate();
  return (
    <div className="s2-screen s2-success">
      <main>
        <div>
          <Check size={31} />
        </div>
        <span className="s2-kicker">REQUEST SUBMITTED</span>
        <h1>Your service request is in.</h1>
        <p>We’ll let you know as it’s assigned and updated. Track it in Activity.</p>
        <section>
          <CalendarDays size={20} />
          <span>
            <strong>{summary?.when ?? "Preferred time saved"}</strong>
            <small>
              {summary?.service ?? "Service"}
              {summary?.vehicle ? ` · ${summary.vehicle}` : ""}
              {summary?.ref ? ` · ${summary.ref}` : ""}
            </small>
          </span>
        </section>
        <SButton onClick={() => navigate("/app/activity")}>View activity</SButton>
        <SButton variant="ghost" onClick={() => go("hub")}>
          Back to services
        </SButton>
      </main>
    </div>
  );
}

function Vehicles({
  vehicles,
  loading,
  go,
  back,
  onChanged,
}: {
  vehicles: Vehicle[];
  loading: boolean;
  go: (page: Page) => void;
  back: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", year: String(today.getFullYear()), plate: "", mileageKm: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.make.trim() || !form.model.trim() || !form.plate.trim()) {
      setError("Make, model and plate are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await vehicleService.create({
        make: form.make.trim(),
        model: form.model.trim(),
        year: Number(form.year) || today.getFullYear(),
        plate: form.plate.trim().toUpperCase(),
        mileageKm: Number(form.mileageKm) || 0,
        primary: vehicles.length === 0,
      });
      setAdding(false);
      setForm({ make: "", model: "", year: String(today.getFullYear()), plate: "", mileageKm: "" });
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "We couldn't save your vehicle. Check the details and try again."));
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <div className="s2-screen">
        <Header onBack={() => setAdding(false)} title="Add a vehicle" />
        <main className="s2-notes">
          <form onSubmit={submit} className="s2-notes">
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
            <button className="s2-button s2-button--primary" disabled={saving} type="submit">
              <span>{saving ? "Saving…" : "Save vehicle"}</span>
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="s2-screen">
      <Header onBack={back} title="My vehicles" />
      <main className="s2-vehicles">
        {loading && <p className="s2-page-copy">Loading vehicles…</p>}
        {!loading && vehicles.length === 0 && (
          <section className="s2-tab-placeholder">
            <Car size={28} />
            <h2>No vehicles yet</h2>
            <p>Add your vehicle to book services, request help, and keep records.</p>
            <button className="s2-button s2-button--primary" onClick={() => setAdding(true)} type="button">
              <span>
                <Plus size={18} /> Add a vehicle
              </span>
            </button>
          </section>
        )}
        {!loading && vehicles.length > 0 && (
          <section className="s2-vehicle-choice">
            <span className="s2-kicker">YOUR VEHICLES</span>
            {vehicles.map((item) => (
              <button className={item.primary ? "selected" : ""} key={item.id} type="button" disabled>
                <span className="s2-car-visual">
                  <Car size={40} />
                </span>
                <span>
                  <strong>{vehicleLabel(item)}</strong>
                  <small>{vehicleMeta(item)}</small>
                  {item.primary && <em>PRIMARY</em>}
                </span>
                <i>{item.primary && <Check size={14} />}</i>
              </button>
            ))}
            <button onClick={() => setAdding(true)} type="button">
              <Plus size={18} /> Add a vehicle
            </button>
          </section>
        )}
        <div className="s2-vehicle-metrics">
          <button onClick={() => go("history")} type="button">
            <span className="s2-tone-blue">
              <History size={19} />
            </span>
            <strong>Service records</strong>
            <small>Completed jobs</small>
            <ArrowRight size={15} />
          </button>
          <button onClick={() => go("reminders")} type="button">
            <span className="s2-tone-amber">
              <Clock3 size={19} />
            </span>
            <strong>Reminders</strong>
            <small>Maintenance schedule</small>
            <ArrowRight size={15} />
          </button>
        </div>
      </main>
    </div>
  );
}

function HistoryList({ items, loading, back }: { items: ServiceHistoryItem[]; loading: boolean; back: () => void }) {
  const total = items.reduce((sum, item) => sum + (item.payment?.amountGhs ?? item.approvedEstimate?.totalGhs ?? 0), 0);
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Service history" />
      <main className="s2-history">
        <div className="s2-history-summary">
          <span>
            <strong>{items.length}</strong>
            <small>SERVICE RECORDS</small>
          </span>
          <span>
            <strong>{formatMoney(total)}</strong>
            <small>RECORDED SPEND</small>
          </span>
        </div>
        {loading && <p className="s2-history-empty">Loading service records…</p>}
        {!loading && items.length === 0 && <p className="s2-history-empty">No completed services yet. Provider records appear here after a job is closed.</p>}
        {!loading &&
          items.map((item) => {
            const price = item.payment?.amountGhs ?? item.approvedEstimate?.totalGhs ?? 0;
            return (
              <button key={item.request.id} type="button" disabled>
                <span className="s2-history-date">{formatDay(item.request.completedAt ?? item.request.updatedAt)}</span>
                <span>
                  <strong>{item.request.problem}</strong>
                  <small>{item.request.provider?.businessName ?? "Assigned provider"}</small>
                </span>
                <span>
                  <strong>{price ? formatMoney(price) : "—"}</strong>
                  <small>{item.request.ref}</small>
                </span>
              </button>
            );
          })}
      </main>
    </div>
  );
}

function Reminders({ back }: { back: () => void }) {
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Maintenance reminders" />
      <main className="s2-reminders">
        <div className="s2-reminder-hero">
          <Gauge size={24} />
          <span>
            <small>REMINDERS</small>
            <strong>Based on your records</strong>
          </span>
        </div>
        {[
          ["Oil & filter change", "Suggested interval", "Every 5,000 km or 6 months", "blue"],
          ["Roadworthy renewal", "Calendar reminder", roadworthyDate, "amber"],
          ["Tyre rotation", "Suggested interval", "Every 8,000–10,000 km", "steel"],
        ].map(([name, source, target, tone]) => (
          <article key={name as string}>
            <span className={`s2-tone-${tone as string}`}>
              <Clock3 size={20} />
            </span>
            <div>
              <strong>{name as string}</strong>
              <p>{target as string}</p>
              <small>{source as string}</small>
            </div>
            <button aria-label={`More options for ${name as string}`} type="button" disabled>
              <Settings2 size={17} />
            </button>
          </article>
        ))}
        <div className="s2-suggested-note">
          <ShieldCheck size={17} />
          <span>
            <strong>About reminders</strong>
            <small>Intervals are general guidance unless your provider or vehicle manual specifies otherwise.</small>
          </span>
        </div>
      </main>
    </div>
  );
}

function Tow({ go, back }: { go: (page: Page) => void; back: () => void }) {
  const reasons = [
    ["Vehicle won't start", "Engine, battery or electrical issue"],
    ["Accident", "Vehicle is damaged or unsafe to drive"],
    ["Flat tyre or roadside", "Stuck on the road, needs recovery"],
    ["Move vehicle", "Transport a vehicle to another location"],
  ];
  return (
    <div className="s2-screen">
      <Header onBack={back} title="Request a tow" />
      <main className="s2-tow">
        <span className="s2-kicker">WHAT'S HAPPENING?</span>
        <div className="s2-choice-list">
          {reasons.map(([name, copy]) => (
            <button key={name} type="button" onClick={() => go("tow-estimate")}>
              <span className="s2-choice-icon">
                <Truck size={19} />
              </span>
              <span>
                <strong>{name}</strong>
                <small>{copy}</small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
        <div className="s2-calm-note">
          <ShieldCheck size={17} />
          <span>You’ll see an estimate before you submit the request. No payment is taken in the app yet.</span>
        </div>
      </main>
    </div>
  );
}

function TowEstimate({
  vehicle,
  vehiclesLoading,
  back,
  go,
  onSubmitted,
}: {
  vehicle: Vehicle | null;
  vehiclesLoading: boolean;
  back: () => void;
  go: (page: Page) => void;
  onSubmitted: (summary: TowSummary) => void;
}) {
  const [pickup, setPickup] = useState("Current location");
  const [destination, setDestination] = useState("Preferred workshop");
  const [distanceKm, setDistanceKm] = useState(6);
  const [towType, setTowType] = useState<"flatbed" | "wheel-lift" | "standard">("flatbed");
  const [estimateGhs, setEstimateGhs] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void towService.estimate(distanceKm, towType).then((res) => {
      if (active) setEstimateGhs(res.totalGhs);
    }).catch(() => {
      if (active) setEstimateGhs(null);
    });
    return () => {
      active = false;
    };
  }, [distanceKm, towType]);

  const submit = async () => {
    if (!vehicle) {
      setError("Add a vehicle before requesting a tow.");
      return;
    }
    if (!pickup.trim() || !destination.trim()) {
      setError("Enter a pickup point and destination.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await towService.request({
        vehicleId: vehicle.id,
        problem: `Tow requested (${towType}, ~${distanceKm} km). Pickup: ${pickup.trim()}. Destination: ${destination.trim()}.`,
        location: { label: pickup.trim() },
        region: "Greater Accra",
      });
      onSubmitted({
        ref: (created as ServiceRequest | undefined)?.ref,
        pickup: pickup.trim(),
        destination: destination.trim(),
        estimateGhs: estimateGhs ?? 0,
        distanceKm,
      });
      go("tow-submitted");
    } catch (err) {
      setError(errorMessage(err, "We couldn't submit your tow request. Check your connection and try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="s2-screen">
      <Header onBack={back} title="Tow estimate" />
      <main className="s2-tow-estimate">
        <span className="s2-kicker">ESTIMATE</span>
        <h1>{estimateGhs != null ? formatMoney(estimateGhs) : "—"}</h1>
        <p>Estimated total for a {towType} tow. A provider will confirm details before work begins.</p>

        <div className="s2-notes" style={{ textAlign: "left", marginTop: 16 }}>
          {vehiclesLoading && <p className="s2-page-copy">Loading your vehicle…</p>}
          {!vehiclesLoading && !vehicle && <p className="s2-page-copy">No vehicle on file. Add one in My vehicles to continue.</p>}
          {vehicle && (
            <div className="s2-vehicle-choice">
              <span className="s2-kicker">VEHICLE</span>
              <button className="selected" type="button" disabled>
                <span className="s2-car-visual">
                  <Car size={40} />
                </span>
                <span>
                  <strong>{vehicleLabel(vehicle)}</strong>
                  <small>{vehicleMeta(vehicle)}</small>
                </span>
                <i>
                  <Check size={14} />
                </i>
              </button>
            </div>
          )}

          <label htmlFor="tow-type" style={{ marginTop: 12 }}>Tow type</label>
          <div className="s2-tow-types">
            {([
              ["flatbed", "Flatbed", "Safest for most vehicles"],
              ["wheel-lift", "Wheel-lift", "For short distances"],
              ["standard", "Standard", "When suitable for the vehicle"],
            ] as const).map(([value, name, copy]) => (
              <button className={towType === value ? "selected" : ""} key={value} onClick={() => setTowType(value)} type="button">
                <span>
                  <Truck size={23} />
                </span>
                <span>
                  <strong>{name}</strong>
                  <small>{copy}</small>
                </span>
                <i>{towType === value && <Check size={13} />}</i>
              </button>
            ))}
          </div>

          <label htmlFor="tow-pickup" style={{ marginTop: 12 }}>Pickup location</label>
          <input id="tow-pickup" onChange={(e) => setPickup(e.target.value)} value={pickup} />
          <label htmlFor="tow-destination">Destination</label>
          <input id="tow-destination" onChange={(e) => setDestination(e.target.value)} value={destination} />
          <label htmlFor="tow-distance">Approx. distance (km)</label>
          <input id="tow-distance" min={1} onChange={(e) => setDistanceKm(Math.max(1, Number(e.target.value) || 1))} type="number" value={distanceKm} />
        </div>

        <div className="s2-calm-note" style={{ marginTop: 12, textAlign: "left" }}>
          <ShieldCheck size={17} />
          <span>This is an estimate, not a final quote. Live operator tracking will appear once connected.</span>
        </div>
      </main>
      <div className="s2-sticky">
        {error && <p role="alert">{error}</p>}
        <SButton disabled={submitting || !vehicle} onClick={() => void submit()}>
          {submitting ? "Submitting…" : "Submit tow request"}
        </SButton>
      </div>
    </div>
  );
}

function TowSubmitted({ go, summary }: { go: (page: Page) => void; summary: TowSummary | null }) {
  const navigate = useNavigate();
  return (
    <div className="s2-screen s2-success">
      <main>
        <div>
          <CheckCircle2 size={31} />
        </div>
        <span className="s2-kicker">TOW REQUEST SUBMITTED</span>
        <h1>We’re finding a tow operator.</h1>
        <p>Track updates in Activity. You’ll be notified as the request is assigned and progresses.</p>
        <section>
          <Truck size={20} />
          <span>
            <strong>{summary ? `${formatMoney(summary.estimateGhs)} estimate` : "Estimate saved"}</strong>
            <small>
              {summary ? `${summary.pickup} → ${summary.destination} · ~${summary.distanceKm} km` : "Pickup and destination saved"}
              {summary?.ref ? ` · ${summary.ref}` : ""}
            </small>
          </span>
        </section>
        <SButton onClick={() => navigate("/app/activity")}>View activity</SButton>
        <SButton variant="ghost" onClick={() => go("hub")}>
          Back to services
        </SButton>
      </main>
    </div>
  );
}

export default function DriverFeatures({ start = "hub", onExit }: { start?: DriverFeatureStart; onExit: () => void }) {
  const activeVehicle = useAppStore((state) => state.activeVehicle);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [stack, setStack] = useState<Page[]>([start]);
  const [lastBooking, setLastBooking] = useState<BookingSummary | null>(null);
  const [lastTow, setLastTow] = useState<TowSummary | null>(null);

  const refreshVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    try {
      setVehicles(await vehicleService.list());
    } catch {
      // Best-effort: screens fall back to an empty state.
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  useEffect(() => {
    void refreshVehicles();
  }, [refreshVehicles]);

  const currentVehicle = activeVehicle ?? vehicles.find((item) => item.primary) ?? vehicles[0] ?? null;
  const history = useAsyncData<ServiceHistoryItem[]>(
    () => (currentVehicle ? vehicleService.history(currentVehicle.id) : Promise.resolve([])),
    [],
    [currentVehicle?.id],
  );

  const page = stack[stack.length - 1];
  const go = (next: Page) => setStack((current) => [...current, next]);
  const back = () => (stack.length > 1 ? setStack((current) => current.slice(0, -1)) : onExit());

  const view = useMemo(() => {
    switch (page) {
      case "hub":
        return <ModuleHub go={go} onExit={onExit} />;
      case "explore":
        return <Explore back={back} go={go} />;
      case "booking":
        return <Booking back={back} go={go} onCreated={setLastBooking} vehicle={currentVehicle} vehiclesLoading={loadingVehicles} />;
      case "booking-confirmed":
        return <BookingConfirmed go={go} summary={lastBooking} />;
      case "vehicles":
        return <Vehicles back={back} go={go} loading={loadingVehicles} onChanged={refreshVehicles} vehicles={vehicles} />;
      case "history":
        return <HistoryList back={back} items={history.data} loading={history.loading} />;
      case "reminders":
        return <Reminders back={back} />;
      case "tow":
        return <Tow back={back} go={go} />;
      case "tow-estimate":
        return <TowEstimate back={back} go={go} onSubmitted={setLastTow} vehicle={currentVehicle} vehiclesLoading={loadingVehicles} />;
      case "tow-submitted":
        return <TowSubmitted go={go} summary={lastTow} />;
      case "parts":
        return <ComingSoon back={back} icon={ShoppingBag} title="Parts marketplace" body="Ordering parts in the app isn’t available yet. You can still book a service or request a tow." />;
      case "chat":
        return <ComingSoon back={back} icon={MessageCircle} title="Messages" body="In-app messaging isn’t connected yet. We’ll notify you in Activity when a provider responds to your request." />;
      default:
        return <ModuleHub go={go} onExit={onExit} />;
    }
  }, [page, stack.length, currentVehicle, vehicles, loadingVehicles, history.data, history.loading, refreshVehicles, onExit, lastBooking, lastTow]);

  return view;
}
