import { LifeBuoy, Navigation, Phone } from "lucide-react";
import { SUPPORT_PHONE } from "./EmergencyRequestScreen";
import "./emergency.css";

/** The first thing on the home screen: one big, obvious way to get help. */
export function EmergencyHero({
  providersOnline,
  onRequest,
  onTrack,
}: {
  providersOnline: number;
  onRequest: () => void;
  /** When set, a request is already active and tracking replaces "get help". */
  onTrack?: () => void;
}) {
  return (
    <section aria-label="Emergency help" className="em-hero">
      <p className="em-hero__status">
        <span aria-hidden="true" className="em-hero__dot" />
        {onTrack
          ? "Your request is active"
          : providersOnline > 0
            ? `${providersOnline} verified ${providersOnline === 1 ? "provider" : "providers"} online near you`
            : "Verified providers across Accra"}
      </p>
      <h2>{onTrack ? "Help is being arranged" : "Stuck on the road?"}</h2>
      {onTrack ? (
        <button className="em-hero__cta em-hero__cta--track" onClick={onTrack} type="button">
          <Navigation aria-hidden="true" size={22} /> Track your request
        </button>
      ) : (
        <button className="em-hero__cta" onClick={onRequest} type="button">
          <LifeBuoy aria-hidden="true" size={22} /> Get help now
        </button>
      )}
      <div className="em-hero__alt">
        <a href="tel:112"><Phone aria-hidden="true" size={15} /> Call 112</a>
        <a href={`tel:${SUPPORT_PHONE}`}><Phone aria-hidden="true" size={15} /> Call support</a>
      </div>
    </section>
  );
}
