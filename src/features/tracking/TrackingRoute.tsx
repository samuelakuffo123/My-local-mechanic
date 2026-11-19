import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  Check,
  CircleAlert,
  Clock3,
  MapPin,
  Navigation,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { Link, useParams } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { LiveMap } from "../../components/LiveMap";
import { getDrivingRoute } from "../../services/directions";
import { requestService } from "../../services/requests";
import type { ServiceRequest } from "../../services/apiTypes";
import { useAppStore } from "../../state/store";

const STATUS_LABEL: Record<string, string> = {
  requested: "Finding a provider",
  accepted: "Provider accepted",
  enRoute: "Provider on the way",
  arrived: "Provider arrived",
  diagnosing: "Diagnosing your vehicle",
  awaitingApproval: "Estimate ready to review",
  repairing: "Repair in progress",
  awaitingParts: "Waiting for parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

const LIVE_STEPS = [
  { key: "matched", label: "Matched" },
  { key: "enRoute", label: "On the way" },
  { key: "arrived", label: "Arrived" },
] as const;

function stepIndex(status: string) {
  if (status === "requested") return 0;
  if (status === "accepted") return 1;
  if (status === "enRoute") return 2;
  return 3;
}

/** A provider position is considered live for three minutes after publishing. */
function isFresh(location: ServiceRequest["providerLocation"], maxAgeMs = 180_000) {
  if (!location) return false;
  const updated = Date.parse(location.updatedAt);
  return Number.isFinite(updated) && Date.now() - updated <= maxAgeMs;
}

function lastSeenLabel(location: NonNullable<ServiceRequest["providerLocation"]>) {
  if (!location) return "";
  const updated = Date.parse(location.updatedAt);
  if (!Number.isFinite(updated)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - updated) / 1000));
  if (seconds < 45) return "updated just now";
  const minutes = Math.round(seconds / 60);
  return `updated ${minutes} min ago`;
}

function shortName(name?: string | null) {
  return (name ?? "Assigned provider").replace(/\s*\(demo\)$/i, "");
}

