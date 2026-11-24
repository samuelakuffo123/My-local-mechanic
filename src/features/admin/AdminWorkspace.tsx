import "../provider/provider.css";
import "./admin.css";
import { useCallback, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  History,
  LoaderCircle,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Skeleton, SkeletonRegion } from "../../components/Skeleton";
import { adminService, type AuditLogEntry } from "../../services/admin";
import { providerService } from "../../services/providers";
import type { PlatformMetrics, ProviderProfile } from "../../services/apiTypes";
import { useRemote } from "../../hooks/useRemote";
import { errorMessage } from "../../services/errorMessage";

function DButton({
  children,
  icon: Icon,
  variant = "primary",
  onClick,
  disabled,
  busy,
  busyLabel,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  onClick?: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
}) {
  return (
    <button aria-busy={busy} className={`d-button d-button--${variant}`} disabled={disabled || busy} onClick={onClick} type="button">
      {busy ? <LoaderCircle className="ui-spin" size={15} /> : Icon ? <Icon size={17} strokeWidth={1.75} /> : null}
      <span>{busy ? busyLabel ?? children : children}</span>
    </button>
  );
}

function DError({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <p className="d-error-note" role="alert">
      <AlertCircle size={15} />
      <span>{message}</span>
      {onRetry && <button onClick={onRetry} type="button">Try again</button>}
      {onDismiss && <button onClick={onDismiss} type="button">Dismiss</button>}
    </p>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: string;
}) {
  return (
    <article className="d-metric">
      <span className={`d-icon d-tone-${tone}`}><Icon size={19} /></span>
      <div><small>{label}</small><strong>{value}</strong><p>{detail}</p></div>
    </article>
  );
}

function AdminMetricSkeleton() {
  return (
    <div className="d-metric-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <article className="d-metric" key={item}>
          <Skeleton className="d-skeleton-icon" />
          <div className="d-skeleton-copy">
            <Skeleton className="d-skeleton-line d-skeleton-line--label" />
            <Skeleton className="d-skeleton-line d-skeleton-line--value" />
            <Skeleton className="d-skeleton-line d-skeleton-line--detail" />
          </div>
        </article>
      ))}
    </div>
  );
}

function ApplicantSkeleton() {
  return (
    <>
      {[0, 1].map((item) => (
        <div className="d-applicant d-skeleton-applicant" key={item} aria-hidden="true">
          <Skeleton className="d-skeleton-avatar" />
          <div className="d-skeleton-copy">
            <Skeleton className="d-skeleton-line d-skeleton-line--heading" />
            <Skeleton className="d-skeleton-line d-skeleton-line--detail" />
            <Skeleton className="d-skeleton-line d-skeleton-line--meta" />
          </div>
          <div className="d-review-actions">
            <Skeleton className="d-skeleton-button" />
            <Skeleton className="d-skeleton-button" />
          </div>
        </div>
      ))}
    </>
  );
}

function AuditSkeleton() {
  return (
    <div className="d-audit-skeleton" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="d-audit-skeleton-row" key={item}>
          <Skeleton className="d-skeleton-icon d-skeleton-icon--small" />
          <Skeleton className="d-skeleton-line d-skeleton-line--detail" />
          <Skeleton className="d-skeleton-line d-skeleton-line--meta" />
          <Skeleton className="d-skeleton-line d-skeleton-line--meta" />
        </div>
      ))}
    </div>
  );
}

function initialsOf(name: string) {
  const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase() || "?";
}

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

