import "./providerWorkspace.css";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  LifeBuoy,
  LoaderCircle,
  LogOut,
  MapPin,
  Navigation,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { estimateService } from "../../services/estimates";
import { notificationService } from "../../services/notifications";
import { paymentService } from "../../services/payments";
import { providerService, type ProviderCredential } from "../../services/providers";
import { requestService } from "../../services/requests";
import type {
  AppNotification,
  EstimateSummary,
  ProviderProfile,
  RequestStatus,
  ServiceRequest,
} from "../../services/apiTypes";
import { useAppStore } from "../../state/store";
import { useRemote } from "../../hooks/useRemote";
import { errorMessage } from "../../services/errorMessage";

export type ProviderRole = "mechanic" | "tow" | "vendor";

type Tab = "home" | "jobs" | "activity" | "business";

const ROLES: Record<
  ProviderRole,
  {
    label: string;
    eyebrow: string;
    title: string;
    intro: string;
    jobWord: string;
    jobWordPlural: string;
    Icon: LucideIcon;
    online: string;
    offline: string;
  }
> = {
  mechanic: {
    label: "Mechanic",
    eyebrow: "MECHANIC WORKSPACE",
    title: "Keep every job moving.",
    intro: "New requests, live jobs, quotes and payments in one calm workspace.",
    jobWord: "repair",
    jobWordPlural: "repairs",
    Icon: Wrench,
    online: "Receiving repair requests",
    offline: "Not receiving requests",
  },
  tow: {
    label: "Tow",
    eyebrow: "TOW WORKSPACE",
    title: "Reach drivers faster.",
    intro: "Handle roadside dispatch, live status and recovery jobs on the move.",
    jobWord: "recovery",
    jobWordPlural: "recoveries",
    Icon: Truck,
    online: "Receiving tow requests",
    offline: "Not receiving requests",
  },
  vendor: {
    label: "Parts vendor",
    eyebrow: "PARTS VENDOR",
    title: "Your parts business, ready.",
    intro: "Set up your storefront, verification and local visibility. Parts ordering opens soon.",
    jobWord: "order",
    jobWordPlural: "orders",
    Icon: Package,
    online: "Visible in nearby search",
    offline: "Hidden from nearby search",
  },
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  requested: "Requested",
  accepted: "Accepted",
  enRoute: "En route",
  arrived: "Arrived",
  diagnosing: "Diagnosing",
  awaitingApproval: "Awaiting approval",
  repairing: "Repairing",
  awaitingParts: "Awaiting parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

const LIFECYCLE: RequestStatus[] = [
  "requested",
  "accepted",
  "enRoute",
  "arrived",
  "diagnosing",
  "awaitingApproval",
  "repairing",
  "completed",
];

const QUOTE_STATUSES: RequestStatus[] = ["diagnosing", "awaitingApproval", "repairing", "awaitingParts"];

function formatMoney(value: number) {
  return `GHS ${value.toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Accra",
  }).format(new Date(value));
}

function statusFor(provider: ProviderProfile | null, role: ProviderRole) {
  if (!provider) {
    return {
      tone: "setup",
      title: "Finish setting up",
      copy: "Add your business details so customers and dispatch can find you.",
    };
  }
  if (provider.status === "pending") {
    return {
      tone: "pending",
      title: "Application under review",
      copy: "We’re checking your documents. You’ll be able to go online once approved.",
    };
  }
  if (provider.status === "rejected") {
    return {
      tone: "danger",
      title: "Application needs attention",
      copy: "Review your business details and supporting documents, then resubmit.",
    };
  }
  if (provider.status === "suspended") {
    return {
      tone: "danger",
      title: "Account paused",
      copy: "Contact support to restore access before taking new requests.",
    };
  }
  return {
    tone: "verified",
    title: "Verified business",
    copy: role === "vendor" ? "Your storefront is trusted and ready for nearby discovery." : "Your account is trusted and ready for dispatch.",
  };
}

function StatusPill({ status }: { status: RequestStatus }) {
  return (
    <span className={`pw-request-status pw-request-status--${status}`}>
      <i />
      {STATUS_LABELS[status]}
    </span>
  );
}

function RemoteState({
  loading,
  error,
  empty,
  title,
  copy,
  loadingCopy,
  onRetry,
  skeleton,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  title: string;
  copy: string;
  loadingCopy?: string;
  onRetry?: () => void;
  skeleton?: ReactNode;
}) {
  if (loading) {
    const message = loadingCopy ?? copy;
    if (skeleton) return <SkeletonRegion label={message}>{skeleton}</SkeletonRegion>;
    return (
      <div className="pw-empty" aria-live="polite">
        <LoaderCircle className="pw-spin" size={24} />
        <strong>Loading…</strong>
        <p>{message}</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="pw-empty pw-empty--error" role="alert">
        <AlertCircle size={24} />
        <strong>We couldn’t load this</strong>
        <p>{error}</p>
        {onRetry && <button className="pw-button pw-button--soft" onClick={onRetry} type="button"><RefreshCw size={15} /> Try again</button>}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="pw-empty">
        <Sparkles size={24} />
        <strong>{title}</strong>
        <p>{copy}</p>
      </div>
    );
  }
  return null;
}

function MetricCard({
  label,
  value,
  detail,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  Icon: LucideIcon;
  tone: string;
}) {
  return (
    <article className={`pw-metric pw-metric--${tone}`}>
      <span><Icon size={17} /></span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function MetricGridSkeleton() {
  return (
    <div className="pw-metrics">
      {[0, 1, 2, 3].map((item) => (
        <article className="pw-metric pw-metric--skeleton" key={item}>
          <Skeleton className="pw-skeleton-icon" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--label" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--value" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
        </article>
      ))}
    </div>
  );
}

function JobListSkeleton({ count = 2, incoming = false }: { count?: number; incoming?: boolean }) {
  return (
    <div className="pw-skeleton-stack">
      {incoming && (
        <div className="pw-incoming pw-skeleton-card">
          <div className="pw-incoming__top">
            <Skeleton className="pw-skeleton-icon pw-skeleton-icon--lg" />
            <div className="pw-skeleton-copy">
              <Skeleton className="pw-skeleton-line pw-skeleton-line--label" />
              <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
              <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
            </div>
          </div>
          <div className="pw-incoming__actions">
            <Skeleton className="pw-skeleton-button" />
            <Skeleton className="pw-skeleton-button pw-skeleton-button--quiet" />
          </div>
        </div>
      )}
      {Array.from({ length: count }, (_, index) => (
        <div className="pw-job-row pw-skeleton-job" key={index}>
          <Skeleton className="pw-skeleton-icon" />
          <div className="pw-job-row__body">
            <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
            <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
          </div>
          <Skeleton className="pw-skeleton-pill" />
        </div>
      ))}
    </div>
  );
}

function ActivitySkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="pw-skeleton-stack">
      {Array.from({ length: count }, (_, index) => (
        <article className="pw-activity-row pw-skeleton-activity" key={index}>
          <Skeleton className="pw-skeleton-icon" />
          <div className="pw-skeleton-copy">
            <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
            <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
            <Skeleton className="pw-skeleton-line pw-skeleton-line--meta" />
          </div>
        </article>
      ))}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="pw-panel pw-skeleton-panel">
      <div className="pw-panel__head">
        <div className="pw-skeleton-copy">
          <Skeleton className="pw-skeleton-line pw-skeleton-line--label" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
        </div>
      </div>
      <div className="pw-detail-grid">
        {[0, 1, 2, 3].map((item) => (
          <div key={item}>
            <Skeleton className="pw-skeleton-line pw-skeleton-line--label" />
            <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
          </div>
        ))}
      </div>
      <Skeleton className="pw-skeleton-block" />
    </div>
  );
}

function StatusSkeleton() {
  return (
    <div className="pw-status" role="status" aria-label="Checking your account status">
      <Skeleton className="pw-skeleton-icon" />
      <div className="pw-skeleton-copy">
        <Skeleton className="pw-skeleton-line pw-skeleton-line--heading" />
        <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
      </div>
    </div>
  );
}

function ChecklistSkeleton() {
  return (
    <div className="pw-checklist" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div key={item}>
          <Skeleton className="pw-skeleton-icon" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--detail" />
          <Skeleton className="pw-skeleton-line pw-skeleton-line--meta" />
        </div>
      ))}
    </div>
  );
}

function IncomingCard({
  request,
  busyKey,
  onRespond,
}: {
  request: ServiceRequest;
  busyKey: string | null;
  onRespond: (accept: boolean) => void;
}) {
  const key = `request-${request.id}`;
  const accepting = busyKey === `${key}-accept`;
  const declining = busyKey === `${key}-decline`;
  const busy = accepting || declining;
  return (
    <section className="pw-incoming">
      <div className="pw-incoming__top">
        <span className="pw-incoming__pulse"><LifeBuoy size={20} /></span>
        <div>
          <span className="pw-overline">NEW {request.kind.toUpperCase()} REQUEST</span>
          <h3>{request.problem}</h3>
          <p><MapPin size={13} /> {request.location.label ?? request.region ?? "Location shared on accept"} · {formatTime(request.createdAt)}</p>
        </div>
      </div>
      <div className="pw-incoming__meta">
        <span>{request.ref}</span>
        <span>{request.declineCount > 0 ? `${request.declineCount} previously declined` : "Ready to accept"}</span>
      </div>
      <div className="pw-incoming__actions">
        <button
          className="pw-button pw-button--primary"
          disabled={busy}
          onClick={() => onRespond(true)}
          type="button"
        >
          {accepting ? <LoaderCircle className="pw-spin" size={16} /> : <Check size={16} />}
          {accepting ? "Accepting…" : "Accept job"}
        </button>
        <button className="pw-button pw-button--quiet" disabled={busy} onClick={() => onRespond(false)} type="button">
          {declining && <LoaderCircle className="pw-spin" size={16} />}
          {declining ? "Declining…" : "Decline"}
        </button>
      </div>
    </section>
  );
}

function JobRow({
  request,
  selected,
  onSelect,
}: {
  request: ServiceRequest;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className={`pw-job-row${selected ? " is-selected" : ""}`} onClick={onSelect} type="button">
      <span className="pw-job-row__icon"><ClipboardList size={17} /></span>
      <span className="pw-job-row__body">
        <strong>{request.problem}</strong>
        <small>{request.ref} · {formatDay(request.updatedAt)} · {formatTime(request.updatedAt)}</small>
      </span>
      <StatusPill status={request.status} />
      <ChevronRight className="pw-job-row__chevron" size={16} />
    </button>
  );
}

/** Publishes the provider's position only while the job is active. */
function ShareLocation({ request }: { request: ServiceRequest }) {
  const [sharing, setSharing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const sending = useRef(false);

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(watchId.current);
    }
    watchId.current = null;
    sending.current = false;
    setSharing(false);
    setConnecting(false);
  }, []);

  useEffect(() => stop, [stop, request.id]);

  const start = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setError("Location is not available on this device.");
      return;
    }
    setError(null);
    setMessage("Getting a GPS fix…");
    setSharing(true);
    setConnecting(true);
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        if (sending.current) return;
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        const previous = lastSent.current;
        if (previous && Date.now() - previous.at < 8000 && Math.abs(previous.lat - next.lat) < 0.0003) return;
        sending.current = true;
        void requestService
          .publishLocation(request.id, next)
          .then(() => {
            lastSent.current = { ...next, at: Date.now() };
            setError(null);
            setConnecting(false);
            setMessage(`Sharing live · updated ${formatTime(new Date().toISOString())}`);
          })
          .catch((cause: unknown) => {
            setError(errorMessage(cause, "We couldn't share your location. Check permissions and try again."));
            stop();
          })
          .finally(() => {
            sending.current = false;
          });
      },
      (geoError) => {
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location access is off. Enable it to share your live position."
            : "We couldn't get a GPS fix. Try again in a moment.",
        );
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  };

  return (
    <section className={`pw-share${sharing ? " is-sharing" : ""}`}>
      <span className="pw-share__icon"><Navigation size={17} /></span>
      <div>
        <strong>{sharing ? "Customer can see you moving" : "Share your live position"}</strong>
        <p>
          {error ?? (
            sharing && message ? (
              <span className="pw-inline-busy"><LoaderCircle className="pw-spin" size={13} /> {message}</span>
            ) : (
              message ?? "The customer’s tracking page updates as you travel."
            )
          )}
        </p>
      </div>
      <button aria-busy={connecting} className="pw-button pw-button--soft" onClick={sharing ? stop : start} type="button">
        {connecting && <LoaderCircle className="pw-spin" size={15} />}
        {connecting ? "Connecting…" : sharing ? "Stop" : "Share"}
      </button>
    </section>
  );
}

function JobDetail({
  request,
  role,
  busyKey,
  onAction,
}: {
  request: ServiceRequest;
  role: ProviderRole;
  busyKey: string | null;
  onAction: (key: string, action: () => Promise<unknown>, fallback: string) => Promise<boolean> | void;
}) {
  const assigned = Boolean(request.providerId);
  const actions = useRemote(() => requestService.actions(request.id), [], [request.id, request.version], {
    fallback: "We couldn't check the available job actions. Refresh and try again.",
  });
  const summary = useRemote<EstimateSummary | null>(
    () => estimateService.summary(request.id),
    null,
    [request.id, request.version],
    {
      enabled: assigned,
      fallback: "We couldn't check the quote for this job. Try again.",
    },
  );
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const index = LIFECYCLE.indexOf(request.status);
  const visibleActions = actions.data.filter((to) => to !== "cancelled" && !(request.status === "requested" && to === "accepted"));
  const hasApprovedQuote = Boolean(summary.data?.approvedTotalGhs);
  const canQuote = QUOTE_STATUSES.includes(request.status) && !hasApprovedQuote && !summary.loading;
  const progress = index < 0 ? 0 : (index / (LIFECYCLE.length - 1)) * 100;
  const RoleIcon = ROLES[role].Icon;

  const submitQuote = async (event: FormEvent) => {
    event.preventDefault();
    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(price);
    if (!item.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0 || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      setQuoteError("Add an item, a quantity and a valid price.");
      return;
    }
    setQuoteError(null);
    const submitted = await onAction(
      `quote-${request.id}`,
      () =>
        estimateService.submit(request.id, {
          items: [{ kind: role === "tow" ? "transport" : "other", description: item.trim(), quantity: parsedQuantity, unitPriceGhs: parsedPrice }],
        }),
      "We couldn't send the quote. Check the details and try again.",
    );
    if (submitted !== false) {
      setItem("");
      setPrice("");
      setQuantity("1");
    }
  };

  return (
    <section className="pw-detail">
      <div className="pw-detail__head">
        <span className="pw-detail__icon"><RoleIcon size={20} /></span>
        <div>
          <span className="pw-overline">{request.ref} · {request.kind.toUpperCase()}</span>
          <h3>{request.problem}</h3>
          <p><MapPin size={13} /> {request.location.label ?? request.region ?? "Location shared by customer"}</p>
        </div>
        <StatusPill status={request.status} />
      </div>

      <div className="pw-progress" aria-label={`Job status: ${STATUS_LABELS[request.status]}`}>
        <div className="pw-progress__rail"><i style={{ width: `${progress}%` }} /></div>
        <div className="pw-progress__copy">
          <strong>{STATUS_LABELS[request.status]}</strong>
          <small>
            {request.status === "completed"
              ? "Job closed"
              : request.status === "cancelled"
                ? "Job cancelled"
                : (() => {
                    const steps = LIFECYCLE.length - 1 - Math.max(index, 0);
                    return `${steps} step${steps === 1 ? "" : "s"} to completion`;
                  })()}
          </small>
        </div>
      </div>

      <div className="pw-actions">
        {actions.loading && <span className="pw-hint" aria-live="polite"><LoaderCircle className="pw-spin" size={15} /> Checking valid actions…</span>}
        {actions.error && <span className="pw-inline-error" role="alert">{actions.error} <button onClick={actions.reload} type="button">Retry</button></span>}
        {!actions.loading && !actions.error && visibleActions.length === 0 && (
          <span className="pw-hint">
            <CheckCircle2 size={15} />
            {request.status === "requested" ? "Use Accept job or Decline above." : "No further actions for this job."}
          </span>
        )}
        {!actions.loading && !actions.error && visibleActions.map((to) => {
          const busy = busyKey === `job-${request.id}-${to}`;
          return (
            <button
              className="pw-button pw-button--primary"
              disabled={busyKey !== null}
              key={to}
              onClick={() => onAction(
                `job-${request.id}-${to}`,
                () => requestService.transition(request.id, to),
                "We couldn't move the job to that stage. Refresh and try again.",
              )}
              type="button"
            >
              {busy ? <LoaderCircle className="pw-spin" size={16} /> : <ArrowRight size={16} />}
              {busy ? `Moving to ${STATUS_LABELS[to]}…` : `Move to ${STATUS_LABELS[to]}`}
            </button>
          );
        })}
        {actions.data.includes("cancelled") && (
          <button
            className="pw-button pw-button--danger-text"
            disabled={busyKey !== null}
            onClick={() => onAction(
              `cancel-${request.id}`,
              () => requestService.cancel(request.id, "Cancelled from provider workspace"),
              "We couldn't cancel the job. It may have changed—refresh and try again.",
            )}
            type="button"
          >
            {busyKey === `cancel-${request.id}` && <LoaderCircle className="pw-spin" size={16} />}
            {busyKey === `cancel-${request.id}` ? "Cancelling…" : "Cancel job"}
          </button>
        )}
      </div>

      {assigned && request.status !== "completed" && request.status !== "cancelled" && <ShareLocation request={request} />}

      {assigned && summary.loading && (
        <span className="pw-hint" role="status"><LoaderCircle className="pw-spin" size={15} /> Checking quote status…</span>
      )}
      {assigned && summary.error && (
        <span className="pw-inline-error" role="alert">
          {summary.error} <button onClick={summary.reload} type="button">Retry</button>
        </span>
      )}

      {summary.data && summary.data.approvedTotalGhs > 0 && (
        <div className="pw-quote-summary">
          <span><BadgeCheck size={18} /></span>
          <div>
            <strong>Approved quote · {formatMoney(summary.data.approvedTotalGhs)}</strong>
            <p>{formatMoney(summary.data.paidToDateGhs)} paid so far. Repair can continue when the quote is approved.</p>
          </div>
        </div>
      )}

      {canQuote && (
        <form className="pw-quote" onSubmit={submitQuote}>
          <div className="pw-quote__head"><span><FileCheck2 size={17} /></span><div><strong>Send a quote</strong><p>The customer must approve before repair work continues.</p></div></div>
          <label>
            Item or service
            <input disabled={busyKey !== null} onChange={(event) => setItem(event.target.value)} placeholder={role === "tow" ? "Recovery and transport" : "Brake pads and labour"} value={item} />
          </label>
          <div className="pw-quote__row">
            <label>
              Qty
              <input disabled={busyKey !== null} min="1" onChange={(event) => setQuantity(event.target.value)} type="number" value={quantity} />
            </label>
            <label>
              Price (GHS)
              <input disabled={busyKey !== null} min="1" onChange={(event) => setPrice(event.target.value)} placeholder="0" type="number" value={price} />
            </label>
          </div>
          {quoteError && <p className="pw-inline-error" role="alert">{quoteError}</p>}
          <button className="pw-button pw-button--soft" disabled={busyKey !== null} type="submit">
            {busyKey === `quote-${request.id}` ? <LoaderCircle className="pw-spin" size={16} /> : <Plus size={16} />}
            {busyKey === `quote-${request.id}` ? "Submitting quote…" : "Submit quote"}
          </button>
        </form>
      )}
    </section>
  );
}

function BusinessForm({
  role,
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  role: ProviderRole;
  initial: ProviderProfile | null;
  busy: boolean;
  onSubmit: (input: {
    businessName: string;
    type: ProviderRole;
    region?: string;
    serviceAreas?: string[];
    lat?: number;
    lng?: number;
    address?: string;
  }) => void;
  onCancel?: () => void;
}) {
  const [businessName, setBusinessName] = useState(initial?.businessName ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [areas, setAreas] = useState(initial?.serviceAreas.join(", ") ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [lat, setLat] = useState(initial?.lat != null ? String(initial.lat) : "");
  const [lng, setLng] = useState(initial?.lng != null ? String(initial.lng) : "");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locate = () => {
    if (!("geolocation" in navigator)) {
      setError("Location isn’t available on this device. You can enter coordinates manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(6));
        setLng(position.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("We couldn’t get your location. You can enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsedLat = lat.trim() ? Number(lat) : undefined;
    const parsedLng = lng.trim() ? Number(lng) : undefined;
    if (!businessName.trim()) {
      setError("Add your business name.");
      return;
    }
    if ((parsedLat !== undefined && Number.isNaN(parsedLat)) || (parsedLng !== undefined && Number.isNaN(parsedLng))) {
      setError("Coordinates must be numbers.");
      return;
    }
    setError(null);
    onSubmit({
      businessName: businessName.trim(),
      type: role,
      region: region.trim() || undefined,
      serviceAreas: areas.split(",").map((value) => value.trim()).filter(Boolean),
      lat: parsedLat,
      lng: parsedLng,
      address: address.trim() || undefined,
    });
  };

  return (
    <form className="pw-form" onSubmit={submit}>
      <label>
        Business name
        <input disabled={busy} onChange={(event) => setBusinessName(event.target.value)} placeholder="e.g. Accra Auto Care" value={businessName} />
      </label>
      <div className="pw-form__row">
        <label>
          Region
          <input disabled={busy} onChange={(event) => setRegion(event.target.value)} placeholder="Greater Accra" value={region} />
        </label>
        <label>
          Address
          <input disabled={busy} onChange={(event) => setAddress(event.target.value)} placeholder="Optional" value={address} />
        </label>
      </div>
      <label>
        Service areas
        <input disabled={busy} onChange={(event) => setAreas(event.target.value)} placeholder="Accra, Tema, Adenta" value={areas} />
        <small>Separate each area with a comma.</small>
      </label>
      <div className="pw-form__row">
        <label>
          Latitude
          <input disabled={busy} inputMode="decimal" onChange={(event) => setLat(event.target.value)} placeholder="5.6037" value={lat} />
        </label>
        <label>
          Longitude
          <input disabled={busy} inputMode="decimal" onChange={(event) => setLng(event.target.value)} placeholder="-0.1870" value={lng} />
        </label>
      </div>
      <button className="pw-locate" disabled={locating || busy} onClick={locate} type="button">
        {locating ? <LoaderCircle className="pw-spin" size={16} /> : <MapPin size={16} />}
        {locating ? "Locating…" : "Use my current location"}
      </button>
      {error && <p className="pw-inline-error" role="alert">{error}</p>}
      <div className="pw-form__actions">
        {onCancel && <button className="pw-button pw-button--quiet" disabled={busy} onClick={onCancel} type="button">Cancel</button>}
        <button className="pw-button pw-button--primary" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="pw-spin" size={16} /> : <Check size={16} />}
          {busy ? (initial ? "Saving…" : "Submitting…") : initial ? "Save changes" : "Submit application"}
        </button>
      </div>
    </form>
  );
}

function CredentialForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (input: { documentType: string; documentRef: string; expiresAt?: string }) => void;
  onCancel: () => void;
}) {
  const [documentType, setDocumentType] = useState("Business registration");
  const [documentRef, setDocumentRef] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!documentRef.trim()) {
      setError("Add the document reference or certificate number.");
      return;
    }
    setError(null);
    onSubmit({ documentType, documentRef: documentRef.trim(), expiresAt: expiresAt || undefined });
  };

  return (
    <form className="pw-form pw-form--card" onSubmit={submit}>
      <label>
        Document type
        <select disabled={busy} onChange={(event) => setDocumentType(event.target.value)} value={documentType}>
          <option>Business registration</option>
          <option>Mechanic licence</option>
          <option>Tow operator permit</option>
          <option>Insurance certificate</option>
          <option>Identity document</option>
          <option>Other business document</option>
        </select>
      </label>
      <label>
        Document reference
        <input disabled={busy} onChange={(event) => setDocumentRef(event.target.value)} placeholder="Certificate or licence number" value={documentRef} />
        <small>Uploads open soon. For now, add the reference so an admin can review it.</small>
      </label>
      <label>
        Expiry date
        <input disabled={busy} onChange={(event) => setExpiresAt(event.target.value)} type="date" value={expiresAt} />
      </label>
      {error && <p className="pw-inline-error" role="alert">{error}</p>}
      <div className="pw-form__actions">
        <button className="pw-button pw-button--quiet" disabled={busy} onClick={onCancel} type="button">Cancel</button>
        <button className="pw-button pw-button--primary" disabled={busy} type="submit">
          {busy ? <LoaderCircle className="pw-spin" size={16} /> : <Plus size={16} />}
          {busy ? "Adding…" : "Add document"}
        </button>
      </div>
    </form>
  );
}

function BusinessPanel({
  role,
  profile,
  credentials,
  busyKey,
  loading,
  error,
  onRetry,
  onApply,
  onCredential,
  onAvailability,
}: {
  role: ProviderRole;
  profile: ProviderProfile | null;
  credentials: ProviderCredential[];
  busyKey: string | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onApply: (input: Parameters<BusinessFormProps["onSubmit"]>[0]) => void;
  onCredential: (input: { documentType: string; documentRef: string; expiresAt?: string }) => void;
  onAvailability: (available: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [addingDocument, setAddingDocument] = useState(false);
  const verified = profile?.status === "verified";
  const mismatch = profile != null && profile.type !== role;

  if (loading) return <SkeletonRegion label="Loading business details"><PanelSkeleton /></SkeletonRegion>;

  if (error) {
    return (
      <div className="pw-panel">
        <div className="pw-panel__head">
          <div>
            <span className="pw-overline">BUSINESS PROFILE</span>
            <h2>Business details unavailable</h2>
            <p>We'll show your setup options once the profile loads.</p>
          </div>
        </div>
        <RemoteState
          copy="We couldn't load your business details."
          empty={false}
          error={error}
          loading={false}
          onRetry={onRetry}
          title="Business details unavailable"
        />
      </div>
    );
  }

  if (!profile || editing) {
    return (
      <div className="pw-panel">
        <div className="pw-panel__head">
          <div>
            <span className="pw-overline">{profile ? "UPDATE APPLICATION" : "PROVIDER APPLICATION"}</span>
            <h2>{profile ? "Edit business details" : "Set up your business"}</h2>
            <p>This information helps dispatch match the right jobs to you.</p>
          </div>
        </div>
        <BusinessForm
          busy={busyKey === "apply"}
          initial={profile}
          onCancel={profile ? () => setEditing(false) : undefined}
          onSubmit={(input) => {
            onApply(input);
            setEditing(false);
          }}
          role={role}
        />
      </div>
    );
  }

  const checklist = [
    { label: "Business profile", done: Boolean(profile.businessName) },
    { label: "Verification document", done: credentials.length > 0 },
    { label: "Account verified", done: verified },
    { label: "Service location", done: profile.lat != null && profile.lng != null },
  ];

  return (
    <>
      {mismatch && (
        <div className="pw-alert" role="alert">
          <AlertCircle size={17} />
          <span>Your profile is registered as a {profile.type}. Save this form as a {role} to update it.</span>
          <button onClick={() => setEditing(true)} type="button">Fix</button>
        </div>
      )}
      <div className="pw-panel">
        <div className="pw-panel__head">
          <div>
            <span className="pw-overline">BUSINESS PROFILE</span>
            <h2>{profile.businessName}</h2>
            <p>{profile.region ?? "Region not set"} · {profile.serviceAreas.join(", ") || "No service areas listed"}</p>
          </div>
          <button className="pw-link" onClick={() => setEditing(true)} type="button">Edit</button>
        </div>
        <div className="pw-detail-grid">
          <div><small>Status</small><strong>{profile.status}</strong></div>
          <div><small>Visibility</small><strong>{profile.available ? "Online" : "Offline"}</strong></div>
          <div><small>Rating</small><strong>{profile.rating > 0 ? profile.rating.toFixed(1) : "New"}</strong></div>
          <div><small>Location</small><strong>{profile.lat != null && profile.lng != null ? "Set" : "Not set"}</strong></div>
        </div>
        {verified && (
          <button
            aria-checked={profile.available}
            aria-busy={busyKey === "availability"}
            className={`pw-availability${profile.available ? " is-on" : ""}`}
            disabled={busyKey === "availability"}
            onClick={() => onAvailability(!profile.available)}
            role="switch"
            type="button"
          >
            <span><i>{busyKey === "availability" && <LoaderCircle className="pw-spin" size={12} />}</i></span>
            <div><strong>{profile.available ? ROLES[role].online : ROLES[role].offline}</strong><small>{busyKey === "availability" ? "Updating dispatch status…" : profile.available ? "You can turn this off at any time." : "Turn on when you’re ready for new requests."}</small></div>
          </button>
        )}
      </div>

      <div className="pw-panel">
        <div className="pw-panel__head">
          <div>
            <span className="pw-overline">VERIFICATION</span>
            <h2>Setup progress</h2>
            <p>Everything needed before your business can go live.</p>
          </div>
          <button className="pw-link" disabled={addingDocument} onClick={() => setAddingDocument(true)} type="button"><Plus size={15} /> Document</button>
        </div>
        <div className="pw-checklist">
          {checklist.map((item) => (
            <div className={item.done ? "is-done" : ""} key={item.label}>
              {item.done ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
              <span>{item.label}</span>
              <small>{item.done ? "Done" : "Pending"}</small>
            </div>
          ))}
        </div>
        {addingDocument && (
          <CredentialForm
            busy={busyKey === "credential"}
            onCancel={() => setAddingDocument(false)}
            onSubmit={(input) => {
              onCredential(input);
              setAddingDocument(false);
            }}
          />
        )}
        {credentials.length > 0 && (
          <div className="pw-documents">
            {credentials.map((credential) => (
              <div key={credential.id}>
                <span><FileCheck2 size={16} /></span>
                <div><strong>{credential.documentType}</strong><small>{credential.documentRef}{credential.expiresAt ? ` · expires ${formatDay(credential.expiresAt)}` : ""}</small></div>
                <span className={`pw-doc-status pw-doc-status--${credential.status}`}>{credential.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Named alias keeps the callback signature readable above.
type BusinessFormProps = { onSubmit: (input: {
  businessName: string;
  type: ProviderRole;
  region?: string;
  serviceAreas?: string[];
  lat?: number;
  lng?: number;
  address?: string;
}) => void };

function ActivityPanel({
  notifications,
  loading,
  refreshing,
  error,
  busyKey,
  onMarkRead,
  onReload,
}: {
  notifications: AppNotification[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  busyKey: string | null;
  onMarkRead: (id: string) => void;
  onReload: () => void;
}) {
  return (
    <div className="pw-panel">
      <div className="pw-panel__head">
        <div>
          <span className="pw-overline">NOTIFICATIONS</span>
          <h2>Activity</h2>
          <p>Assignment, status and payment updates for your account.</p>
        </div>
        <button
          aria-label={refreshing ? "Refreshing notifications" : "Refresh notifications"}
          aria-busy={refreshing}
          className="pw-icon-button"
          disabled={loading || refreshing}
          onClick={onReload}
          type="button"
        >
          <RefreshCw className={refreshing ? "pw-spin" : ""} size={17} />
        </button>
      </div>
      <RemoteState
        copy="Your latest updates will appear here."
        empty={notifications.length === 0}
        error={error}
        loading={loading}
        loadingCopy="Loading your latest updates…"
        onRetry={onReload}
        skeleton={<ActivitySkeleton />}
        title="Nothing new yet"
      />
      <div className="pw-activity">
        {notifications.map((notification) => (
          <article className={notification.read ? "" : "is-unread"} key={notification.id}>
            <span><Bell size={16} /></span>
            <div>
              <strong>{notification.title}</strong>
              <p>{notification.body}</p>
              <small>{formatDay(notification.createdAt)} · {formatTime(notification.createdAt)}</small>
            </div>
            {!notification.read && (
              <button
                aria-busy={busyKey === `notification-${notification.id}`}
                disabled={busyKey === `notification-${notification.id}`}
                onClick={() => onMarkRead(notification.id)}
                type="button"
              >
                {busyKey === `notification-${notification.id}` ? <LoaderCircle className="pw-spin" size={14} /> : <Check size={14} />}
                {busyKey === `notification-${notification.id}` ? "Marking…" : "Mark read"}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function VendorStorefront({
  profile,
  credentials,
  nearbyCount,
  loading,
  error,
  onRetry,
  onOpenBusiness,
}: {
  profile: ProviderProfile | null;
  credentials: ProviderCredential[];
  nearbyCount: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onOpenBusiness: () => void;
}) {
  const steps = [
    { label: "Business profile", done: Boolean(profile) },
    { label: "Verification document", done: credentials.length > 0 },
    { label: "Approved by MechNow", done: profile?.status === "verified" },
    { label: "Service location added", done: profile?.lat != null && profile?.lng != null },
  ];
  const ready = steps.every((step) => step.done);

  return (
    <>
      <section className="pw-launch">
        <span className="pw-launch__icon"><Package size={23} /></span>
        <div>
          <span className="pw-overline">PARTS MARKETPLACE</span>
          <h2>Ordering opens soon</h2>
          <p>We’re finishing catalogue and checkout. Set up your store now so drivers can find you from day one.</p>
        </div>
        <span className="pw-launch__tag">COMING SOON</span>
      </section>
      <div className="pw-panel">
        <div className="pw-panel__head">
          <div>
            <span className="pw-overline">LOCAL VISIBILITY</span>
            <h2>{loading ? "Preparing your storefront" : error ? "Visibility unavailable" : ready ? "Your storefront is live" : "Get discovery-ready"}</h2>
            {loading ? (
              <p className="pw-inline-busy"><LoaderCircle className="pw-spin" size={13} /> Checking nearby visibility…</p>
            ) : error ? (
              <p className="pw-inline-error" role="alert">{error} <button onClick={onRetry} type="button">Try again</button></p>
            ) : (
              <p>{nearbyCount} verified parts vendor{nearbyCount === 1 ? " appears" : "s appear"} in nearby search.</p>
            )}
          </div>
          <button className="pw-link" disabled={loading} onClick={onOpenBusiness} type="button">Manage <ArrowRight size={15} /></button>
        </div>
        {loading ? (
          <SkeletonRegion label="Checking storefront setup"><ChecklistSkeleton /></SkeletonRegion>
        ) : (
          <div className="pw-checklist">
            {steps.map((step) => (
              <div className={step.done ? "is-done" : ""} key={step.label}>
                {step.done ? <CheckCircle2 size={17} /> : <Clock3 size={17} />}
                <span>{step.label}</span>
                <small>{step.done ? "Done" : "Pending"}</small>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default function ProviderWorkspaces({
  onExit,
  role,
}: {
  onExit: () => void;
  role: ProviderRole;
}) {
  const config = ROLES[role];
  const user = useAppStore((state) => state.user);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const profileState = useRemote<{ provider: ProviderProfile | null; credentials: ProviderCredential[] }>(
    () => providerService.me(),
    { provider: null, credentials: [] },
    [],
    { fallback: "We couldn't load your provider profile. Check your connection and try again." },
  );
  const requests = useRemote<ServiceRequest[]>(
    () => (role === "vendor" ? Promise.resolve([]) : requestService.list()),
    [],
    [role],
    { fallback: "We couldn't load your jobs. Check your connection and try again." },
  );
  const payments = useRemote(() => paymentService.list(), [], [], {
    fallback: "We couldn't load your payment history. Try again.",
  });
  const notifications = useRemote(() => notificationService.list(), [], [], {
    fallback: "We couldn't load your updates. Try again.",
  });
  const nearby = useRemote(
    () =>
      role === "vendor"
        ? providerService.nearby({
            type: "vendor",
            radiusKm: 50,
            lat: profileState.data.provider?.lat,
            lng: profileState.data.provider?.lng,
          })
        : Promise.resolve([]),
    [],
    [role, profileState.data.provider?.status, profileState.data.provider?.available, profileState.data.provider?.lat, profileState.data.provider?.lng],
    { fallback: "We couldn't check nearby visibility. Try again." },
  );

  const reloadAll = useCallback(() => {
    profileState.reload();
    requests.reload();
    payments.reload();
    notifications.reload();
    nearby.reload();
  }, [nearby, notifications, payments, profileState, requests]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<unknown>, fallback: string): Promise<boolean> => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
        reloadAll();
        return true;
      } catch (cause) {
        setActionError(errorMessage(cause, fallback));
        return false;
      } finally {
        setBusyKey(null);
      }
    },
    [reloadAll],
  );

  const profile = profileState.data.provider;
  const jobs = requests.data;
  const activeJobs = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled");
  const incoming = jobs.find((job) => job.status === "requested") ?? null;
  const selected = jobs.find((job) => job.id === selectedId) ?? activeJobs[0] ?? null;
  const unread = notifications.data.filter((item) => !item.read).length;
  const paidTotal = payments.data.filter((item) => item.status === "paid").reduce((sum, item) => sum + item.amountGhs, 0);
  const status = statusFor(profile, role);
  const verified = profile?.status === "verified";
  const metricsLoading = role === "vendor"
    ? profileState.loading || nearby.loading || notifications.loading
    : profileState.loading || requests.loading || payments.loading || notifications.loading;
  const metricsError = role === "vendor"
    ? nearby.error ?? notifications.error
    : requests.error ?? payments.error ?? notifications.error;
  const RoleIcon = config.Icon;

  useEffect(() => {
    if (activeJobs.length === 0) setSelectedId(null);
  }, [activeJobs.length]);

  const tabs: { id: Tab; label: string; Icon: LucideIcon }[] = useMemo(
    () =>
      role === "vendor"
        ? [
            { id: "home", label: "Storefront", Icon: Store },
            { id: "activity", label: "Activity", Icon: Bell },
            { id: "business", label: "Business", Icon: ShieldCheck },
          ]
        : [
            { id: "home", label: "Overview", Icon: Sparkles },
            { id: "jobs", label: "Jobs", Icon: ClipboardList },
            { id: "activity", label: "Activity", Icon: Bell },
            { id: "business", label: "Business", Icon: ShieldCheck },
          ],
    [role],
  );

  const respond = (accept: boolean) => {
    if (!incoming) return;
    void runAction(
      `request-${incoming.id}-${accept ? "accept" : "decline"}`,
      () => accept ? requestService.accept(incoming.id) : requestService.decline(incoming.id, "Declined from provider workspace"),
      accept
        ? "We couldn't accept the request. It may have been taken—refresh and try again."
        : "We couldn't decline the request. Refresh and try again.",
    );
  };

  const toggleAvailability = (available: boolean) => {
    void runAction(
      "availability",
      () => providerService.setAvailability(available),
      "We couldn't update your dispatch status. Try again.",
    );
  };

  const greeting = new Intl.DateTimeFormat("en-GH", { hour: "numeric", timeZone: "Africa/Accra" }).format(new Date());
  const firstName = (user?.name ?? "there").split(/\s+/)[0];

  return (
    <div className="pw-root" data-role={role}>
      <header className="pw-header">
        <span className="pw-header__mark"><RoleIcon size={21} /></span>
        <div className="pw-header__identity">
          <span className="pw-overline">{config.eyebrow}</span>
          <h1>
            {profileState.loading
              ? <Skeleton className="pw-skeleton-line pw-skeleton-title" />
              : profile?.businessName ?? user?.name ?? config.label}
          </h1>
        </div>
        <button aria-label="Sign out" className="pw-icon-button" onClick={onExit} type="button"><LogOut size={18} /></button>
      </header>

      {profileState.error && (
        <div className="pw-alert" role="alert">
          <AlertCircle size={17} /> <span>{profileState.error}</span>
          <button onClick={profileState.reload} type="button">Try again</button>
        </div>
      )}

      {profileState.loading ? (
        <StatusSkeleton />
      ) : profileState.error ? null : (
        <section className={`pw-status pw-status--${status.tone}`} aria-live="polite">
          <span className="pw-status__icon">{status.tone === "verified" ? <BadgeCheck size={18} /> : <ShieldCheck size={18} />}</span>
          <div><strong>{status.title}</strong><p>{status.copy}</p></div>
          {!verified && <button className="pw-link" onClick={() => setTab("business")} type="button">Review</button>}
        </section>
      )}

      {verified && (
        <button
          aria-checked={profile?.available ?? false}
          aria-busy={busyKey === "availability"}
          className={`pw-online${profile?.available ? " is-on" : ""}`}
          disabled={busyKey === "availability"}
          onClick={() => toggleAvailability(!profile?.available)}
          role="switch"
          type="button"
        >
          <span className="pw-online__dot"><i>{busyKey === "availability" && <LoaderCircle className="pw-spin" size={10} />}</i></span>
          <span>
            <strong>{profile?.available ? config.online : config.offline}</strong>
            <small>{busyKey === "availability" ? "Updating dispatch status…" : role === "vendor" ? "Nearby discovery" : "Dispatch status"}</small>
          </span>
          <span className="pw-online__switch"><i /></span>
        </button>
      )}

      <main className="pw-main" key={tab}>
        {actionError && (
          <div className="pw-alert" role="alert">
            <AlertCircle size={17} /> <span>{actionError}</span>
            <button onClick={() => setActionError(null)} type="button">Dismiss</button>
          </div>
        )}

        {tab === "home" && (
          <>
            <div className="pw-intro">
              <span className="pw-overline">{greeting.toUpperCase()} · {firstName.toUpperCase()}</span>
              <h2>{config.title}</h2>
              <p>{config.intro}</p>
            </div>

            {metricsLoading ? (
              <SkeletonRegion label="Loading workspace metrics"><MetricGridSkeleton /></SkeletonRegion>
            ) : metricsError ? (
              <div className="pw-alert" role="alert">
                <AlertCircle size={17} /> <span>Workspace figures are unavailable right now. {metricsError}</span>
                <button onClick={reloadAll} type="button">Try again</button>
              </div>
            ) : (
              <div className="pw-metrics">
                {role === "vendor" ? (
                  <>
                    <MetricCard Icon={ShieldCheck} detail={profile?.status ?? "Not set"} label="Account" tone="violet" value={verified ? "Verified" : "Pending"} />
                    <MetricCard Icon={FileCheck2} detail={`${profileState.data.credentials.length} added`} label="Documents" tone="blue" value={String(profileState.data.credentials.length)} />
                    <MetricCard Icon={Store} detail="Across nearby search" label="Verified vendors" tone="green" value={String(nearby.data.length)} />
                    <MetricCard Icon={Bell} detail="Waiting for you" label="New updates" tone="amber" value={String(unread)} />
                  </>
                ) : (
                  <>
                    <MetricCard Icon={ClipboardList} detail={`${incoming ? "1 needs a reply" : "All caught up"}`} label="Active jobs" tone="violet" value={String(activeJobs.length)} />
                    <MetricCard Icon={Banknote} detail="Server-verified payments" label="Paid earnings" tone="green" value={formatMoney(paidTotal)} />
                    <MetricCard Icon={CheckCircle2} detail="From your job list" label="Completed" tone="blue" value={String(jobs.filter((job) => job.status === "completed").length)} />
                    <MetricCard Icon={Bell} detail="Waiting for you" label="New updates" tone="amber" value={String(unread)} />
                  </>
                )}
              </div>
            )}

            {role === "vendor" ? (
              <VendorStorefront
                credentials={profileState.data.credentials}
                loading={profileState.loading || nearby.loading}
                error={nearby.error}
                nearbyCount={nearby.data.length}
                onOpenBusiness={() => setTab("business")}
                onRetry={nearby.reload}
                profile={profile}
              />
            ) : (
              <>
                {incoming && verified && <IncomingCard busyKey={busyKey} onRespond={respond} request={incoming} />}
                <div className="pw-section-head">
                  <div><span className="pw-overline">CURRENT WORK</span><h2>Active {config.jobWordPlural}</h2></div>
                  {activeJobs.length > 0 && <button className="pw-link" onClick={() => setTab("jobs")} type="button">View all <ArrowRight size={15} /></button>}
                </div>
                <RemoteState
                  copy={verified ? "Accepted jobs will appear here." : "Verify your account to receive dispatch requests."}
                  empty={!requests.loading && !requests.error && activeJobs.length === 0}
                  error={requests.error}
                  loading={requests.loading}
                  onRetry={requests.reload}
                  skeleton={<JobListSkeleton count={2} incoming={verified} />}
                  title={verified ? `No active ${config.jobWordPlural}` : "Waiting for verification"}
                />
                {!requests.loading && activeJobs.length > 0 && (
                  <div className="pw-job-list">
                    {activeJobs.slice(0, 3).map((job) => (
                      <JobRow key={job.id} onSelect={() => { setSelectedId(job.id); setTab("jobs"); }} request={job} selected={false} />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {tab === "jobs" && role !== "vendor" && (
          <>
            <div className="pw-intro pw-intro--compact">
              <span className="pw-overline">JOB OPERATIONS</span>
              <h2>{config.label} jobs</h2>
              <p>Accept new requests, update status and share your location.</p>
            </div>
            {incoming && verified && <IncomingCard busyKey={busyKey} onRespond={respond} request={incoming} />}
            <div className="pw-section-head">
              <div><span className="pw-overline">YOUR QUEUE</span><h2>{activeJobs.length} active · {jobs.length} total</h2></div>
            </div>
            <RemoteState
              copy={verified ? "Accepted jobs will appear here." : "Verify your account to receive dispatch requests."}
              empty={!requests.loading && !requests.error && jobs.length === 0}
              error={requests.error}
              loading={requests.loading}
              onRetry={requests.reload}
              skeleton={<JobListSkeleton count={3} incoming={verified} />}
              title={verified ? "Your queue is clear" : "Waiting for verification"}
            />
            {!requests.loading && jobs.length > 0 && (
              <div className="pw-job-list">
                {jobs.map((job) => (
                  <JobRow key={job.id} onSelect={() => setSelectedId(job.id)} request={job} selected={selected?.id === job.id} />
                ))}
              </div>
            )}
            {selected && !requests.loading && (
              <JobDetail
                busyKey={busyKey}
                onAction={(key, action, fallback) => runAction(key, action, fallback)}
                request={selected}
                role={role}
              />
            )}
          </>
        )}

        {tab === "activity" && (
          <ActivityPanel
            busyKey={busyKey}
            error={notifications.error}
            loading={notifications.loading}
            refreshing={notifications.refreshing}
            notifications={notifications.data}
            onMarkRead={(id) => void runAction(
              `notification-${id}`,
              () => notificationService.markRead(id),
              "We couldn't mark that update as read. Try again.",
            )}
            onReload={notifications.reload}
          />
        )}

        {tab === "business" && (
          <BusinessPanel
            busyKey={busyKey}
            credentials={profileState.data.credentials}
            loading={profileState.loading}
            error={profileState.error}
            onRetry={profileState.reload}
            onApply={(input) => void runAction(
              "apply",
              () => providerService.apply(input),
              "We couldn't save your business details. Check the details and try again.",
            )}
            onAvailability={toggleAvailability}
            onCredential={(input) => void runAction(
              "credential",
              () => providerService.addCredential(input),
              "We couldn't add that document. Check the reference and try again.",
            )}
            profile={profile}
            role={role}
          />
        )}
      </main>

      <nav aria-label="Provider workspace" className="pw-nav">
        {tabs.map(({ Icon, id, label }) => (
          <button
            aria-current={tab === id ? "page" : undefined}
            className={tab === id ? "is-active" : ""}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            <Icon size={19} />
            <span>{label}</span>
            {id === "activity" && unread > 0 && <i>{unread}</i>}
          </button>
        ))}
      </nav>
    </div>
  );
}