export function TrackingRoute() {
  const { id = "" } = useParams();
  const theme = useAppStore((state) => state.theme);
  const [request, setRequest] = useState<ServiceRequest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelledLocally, setCancelledLocally] = useState(false);
  const [route, setRoute] = useState<Array<[number, number]> | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await requestService.get(id);
      setRequest(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't load this request.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 6000);
    return () => window.clearInterval(timer);
  }, [load]);

  // Keep the "updated 2 min ago" copy honest without waiting for a poll.
  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const status = request?.status ?? "requested";
  const isActive = status !== "completed" && status !== "cancelled";
  const destination =
    request?.location.lat != null && request?.location.lng != null
      ? { lat: request.location.lat, lng: request.location.lng }
      : null;
  const liveLocation: NonNullable<ServiceRequest["providerLocation"]> | null =
    request?.providerLocation && isFresh(request.providerLocation) ? request.providerLocation : null;
  const providerPoint = liveLocation && destination ? { lat: liveLocation.lat, lng: liveLocation.lng } : null;
  const providerLabel = shortName(request?.provider?.businessName);

  // Draw the real approach route from the newest provider position.
  useEffect(() => {
    if (!providerPoint || !destination) {
      setRoute(null);
      return;
    }
    if (stepIndex(status) >= 3) {
      setRoute(null);
      return;
    }
    let active = true;
    void getDrivingRoute(providerPoint, destination).then((result) => {
      if (!active) return;
      setRoute(
        result?.coordinates?.length
          ? result.coordinates
          : [
              [providerPoint.lng, providerPoint.lat],
              [destination.lng, destination.lat],
            ],
      );
    });
    return () => {
      active = false;
    };
  }, [destination?.lat, destination?.lng, providerPoint?.lat, providerPoint?.lng, status]);

  const current = stepIndex(status);
  const progressCopy = useMemo(() => {
    if (!request) return "";
    if (!isActive) return STATUS_LABEL[status] ?? "Closed";
    if (status === "requested") return "We're matching you with the closest verified provider.";
    if (liveLocation) return `${providerLabel} is sharing a live position. The map refreshes every few seconds.`;
    if (current >= 3) return `${providerLabel} is at your location.`;
    return `${providerLabel} accepted. Tracking starts as soon as they share their position.`;
  }, [current, isActive, liveLocation, providerLabel, request, status]);

  const cancel = async () => {
    if (!request) return;
    setCancelling(true);
    try {
      const next = await requestService.cancel(request.id, "Cancelled by customer from live tracking.");
      setRequest(next);
      setCancelledLocally(true);
      setConfirmCancel(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't cancel this request.");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <AppLayout theme={theme}>
      <main className="tracking-page">
        <header className="tracking-page__header">
          <Link aria-label="Back to activity" to="/app/activity">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="auth-kicker">LIVE REQUEST</span>
            <h1>Track provider</h1>
          </div>
          <button aria-label="Refresh tracking" className="tracking-refresh" onClick={() => void load()} type="button">
            <RefreshCw size={17} />
          </button>
        </header>

        {loading && !request ? (
          <section className="tracking-state" role="status">
            <span className="tracking-spinner" aria-hidden="true" />
            <strong>Loading live tracking…</strong>
            <small>Getting the latest status from your provider.</small>
          </section>
        ) : !request ? (
          <section className="tracking-state tracking-state--error">
            <CircleAlert size={24} />
            <strong>We couldn't load this request</strong>
            <small>{error || "The link may have expired, or the request was removed."}</small>
            <Link className="tracking-state__link" to="/app/activity">Back to activity</Link>
          </section>
        ) : (
          <>
            <section className="tracking-hero" aria-label="Provider location map">
              <LiveMap
                user={
                  request.location.lat != null && request.location.lng != null
                    ? {
                        lat: request.location.lat,
                        lng: request.location.lng,
                        label: request.location.label ?? "Your location",
                        kind: "user",
                      }
                    : null
                }
                provider={providerPoint ? { ...providerPoint, label: providerLabel, kind: "provider" } : null}
                route={route}
                height={310}
                followUser
              />
              <div className="tracking-hero__live">
                <span className={`live-dot${liveLocation ? "" : " live-dot--muted"}`} />
                {liveLocation ? "LIVE POSITION" : isActive ? "WAITING FOR POSITION" : STATUS_LABEL[status]?.toUpperCase()}
              </div>
              {liveLocation && (
                <div className="tracking-hero__stamp" key={tick}>
                  <Clock3 size={12} /> {lastSeenLabel(liveLocation)}
                </div>
              )}
            </section>

            <section className="tracking-panel">
              <div className="tracking-panel__handle" aria-hidden="true" />
              <div className="tracking-statusline">
                <span className={`signal-label ${isActive ? "signal-label--green" : "signal-label--blue"}`}>
                  <span /> {STATUS_LABEL[status] ?? "Live update"}
                </span>
                <span className="tracking-ref">{request.ref}</span>
              </div>

              <h2 className="tracking-title">
                {status === "requested"
                  ? "Finding your provider"
                  : status === "accepted"
                    ? "Provider confirmed"
                    : status === "enRoute"
                      ? "Help is on the way"
                      : status === "arrived"
                        ? "Your provider has arrived"
                        : status === "completed"
                          ? "Service completed"
                          : status === "cancelled"
                            ? "Request cancelled"
                            : STATUS_LABEL[status] ?? "Live update"}
              </h2>
              <p className="tracking-copy">{progressCopy}</p>

              {error && (
                <p className="tracking-inline-error" role="alert">
                  <CircleAlert size={15} /> {error}
                </p>
              )}

              <div className="tracking-timeline" aria-label="Request progress">
                {LIVE_STEPS.map((step, index) => {
                  const done = current > index;
                  const active = current === index + 1;
                  return (
                    <div className={`tracking-timeline__step${done ? " is-done" : ""}${active ? " is-active" : ""}`} key={step.key}>
                      <span>{done ? <Check size={11} /> : index + 1}</span>
                      <small>{step.label}</small>
                    </div>
                  );
                })}
              </div>

              <div className="tracking-provider">
                <span className="tracking-provider__avatar">
                  {request.providerId ? providerLabel.slice(0, 2).toUpperCase() : <Wrench size={18} />}
                </span>
                <div className="tracking-provider__body">
                  <strong>{request.providerId ? providerLabel : "Matching you now"}</strong>
                  <small>
                    {request.providerId ? (
                      <><BadgeCheck size={12} fill="currentColor" /> Verified provider</>
                    ) : (
                      "Closest available provider"
                    )}
                  </small>
                  <p>{request.problem || "Roadside assistance"}</p>
                </div>
                {request.providerId && (
                  <span className={`tracking-provider__signal${liveLocation ? " is-live" : ""}`}>
                    <Navigation size={13} />
                    {liveLocation ? "Live" : "Soon"}
                  </span>
                )}
              </div>

              <div className="tracking-place">
                <span><MapPin size={16} /></span>
                <div>
                  <small>MEETING POINT</small>
                  <strong>{request.location.label ?? "Shared location"}</strong>
                </div>
              </div>

              <div className="tracking-note">
                <ShieldCheck size={17} />
                <span>
                  <strong>{liveLocation ? "Live location is being shared" : "Only your assigned provider sees your location"}</strong>
                  <small>
                    {liveLocation
                      ? "Coordinates are approximate and update while the job is active."
                      : "You'll see the provider's position here the moment they start sharing."}
                  </small>
                </span>
              </div>

              {isActive && !confirmCancel && !cancelledLocally && (
                <button className="tracking-cancel" onClick={() => setConfirmCancel(true)} type="button">
                  Cancel request
                </button>
              )}

              {confirmCancel && (
                <div className="tracking-cancel-confirm" role="alertdialog" aria-label="Confirm cancellation">
                  <strong>Cancel this request?</strong>
                  <small>Your provider may already be on the way.</small>
                  <div>
                    <button className="is-danger" disabled={cancelling} onClick={() => void cancel()} type="button">
                      {cancelling ? "Cancelling…" : "Yes, cancel"}
                    </button>
                    <button disabled={cancelling} onClick={() => setConfirmCancel(false)} type="button">
                      Keep tracking
                    </button>
                  </div>
                </div>
              )}

              <Link className="tracking-back" to="/app/activity">
                View all activity
              </Link>
            </section>
          </>
        )}
      </main>
    </AppLayout>
  );
}
