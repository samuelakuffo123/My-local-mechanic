import {
  ArrowLeft,
  BatteryCharging,
  Car,
  CircleAlert,
  Fuel,
  HelpCircle,
  KeyRound,
  LifeBuoy,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Phone,
  RefreshCw,
  Thermometer,
  TriangleAlert,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import "./emergency.css";

export const SUPPORT_PHONE = "+233596263884";

const PROBLEMS: { label: string; icon: LucideIcon; danger?: boolean }[] = [
  { label: "Car won't start", icon: Zap },
  { label: "Flat tire", icon: LifeBuoy },
  { label: "Dead battery", icon: BatteryCharging },
  { label: "Overheating", icon: Thermometer },
  { label: "Engine problem", icon: Wrench },
  { label: "Fuel problem", icon: Fuel },
  { label: "Warning light", icon: CircleAlert },
  { label: "Locked out", icon: KeyRound },
  { label: "Accident", icon: TriangleAlert, danger: true },
  { label: "Not sure", icon: HelpCircle },
];

type Props = {
  selected: string;
  onSelect: (problem: string) => void;
  location: { lat: number; lng: number; label?: string | null } | null;
  locating: boolean;
  locationError: string | null;
  onRefreshLocation: () => void;
  landmark: string;
  onLandmark: (value: string) => void;
  vehicle: { make: string; model: string; plate: string } | null;
  onVehicle: () => void;
  sending: boolean;
  sendError: string | null;
  canSend: boolean;
  onSend: () => void;
  onBack: () => void;
};

/**
 * One screen for the whole request: what is wrong, where you are, which car,
 * then a single large button. Providers are alerted as soon as it is sent.
 */
export function EmergencyRequestScreen({
  selected,
  onSelect,
  location,
  locating,
  locationError,
  onRefreshLocation,
  landmark,
  onLandmark,
  vehicle,
  onVehicle,
  sending,
  sendError,
  canSend,
  onSend,
  onBack,
}: Props) {
  const placeLabel = location?.label?.trim() || "Current location";

  return (
    <div className="em-screen">
      <header className="em-top">
        <button aria-label="Go back" className="em-icon-btn" disabled={sending} onClick={onBack} type="button">
          <ArrowLeft size={20} />
        </button>
        <a className="em-call" href="tel:112">
          <Phone aria-hidden="true" size={15} /> Call 112
        </a>
      </header>

      <main className="em-body">
        <div>
          <h1 className="em-title">What’s wrong?</h1>
          <p className="em-sub">Pick the closest match, or just send help now.</p>
        </div>

        <div aria-label="Type of vehicle problem" className="em-tiles" role="radiogroup">
          {PROBLEMS.map(({ label, icon: Icon, danger }) => (
            <button
              aria-checked={selected === label}
              className={`em-tile${danger ? " em-tile--danger" : ""}`}
              key={label}
              onClick={() => onSelect(selected === label ? "" : label)}
              role="radio"
              type="button"
            >
              <span className="em-tile__icon"><Icon aria-hidden="true" size={19} /></span>
              {label}
            </button>
          ))}
        </div>

        {selected === "Accident" && (
          <div className="em-alert em-alert--stack" role="alert">
            <strong>Is anyone hurt or in danger?</strong>
            <span>Call Ghana emergency services first. MechNow does not replace them.</span>
            <a className="em-alert__action" href="tel:112"><Phone aria-hidden="true" size={15} /> Call 112</a>
          </div>
        )}

        <section aria-label="Your location" className="em-card">
          <span className="em-card__icon">
            {locating && !location ? <LoaderCircle className="em-spin" size={20} /> : <MapPin size={20} />}
          </span>
          <span className="em-card__text">
            <strong>
              {location ? placeLabel : locating ? "Finding your location…" : "Location not found"}
            </strong>
            <span>
              {location
                ? "Shared only with your provider"
                : locationError ?? "Turn on location, or type a landmark below"}
            </span>
          </span>
          <button className="em-card__action" disabled={locating} onClick={onRefreshLocation} type="button">
            {location ? <RefreshCw aria-hidden="true" size={15} /> : <LocateFixed aria-hidden="true" size={15} />}
            {location ? "Refresh" : "Retry"}
          </button>
        </section>

        <div className="em-field">
          <label htmlFor="em-landmark">Landmark or street <span>(optional, helps them find you)</span></label>
          <input
            autoComplete="off"
            id="em-landmark"
            onChange={(event) => onLandmark(event.target.value)}
            placeholder="e.g. Accra Mall, Spintex Road"
            value={landmark}
          />
        </div>

        {vehicle ? (
          <section aria-label="Your vehicle" className="em-card">
            <span className="em-card__icon"><Car size={20} /></span>
            <span className="em-card__text">
              <strong>{vehicle.make} {vehicle.model}</strong>
              <span>{vehicle.plate}</span>
            </span>
            <button className="em-card__action" onClick={onVehicle} type="button">Change</button>
          </section>
        ) : (
          <section aria-label="Your vehicle" className="em-card em-card--warn">
            <span className="em-card__icon"><Car size={20} /></span>
            <span className="em-card__text">
              <strong>Add your car first</strong>
              <span>Providers need it to know what to bring.</span>
            </span>
            <button className="em-card__action" onClick={onVehicle} type="button">Add car</button>
          </section>
        )}
      </main>

      <div className="em-bar">
        {sendError && (
          <div className="em-alert" role="alert">
            {sendError}{" "}
            <a href={`tel:${SUPPORT_PHONE}`}>Call support</a>
          </div>
        )}
        <button className="em-send" disabled={!canSend || sending} onClick={onSend} type="button">
          {sending ? <LoaderCircle className="em-spin" size={22} /> : <LifeBuoy aria-hidden="true" size={22} />}
          {sending ? "Sending…" : "Request help now"}
        </button>
        <p className="em-reassure">Nearby verified providers are alerted. You approve any price before work starts.</p>
      </div>
    </div>
  );
}