export default function AdminWorkspace({ onExit }: { onExit: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metrics = useRemote<PlatformMetrics | null>(() => adminService.metrics(), null, [], {
    fallback: "We couldn't load platform metrics. Check your connection and try again.",
  });
  const pending = useRemote<ProviderProfile[]>(() => providerService.adminList("pending"), [], [], {
    fallback: "We couldn't load provider applications. Check your connection and try again.",
  });
  const audit = useRemote<AuditLogEntry[]>(() => adminService.audit(5), [], [], {
    fallback: "We couldn't load the audit log. Check your connection and try again.",
  });
  const m = metrics.data;
  const refreshAll = useCallback(() => {
    metrics.reload();
    pending.reload();
    audit.reload();
  }, [audit, metrics, pending]);
  const refreshing = metrics.refreshing || pending.refreshing || audit.refreshing;

  const verify = async (id: string, decision: "verify" | "reject") => {
    const key = `verify-${id}-${decision}`;
    setBusy(key);
    setError(null);
    try {
      await providerService.verify(id, decision);
      refreshAll();
    } catch (cause) {
      setError(errorMessage(cause, "We couldn't update that application. Refresh and try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="d-root ad-root">
      <div className="d-page">
        <div className="d-page-heading">
          <div>
            <span className="d-kicker">PLATFORM OPERATIONS</span>
            <h2>Admin overview</h2>
            <p>Trust, safety, payments, and marketplace health.</p>
          </div>
          <div className="d-heading-actions">
            <button aria-busy={refreshing} disabled={refreshing} type="button" onClick={refreshAll}>
              <RefreshCw className={refreshing ? "ui-spin" : ""} size={16} /> {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button aria-label="Sign out" className="d-exit" onClick={onExit} type="button">
              <LogOut size={17} /> Sign out
            </button>
          </div>
        </div>
        <div className="d-admin-alert">
          {pending.error ? <AlertCircle size={19} /> : <ShieldCheck size={19} />}
          <span>
            <strong>
              {pending.loading
                ? "Checking provider applications…"
                : pending.error
                  ? "Provider applications unavailable"
                  : `${pending.data.length} provider application${pending.data.length === 1 ? " needs" : "s need"} review`}
            </strong>
            <small>
              {pending.loading
                ? "Loading the verification queue."
                : pending.error
                  ? pending.error
                  : "Verification decisions are recorded in the audit trail."}
            </small>
          </span>
          {!pending.loading && !pending.error && <a href="#provider-verification">Open queue <ArrowRight size={15} /></a>}
        </div>
        {metrics.loading ? (
          <SkeletonRegion label="Loading platform metrics"><AdminMetricSkeleton /></SkeletonRegion>
        ) : metrics.error && !m ? (
          <DError message={metrics.error} onRetry={metrics.reload} />
        ) : (
          <>
            {metrics.error && <DError message={metrics.error} onRetry={metrics.reload} />}
            <div aria-busy={metrics.refreshing} className="d-metric-grid">
              <Metric detail="Registered accounts" icon={Users} label="Users" value={m ? m.users.toLocaleString("en-GH") : "—"} />
              <Metric detail={`${m?.providers.pending ?? 0} pending review`} icon={BadgeCheck} label="Verified providers" tone="green" value={m ? m.providers.verified.toLocaleString("en-GH") : "—"} />
              <Metric detail={`${m?.requests.open ?? 0} open`} icon={Clock3} label="Service requests" tone="violet" value={m ? String(m.requests.total) : "—"} />
              <Metric detail={`${m?.payments.paidCount ?? 0} paid`} icon={Banknote} label="Verified payments" tone="amber" value={m ? formatMoney(m.payments.paidValueGhs) : "—"} />
            </div>
          </>
        )}
        <div className="d-admin-grid">
          <section className="d-verification" id="provider-verification">
            <div className="d-card-title">
              <div><span>PROVIDER VERIFICATION</span><h3>Application review</h3></div>
              {pending.loading ? (
                <Skeleton className="d-skeleton-status" />
              ) : pending.error ? (
                <span className="d-status d-status-error"><i />Unavailable</span>
              ) : (
                <span className={`d-status ${pending.data.length ? "d-status-warning" : "d-status-repairing"}`}>
                  <i />{pending.data.length ? "Needs review" : "Clear"}
                </span>
              )}
            </div>
            {error && <DError message={error} onDismiss={() => setError(null)} />}
            {pending.loading && <SkeletonRegion label="Loading provider applications"><ApplicantSkeleton /></SkeletonRegion>}
            {pending.error && <DError message={pending.error} onRetry={pending.reload} />}
            {!pending.loading && !pending.error && pending.data.length === 0 && (
              <p className="d-state-note">No provider applications are awaiting review.</p>
            )}
            {!pending.loading && !pending.error && pending.data.map((provider) => (
              <div className="d-applicant" key={provider.id}>
                <span aria-hidden="true">{initialsOf(provider.businessName)}</span>
                <div>
                  <h3>{provider.businessName}</h3>
                  <p>{provider.type} · {provider.region ?? "Region not set"}</p>
                  <small>{provider.serviceAreas.join(", ") || "No service areas listed"}</small>
                </div>
                <div className="d-review-actions">
                  <DButton
                    busy={busy === `verify-${provider.id}-verify`}
                    busyLabel="Approving…"
                    disabled={busy !== null}
                    icon={Check}
                    onClick={() => void verify(provider.id, "verify")}
                    variant="success"
                  >
                    Approve
                  </DButton>
                  <DButton
                    busy={busy === `verify-${provider.id}-reject`}
                    busyLabel="Rejecting…"
                    disabled={busy !== null}
                    onClick={() => void verify(provider.id, "reject")}
                    variant="danger"
                  >
                    Reject
                  </DButton>
                </div>
              </div>
            ))}
            <div className="d-privacy-note"><ShieldCheck size={15} /> Documents are private. Access is logged in the audit trail.</div>
          </section>
          <section className="d-ops-metrics">
            <div className="d-card-title"><div><span>TRUST & OPERATIONS</span><h3>Platform totals</h3></div></div>
            {metrics.loading ? (
              <SkeletonRegion label="Loading platform totals">
                <div aria-hidden="true">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <div className="d-op-metric" key={item}>
                      <Skeleton className="d-skeleton-line d-skeleton-line--detail" />
                      <Skeleton className="d-skeleton-line d-skeleton-line--meta" />
                    </div>
                  ))}
                </div>
              </SkeletonRegion>
            ) : metrics.error ? (
              <p className="d-state-note">Platform totals are unavailable. Try refreshing the page.</p>
            ) : (
              [
                ["Service requests", m ? String(m.requests.total) : "—"],
                ["Open requests", m ? String(m.requests.open) : "—"],
                ["Completed", m ? String(m.requests.completed) : "—"],
                ["Cancelled", m ? String(m.requests.cancelled) : "—"],
                ["Open disputes", m ? String(m.disputes.open) : "—"],
              ].map(([label, value]) => (
                <div className="d-op-metric" key={label}><span>{label}</span><strong>{value}</strong></div>
              ))
            )}
          </section>
        </div>
        <section className="d-audit">
          <div className="d-card-title"><div><span>AUDIT LOG</span><h3>Recent sensitive actions</h3></div></div>
          {audit.loading && <SkeletonRegion label="Loading audit entries"><AuditSkeleton /></SkeletonRegion>}
          {audit.error && <DError message={audit.error} onRetry={audit.reload} />}
          {!audit.loading && !audit.error && audit.data.length === 0 && <p className="d-state-note">No audit entries yet.</p>}
          {!audit.loading && !audit.error && audit.data.map((entry) => (
            <div key={entry.id}>
              <span><History size={16} /></span>
              <strong>{entry.action.replace(/_/g, " ")}</strong>
              <small>{entry.actorRole ?? "system"}</small>
              <time>{formatTime(entry.createdAt)}</time>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
