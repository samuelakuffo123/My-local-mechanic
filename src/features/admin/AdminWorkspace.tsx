import "../provider/provider.css";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  History,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { adminService, type AuditLogEntry } from "../../services/admin";
import { providerService } from "../../services/providers";
import type { PlatformMetrics, ProviderProfile } from "../../services/apiTypes";

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

function useAsync<T>(load: () => Promise<T>, initial: T, deps: unknown[]): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: initial, loading: true, error: null });
  const run = useCallback(load, deps);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    run()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => ({
            ...current,
            loading: false,
            error: error instanceof Error ? error.message : "Something went wrong.",
          }));
        }
      });
    return () => {
      active = false;
    };
  }, [run]);
  return state;
}

function DButton({
  children,
  icon: Icon,
  variant = "primary",
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button className={`d-button d-button--${variant}`} disabled={disabled} onClick={onClick} type="button">
      {Icon && <Icon size={17} strokeWidth={1.75} />}
      <span>{children}</span>
    </button>
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
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const metrics = useAsync<PlatformMetrics | null>(() => adminService.metrics(), null, [reloadKey]);
  const pending = useAsync<ProviderProfile[]>(() => providerService.adminList("pending"), [], [reloadKey]);
  const audit = useAsync<AuditLogEntry[]>(() => adminService.audit(5), [], [reloadKey]);
  const m = metrics.data;

  const verify = async (id: string, decision: "verify" | "reject") => {
    setBusy(id);
    setError(null);
    try {
      await providerService.verify(id, decision);
      setReloadKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the provider.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="d-root">
      <div className="d-page">
        <div className="d-page-heading">
          <div>
            <span className="d-kicker">PLATFORM OPERATIONS</span>
            <h2>Admin overview</h2>
            <p>Trust, safety, payments, and marketplace health.</p>
          </div>
          <div className="d-heading-actions">
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
              <History size={16} /> Refresh
            </button>
            <button aria-label="Sign out" className="d-exit" onClick={onExit} type="button">
              <ShieldCheck size={17} /> Sign out
            </button>
          </div>
        </div>
        <div className="d-admin-alert">
          <ShieldCheck size={19} />
          <span>
            <strong>{pending.data.length} provider application{pending.data.length === 1 ? "" : "s"} need review</strong>
            <small>Verification decisions are recorded in the audit trail.</small>
          </span>
          <a href="#provider-verification">Open queue <ArrowRight size={15} /></a>
        </div>
        <div className="d-metric-grid">
          <Metric detail="Registered accounts" icon={Users} label="Users" value={m ? m.users.toLocaleString("en-GH") : "—"} />
          <Metric detail={`${m?.providers.pending ?? 0} pending review`} icon={BadgeCheck} label="Verified providers" tone="green" value={m ? m.providers.verified.toLocaleString("en-GH") : "—"} />
          <Metric detail={`${m?.requests.open ?? 0} open`} icon={Clock3} label="Service requests" tone="violet" value={m ? String(m.requests.total) : "—"} />
          <Metric detail={`${m?.payments.paidCount ?? 0} paid`} icon={Banknote} label="Verified payments" tone="amber" value={m ? formatMoney(m.payments.paidValueGhs) : "—"} />
        </div>
        {metrics.error && <p role="alert">{metrics.error}</p>}
        <div className="d-admin-grid">
          <section className="d-verification" id="provider-verification">
            <div className="d-card-title">
              <div><span>PROVIDER VERIFICATION</span><h3>Application review</h3></div>
              <span className={`d-status ${pending.data.length ? "d-status-warning" : "d-status-repairing"}`}>
                <i />{pending.data.length ? "Needs review" : "Clear"}
              </span>
            </div>
            {error && <p role="alert">{error}</p>}
            {pending.loading && <p className="d-state-note" aria-live="polite">Loading applications…</p>}
            {pending.error && <p role="alert">{pending.error}</p>}
            {!pending.loading && !pending.error && pending.data.length === 0 && (
              <p className="d-state-note">No provider applications are awaiting review.</p>
            )}
            {pending.data.map((provider) => (
              <div className="d-applicant" key={provider.id}>
                <span>{provider.type.slice(0, 2).toUpperCase()}</span>
                <div>
                  <h3>{provider.businessName}</h3>
                  <p>{provider.type} · {provider.region ?? "Region not set"}</p>
                  <small>{provider.serviceAreas.join(", ") || "No service areas listed"}</small>
                </div>
                <div className="d-review-actions">
                  <DButton disabled={busy === provider.id} icon={Check} onClick={() => void verify(provider.id, "verify")} variant="success">Approve</DButton>
                  <DButton disabled={busy === provider.id} onClick={() => void verify(provider.id, "reject")} variant="danger">Reject</DButton>
                </div>
              </div>
            ))}
            <div className="d-privacy-note"><ShieldCheck size={15} /> Documents are private. Access is logged in the audit trail.</div>
          </section>
          <section className="d-ops-metrics">
            <div className="d-card-title"><div><span>TRUST & OPERATIONS</span><h3>Platform totals</h3></div></div>
            {[
              ["Service requests", m ? String(m.requests.total) : "—"],
              ["Open requests", m ? String(m.requests.open) : "—"],
              ["Completed", m ? String(m.requests.completed) : "—"],
              ["Cancelled", m ? String(m.requests.cancelled) : "—"],
              ["Open disputes", m ? String(m.disputes.open) : "—"],
            ].map(([label, value]) => (
              <div className="d-op-metric" key={label}><span>{label}</span><strong>{value}</strong></div>
            ))}
          </section>
        </div>
        <section className="d-audit">
          <div className="d-card-title"><div><span>AUDIT LOG</span><h3>Recent sensitive actions</h3></div></div>
          {audit.loading && <p className="d-state-note" aria-live="polite">Loading audit entries…</p>}
          {audit.error && <p role="alert">{audit.error}</p>}
          {!audit.loading && !audit.error && audit.data.length === 0 && <p className="d-state-note">No audit entries yet.</p>}
          {audit.data.map((entry) => (
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
