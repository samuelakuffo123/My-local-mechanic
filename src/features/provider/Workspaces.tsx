import "./provider.css";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Banknote,
  BarChart3,
  Bell,
  CalendarDays,
  Car,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  Filter,
  Gauge,
  Headphones,
  History,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  Package,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Truck,
  UserRound,
  Users,
  Warehouse,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import providerPhoto from "../../assets/mechanic.jpg";
import { requestService } from "../../services/requests";
import { adminService, type AuditLogEntry } from "../../services/admin";
import { providerService } from "../../services/providers";
import type { PlatformMetrics, ProviderProfile, RequestStatus, ServiceRequest } from "../../services/apiTypes";

const today = new Date();
const currentMonth = new Intl.DateTimeFormat("en-GH", { month: "long", year: "numeric", timeZone: "Africa/Accra" }).format(today).toUpperCase();
const certificateExpiry = new Intl.DateTimeFormat("en-GH", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" }).format(new Date(today.getTime() + 300 * 864e5));
const currentYear = today.getFullYear();

const statusLabels: Record<RequestStatus, string> = {
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

const statusSlugs: Partial<Record<RequestStatus, string>> = {
  enRoute: "en-route",
  awaitingApproval: "awaiting-approval",
  awaitingParts: "awaiting-parts",
};

function statusClass(status: RequestStatus) {
  return `d-status d-status-${statusSlugs[status] ?? status.toLowerCase()}`;
}

function formatMoney(value: number) {
  return `GHS ${value.toLocaleString("en-GH", { maximumFractionDigits: 0 })}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GH", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Accra" }).format(new Date(value));
}

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
      .then((data) => { if (active) setState({ data, loading: false, error: null }); })
      .catch((error: unknown) => { if (active) setState((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Something went wrong." })); });
    return () => { active = false; };
  }, [run]);
  return state;
}

type Workspace = "mechanic" | "tow" | "vendor" | "fleet" | "admin" | "owner" | "handoff";
type MechanicView = "overview" | "jobs" | "calendar" | "inventory";

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

function Topbar({ title, eyebrow, onExit }: { title: string; eyebrow: string; onExit: () => void }) {
  return (
    <header className="d-topbar">
      <div><span>{eyebrow}</span><h1>{title}</h1></div>
      <label><Search size={17} /><input aria-label="Search workspace" placeholder="Search jobs, customers, vehicles…" /><kbd>⌘ K</kbd></label>
      <button aria-label="Notifications" type="button" disabled><Bell size={19} /><i /></button>
      <div className="d-user"><span>KM</span><div><strong>Kojo Mensah</strong><small>Kojo AutoCare</small></div><ChevronDown size={15} /></div>
      <button aria-label="Exit operations workspace" className="d-exit" onClick={onExit} type="button"><X size={19} /></button>
    </header>
  );
}

function Sidebar({
  view,
  setView,
}: {
  view: MechanicView;
  setView: (view: MechanicView) => void;
}) {
  const items: { view: MechanicView; label: string; icon: LucideIcon; badge?: string }[] = [
    { view: "overview", label: "Overview", icon: LayoutDashboard },
    { view: "jobs", label: "Jobs", icon: Wrench, badge: "6" },
    { view: "calendar", label: "Appointments", icon: CalendarDays },
    { view: "inventory", label: "Inventory", icon: Warehouse, badge: "3" },
  ];
  return (
    <aside className="d-sidebar">
      <div className="d-brand"><span><Navigation size={17} fill="currentColor" /></span><strong>mechnow</strong><em>PRO</em></div>
      <nav>
        <span>WORKSPACE</span>
        {items.map(({ view: itemView, label, icon: Icon, badge }) => (
          <button className={view === itemView ? "active" : ""} key={label} onClick={() => setView(itemView)} type="button">
            <Icon size={18} /><span>{label}</span>{badge && <em>{badge}</em>}
          </button>
        ))}
        <span>BUSINESS</span>
        {[
          ["Messages", MessageCircle, "4"],
          ["Customers", Users, ""],
          ["Services", Settings, ""],
          ["Earnings", Banknote, ""],
          ["Reviews", Star, ""],
        ].map(([label, Icon, badge]) => {
          const ItemIcon = Icon as LucideIcon;
          return <button key={label as string} type="button" disabled><ItemIcon size={18} /><span>{label as string}</span>{badge && <em>{badge as string}</em>}</button>;
        })}
      </nav>
      <div className="d-sidebar-footer"><span><BadgeCheck size={17} fill="currentColor" /></span><div><strong>Verified business</strong><small>All checks current</small></div><ChevronRight size={15} /></div>
    </aside>
  );
}

function EmergencyRequest({ request, onChanged }: { request: ServiceRequest | null; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!request) return null;

  const respond = async (accept: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (accept) await requestService.accept(request.id);
      else await requestService.decline(request.id, "Declined from workspace");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not respond to the request.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="d-emergency-request">
      <div className="d-request-pulse"><LifeBuoy size={21} /><span /></div>
      <div className="d-request-main">
        <div><span>NEW {request.kind.toUpperCase()} REQUEST</span><strong>{request.problem}</strong><small>{request.location.label ?? request.region ?? "Location shared on accept"}</small></div>
        <div className="d-request-customer"><span>MN</span><div><strong>Awaiting assignment</strong><small>{request.ref}</small></div></div>
      </div>
      <div className="d-request-actions">{error && <span role="alert">{error}</span>}<DButton disabled={busy} icon={Check} onClick={() => void respond(true)} variant="success">Accept</DButton><DButton disabled={busy} onClick={() => void respond(false)} variant="secondary">Decline</DButton></div>
    </article>
  );
}

function RevenueChart() {
  const values = [32, 48, 38, 67, 56, 78, 72];
  return (
    <div className="d-chart" aria-label="Revenue for the last seven days">
      <div className="d-chart-head"><div><span>Revenue</span><strong>GHS 8,420</strong><small>+12.4% vs previous week</small></div><button type="button" disabled>Last 7 days <ChevronDown size={14} /></button></div>
      <div className="d-chart-plot">
        <div className="d-axis"><span>2k</span><span>1k</span><span>0</span></div>
        <div className="d-bars">{values.map((value, i) => <div key={i}><span style={{ height: `${value}%` }} /><small>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}</small></div>)}</div>
      </div>
    </div>
  );
}

function MechanicOverview({ openJobs, jobs, incoming, onChanged }: { openJobs: () => void; jobs: ServiceRequest[]; incoming: ServiceRequest | null; onChanged: () => void }) {
  const active = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled").length;
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">PROVIDER WORKSPACE</span><h2>Your operations.</h2><p>Here's what needs your attention today.</p></div><DButton icon={Plus}>Create appointment</DButton></div>
      <div className="d-metric-grid">
        <Metric detail={`${active} currently active`} icon={Wrench} label="Active jobs" value={String(active)} />
        <Metric detail="Scheduled bookings" icon={CalendarDays} label="Bookings" tone="violet" value={String(jobs.filter((job) => job.kind === "booking").length)} />
        <Metric detail="Completed jobs" icon={CircleDollarSign} label="Completed" tone="green" value={String(jobs.filter((job) => job.status === "completed").length)} />
        <Metric detail={`${jobs.length} total requests`} icon={Star} label="All jobs" tone="amber" value={String(jobs.length)} />
      </div>
      <EmergencyRequest onChanged={onChanged} request={incoming} />
      <div className="d-dashboard-grid">
        <RevenueChart />
        <section className="d-performance">
          <div className="d-card-title"><div><span>PERFORMANCE</span><h3>This month</h3></div><button aria-label="More performance options" type="button" disabled><MoreHorizontal size={18} /></button></div>
          {[["Response rate", "94%", 94], ["Acceptance rate", "87%", 87], ["On-time arrival", "91%", 91], ["Job completion", "98%", 98]].map(([label, value, width]) => <div className="d-progress-row" key={label as string}><span><strong>{label as string}</strong><em>{value as string}</em></span><i><b style={{ width: `${width}%` }} /></i></div>)}
          <p><Zap size={14} /> Response time improved by 1m 12s this month.</p>
        </section>
      </div>
      <section className="d-jobs-card">
        <div className="d-card-title"><div><span>TODAY'S WORK</span><h3>Active jobs</h3></div><button onClick={openJobs} type="button">View all <ArrowRight size={15} /></button></div>
        <JobTable compact jobs={jobs} />
      </section>
    </div>
  );
}

const jobStates = ["Requested", "Accepted", "En route", "Arrived", "Diagnosing", "Awaiting approval", "Repairing", "Awaiting parts", "Completed"];
const jobStateOrder: RequestStatus[] = ["requested", "accepted", "enRoute", "arrived", "diagnosing", "awaitingApproval", "repairing", "awaitingParts", "completed"];

function JobStateMachine({ request, onChanged }: { request: ServiceRequest | null; onChanged: () => void }) {
  const actions = useAsync<RequestStatus[]>(() => (request ? requestService.actions(request.id) : Promise.resolve([])), [], [request?.id]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!request) {
    return (
      <section className="d-state-machine">
        <div className="d-card-title"><div><span>JOB LIFECYCLE</span><h3>Valid next actions</h3></div><span className="d-live-badge"><i /> IDLE</span></div>
        <p className="d-state-note"><ShieldCheck size={14} /> Select an active job to see its valid next actions. States cannot be skipped.</p>
      </section>
    );
  }

  const state = jobStateOrder.indexOf(request.status);
  const advance = async (to: RequestStatus) => {
    setBusy(true);
    setError(null);
    try {
      await requestService.transition(request.id, to);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the job.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="d-state-machine">
      <div className="d-card-title"><div><span>JOB {request.ref} · {request.problem.toUpperCase()}</span><h3>Valid next actions</h3></div><span className="d-live-badge"><i /> ACTIVE</span></div>
      <div className="d-state-track">
        {jobStates.map((label, index) => (
          <div className={index < state ? "done" : index === state ? "current" : ""} key={label}>
            <span>{index < state ? <Check size={12} /> : index + 1}</span><small>{label}</small>
          </div>
        ))}
      </div>
      <div className="d-state-action">
        <div><span>CURRENT STATUS</span><strong>{statusLabels[request.status]}</strong><small>Only valid next actions are enabled. A licence plate is required before a diagnosis.</small></div>
        {actions.loading && <span className="d-complete-chip">Checking…</span>}
        {!actions.loading && actions.data.length === 0 && <span className="d-complete-chip"><CheckCircle2 size={16} /> No further actions</span>}
        {!actions.loading && actions.data.map((to) => <DButton disabled={busy} key={to} onClick={() => void advance(to)}>{`Move to ${statusLabels[to]}`}</DButton>)}
      </div>
      {error && <p role="alert">{error}</p>}
      <p className="d-state-note"><ShieldCheck size={14} /> States cannot be skipped. Cancelled is available only before repair; Disputed is available after completion.</p>
    </section>
  );
}

function JobTable({ jobs, compact = false }: { jobs: ServiceRequest[]; compact?: boolean }) {
  if (jobs.length === 0) return <p className="d-state-note">No jobs yet. Service requests you accept will appear here.</p>;
  return (
    <div className="d-table-wrap">
      <table className="d-table">
        <thead><tr><th>Job</th><th>Service</th><th>Location</th><th>Status</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{jobs.slice(0, compact ? 3 : 8).map((job) => <tr key={job.id}><td><strong>{job.ref}</strong></td><td><strong>{job.problem}</strong><small>{job.kind}</small></td><td>{job.location.label ?? job.region ?? "—"}</td><td><span className={statusClass(job.status)}><i />{statusLabels[job.status]}</span></td><td>{formatTime(job.updatedAt)}</td><td><button aria-label={`View ${job.ref}`} type="button" disabled><ChevronRight size={16} /></button></td></tr>)}</tbody>
      </table>
    </div>
  );
}

function MechanicJobs({ jobs, onChanged }: { jobs: ServiceRequest[]; onChanged: () => void }) {
  const active = jobs.filter((job) => job.status !== "completed" && job.status !== "cancelled");
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">JOB OPERATIONS</span><h2>Jobs</h2><p>Track work through the approved service lifecycle.</p></div><div className="d-heading-actions"><DButton icon={Filter} variant="secondary">Filter</DButton><DButton icon={Plus}>New job</DButton></div></div>
      <JobStateMachine onChanged={onChanged} request={active[0] ?? null} />
      <section className="d-jobs-card"><div className="d-card-title"><div><span>ALL JOBS</span><h3>{active.length} active · {jobs.length} total</h3></div><div className="d-segment"><button className="active" type="button" disabled>Active</button><button type="button" disabled>Scheduled</button><button type="button" disabled>Completed</button></div></div><JobTable jobs={jobs} /></section>
    </div>
  );
}

function CalendarView() {
  const times = ["8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "1 PM", "2 PM", "3 PM", "4 PM"];
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">{currentMonth}</span><h2>Appointments</h2><p>5 appointments today · Africa/Accra (GMT)</p></div><DButton icon={Plus}>New appointment</DButton></div>
      <section className="d-calendar">
        <div className="d-calendar-head"><button type="button" disabled><ArrowLeft size={17} /></button><strong>Mon, 20 October</strong><button type="button" disabled><ArrowRight size={17} /></button><div><button className="active" type="button" disabled>Day</button><button type="button" disabled>Week</button><button type="button" disabled>Month</button></div></div>
        <div className="d-calendar-grid">{times.map((time, i) => <div className="d-calendar-row" key={time}><span>{time}</span><i />{[1,3,5,7].includes(i) && <article className={i === 3 ? "emergency" : ""} style={{ left: `${i % 2 ? 18 : 5}%`, width: `${i % 2 ? 55 : 42}%` }}><small>{i === 3 ? "EMERGENCY · 11:05 AM" : `${time.replace(" ", ":30 ")} · 45 MIN`}</small><strong>{i === 1 ? "Brake inspection" : i === 3 ? "Car won't start" : i === 5 ? "Routine service" : "Vehicle diagnostics"}</strong><span>{i === 1 ? "Ama Owusu · Honda Civic" : i === 3 ? "Kwame Asante · Toyota Corolla" : i === 5 ? "Esi Mensah · Hyundai Elantra" : "Nii Laryea · Nissan Sentra"}</span></article>}</div>)}</div>
      </section>
    </div>
  );
}

function MechanicInventory() {
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">PARTS & SUPPLIES</span><h2>Inventory</h2><p>3 items need attention across 148 SKUs.</p></div><DButton icon={Plus}>Add item</DButton></div>
      <div className="d-metric-grid d-metric-grid--three"><Metric detail="Across 148 SKUs" icon={Warehouse} label="Inventory value" value="GHS 84,200" /><Metric detail="Reorder recommended" icon={AlertTriangle} label="Low stock" tone="amber" value="3" /><Metric detail="This calendar month" icon={Package} label="Parts used" tone="green" value="46" /></div>
      <section className="d-jobs-card"><div className="d-card-title"><div><span>STOCK</span><h3>Inventory items</h3></div><label className="d-inline-search"><Search size={15} /><input aria-label="Search inventory" placeholder="Search SKU or part" /></label></div><div className="d-table-wrap"><table className="d-table"><thead><tr><th>SKU</th><th>Part</th><th>Compatibility</th><th>Stock</th><th>Price</th><th>Status</th></tr></thead><tbody>{[["BAT-AT-550", "Atlas 12V battery", "Toyota · Honda · Nissan", "2", "GHS 680", "Low stock"], ["BRK-BR-159", "Brembo front pads", `Corolla ${currentYear - 5}–${currentYear - 2}`, "12", "GHS 680", "In stock"], ["OIL-MB-5W30", "Mobil 1 5W-30 · 4L", "Multi-vehicle", "18", "GHS 420", "In stock"], ["FLT-TY-041", "Toyota oil filter", "Corolla · Camry", "1", "GHS 85", "Low stock"]].map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={i}>{i === 1 ? <strong>{cell}</strong> : i === 5 ? <span className={`d-status ${cell === "Low stock" ? "d-status-warning" : "d-status-repairing"}`}><i />{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></section>
    </div>
  );
}

function MechanicWorkspace({ onExit }: { onExit: () => void }) {
  const [view, setView] = useState<MechanicView>("overview");
  const [reloadKey, setReloadKey] = useState(0);
  const requests = useAsync<ServiceRequest[]>(() => requestService.list(), [], [reloadKey]);
  const jobs = requests.data;
  const incoming = jobs.find((job) => job.status === "requested") ?? null;
  const onChanged = () => setReloadKey((value) => value + 1);
  return (
    <div className="d-console">
      <Sidebar setView={setView} view={view} />
      <Topbar eyebrow="MECHANIC WORKSPACE" onExit={onExit} title={view === "overview" ? "Overview" : view === "jobs" ? "Jobs" : view === "calendar" ? "Appointments" : "Inventory"} />
      <main className="d-main">{view === "overview" ? <MechanicOverview incoming={incoming} jobs={jobs} onChanged={onChanged} openJobs={() => setView("jobs")} /> : view === "jobs" ? <MechanicJobs jobs={jobs} onChanged={onChanged} /> : view === "calendar" ? <CalendarView /> : <MechanicInventory />}</main>
    </div>
  );
}

function TowOperator() {
  const [available, setAvailable] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [stage, setStage] = useState(0);
  const stages = ["En route", "Arrived", "Vehicle loaded", "Driving", "Destination reached", "Completed"];
  return (
    <div className="d-page d-tow-page">
      <div className="d-page-heading"><div><span className="d-kicker">MOBILE OPERATOR EXPERIENCE</span><h2>Tow operations</h2><p>Incoming requests and the active-job interface at mobile scale.</p></div><div className="d-availability"><span><i className={available ? "on" : ""} />{available ? "AVAILABLE" : "UNAVAILABLE"}</span><button aria-pressed={available} onClick={() => setAvailable(!available)} type="button"><i /></button></div></div>
      <div className="d-device-stage">
        <div className="d-operator-device">
          <header><span>9:41</span><strong>RoadLift</strong><Bell size={17} /></header>
          {!accepted ? (
            <main className="d-incoming-job">
              <div className="d-countdown"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" /></svg><span><strong>42</strong><small>SECONDS</small></span></div>
              <span className="d-kicker">NEW TOW REQUEST</span><h2>Vehicle breakdown</h2><p>Toyota Corolla · Oxford Street, Osu</p>
              <div className="d-operator-map"><span className="map-grid" /><span className="d-route-line" /><span className="d-op-truck"><Truck size={16} /></span><span className="d-op-pin"><MapPin size={16} /></span></div>
              <section><div><Navigation size={17} /><span><small>PICKUP</small><strong>2.8 km · 9 min</strong></span></div><div><MapPin size={17} /><span><small>DESTINATION</small><strong>Ringway · 6.8 km</strong></span></div><div><Banknote size={17} /><span><small>EARNINGS</small><strong>GHS 256</strong></span></div></section>
              <DButton onClick={() => setAccepted(true)} variant="success">Accept request</DButton><DButton variant="ghost">Decline</DButton>
            </main>
          ) : (
            <main className="d-active-tow">
              <div className="d-operator-map"><span className="map-grid" /><span className="d-route-line" /><span className="d-op-truck"><Truck size={16} /></span><span className="d-op-pin"><MapPin size={16} /></span></div>
              <span className="d-kicker">{stages[stage].toUpperCase()}</span><h2>{stage < 2 ? "Navigate to Kwame" : stage < 4 ? "Vehicle secured" : "Approaching destination"}</h2><p>{stage < 2 ? "Oxford Street, Osu · 9 min" : "Toyota Corolla · GR 8241-22"}</p>
              <section className="d-customer-line"><span>KA</span><div><strong>Kwame Asante</strong><small>+233 24 123 4567</small></div><button type="button" disabled><MessageCircle size={18} /></button><button type="button" disabled><Phone size={18} /></button></section>
              <div className="d-mobile-timeline">{stages.map((item, index) => <div className={index < stage ? "done" : index === stage ? "current" : ""} key={item}><i>{index < stage && <Check size={10} />}</i><span>{item}</span></div>)}</div>
              <DButton disabled={stage === 5} onClick={() => setStage(Math.min(stage + 1, 5))}>{stage === 5 ? "Job completed" : `Mark ${stages[stage + 1]}`}</DButton>
            </main>
          )}
        </div>
        <aside><span className="d-kicker">OPERATOR SAFETY</span><h3>One valid action at a time</h3><p>The mobile job interface keeps navigation, customer contact, and the next valid status action within thumb reach.</p><ul><li><CheckCircle2 size={16} /> Large 48px status action</li><li><CheckCircle2 size={16} /> Customer call always visible</li><li><CheckCircle2 size={16} /> No status skipping</li><li><CheckCircle2 size={16} /> Offline updates queue visibly</li></ul></aside>
      </div>
    </div>
  );
}

function VendorWorkspace() {
  const [tab, setTab] = useState("Products");
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">ACCRA PARTS HUB</span><h2>Store operations</h2><p>Products, inventory, orders, pricing and performance.</p></div><DButton icon={Plus}>Add product</DButton></div>
      <div className="d-tabs">{["Products", "Orders", "Inventory", "Analytics"].map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} type="button">{item}</button>)}</div>
      <div className="d-metric-grid"><Metric detail="+18% vs last month" icon={ShoppingBag} label="Orders this month" value="284" /><Metric detail="Server-verified payments" icon={Banknote} label="Gross sales" tone="green" value="GHS 86.4k" /><Metric detail="Across 412 products" icon={Package} label="Units in stock" tone="violet" value="2,840" /><Metric detail="Needs attention" icon={AlertTriangle} label="Low-stock SKUs" tone="amber" value="12" /></div>
      <div className="d-vendor-grid">
        <section className="d-jobs-card"><div className="d-card-title"><div><span>{tab.toUpperCase()}</span><h3>{tab === "Orders" ? "Recent orders" : "Product catalogue"}</h3></div><DButton icon={Filter} variant="secondary">Filter</DButton></div><div className="d-table-wrap"><table className="d-table"><thead><tr><th>Product</th><th>SKU</th><th>Compatibility</th><th>Stock</th><th>Price</th><th>Status</th></tr></thead><tbody>{[["Brembo front brake pads", "BRK-BR-159", `Corolla ${currentYear - 5}–${currentYear - 2}`, "24", "GHS 680", "Active"], ["Atlas 12V battery", "BAT-AT-550", "Multi-vehicle", "4", "GHS 760", "Low stock"], ["Continental EcoContact 6", "TYR-CO-205", "205/55 R16", "18", "GHS 1,150", "Active"], ["Toyota oil filter", "FLT-TY-041", "Corolla · Camry", "2", "GHS 85", "Low stock"]].map((row) => <tr key={row[1]}>{row.map((cell, i) => <td key={i}>{i === 0 ? <strong>{cell}</strong> : i === 5 ? <span className={`d-status ${cell === "Low stock" ? "d-status-warning" : "d-status-repairing"}`}><i />{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div></section>
        <section className="d-stock-alerts"><div className="d-card-title"><div><span>ACTION NEEDED</span><h3>Low-stock alerts</h3></div><span>12</span></div>{[["Atlas 12V battery", "4 left · reorder at 6"], ["Toyota oil filter", "2 left · reorder at 8"], ["Bosch wiper blades", "3 left · reorder at 5"]].map(([name, detail]) => <article key={name}><span><AlertTriangle size={17} /></span><div><strong>{name}</strong><small>{detail}</small></div><button type="button" disabled>Reorder</button></article>)}<DButton variant="secondary">View inventory</DButton></section>
      </div>
    </div>
  );
}

function FleetWorkspace() {
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">AKWAABA LOGISTICS · 24 VEHICLES</span><h2>Fleet health</h2><p>Keep every vehicle safe, compliant, and on the road.</p></div><DButton icon={Plus}>Add vehicle</DButton></div>
      <div className="d-fleet-health"><div><span className="d-health-score">82<small>/100</small></span><div><span>OVERALL FLEET HEALTH</span><h3>Good, with 4 vehicles needing attention</h3><p>Health improved by 6 points since September.</p></div></div><div className="d-health-legend"><span><i className="good" />18 healthy</span><span><i className="due" />4 need attention</span><span><i className="critical" />2 critical</span></div></div>
      <div className="d-metric-grid"><Metric detail="2 critical · 2 due soon" icon={AlertTriangle} label="Needs attention" tone="amber" value="4" /><Metric detail="Next 30 days" icon={CalendarDays} label="Upcoming service" value="7" /><Metric detail="-8% vs last month" icon={Banknote} label="Monthly spend" tone="green" value="GHS 18.6k" /><Metric detail="Across 18 active drivers" icon={Gauge} label="Avg. mileage" tone="violet" value="3,240 km" /></div>
      <section className="d-jobs-card"><div className="d-card-title"><div><span>PRIORITY VEHICLES</span><h3>Needs attention</h3></div><button type="button" disabled>View all <ArrowRight size={15} /></button></div><div className="d-table-wrap"><table className="d-table"><thead><tr><th>Vehicle</th><th>Driver</th><th>Issue</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>{[["Toyota Hilux · GR 4210-23", "Kofi Addo", "Roadworthy renewal", "6 days", "Critical"], ["Kia Rio · GW 1940-22", "Ama Boateng", "Oil service", "420 km", "Due soon"], ["Hyundai Elantra · GT 8841-21", "Nii Otoo", "Brake inspection", "12 days", "Due soon"], ["Nissan Sentra · GN 5528-20", "Esi Quaye", "Insurance renewal", "18 days", "Scheduled"]].map((row) => <tr key={row[0]}>{row.map((cell, i) => <td key={i}>{i === 0 ? <strong>{cell}</strong> : i === 4 ? <span className={`d-status ${cell === "Critical" ? "d-status-critical" : cell === "Scheduled" ? "d-status-repairing" : "d-status-warning"}`}><i />{cell}</span> : cell}</td>)}<td><button type="button" disabled><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div></section>
    </div>
  );
}

function AdminWorkspace() {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the provider.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">PLATFORM OPERATIONS</span><h2>Admin overview</h2><p>Trust, safety, payments, and marketplace health.</p></div><DButton icon={FileText} variant="secondary">Export report</DButton></div>
      <div className="d-admin-alert"><ShieldCheck size={19} /><span><strong>{pending.data.length} provider application{pending.data.length === 1 ? "" : "s"} need review</strong><small>Verification decisions are recorded in the audit trail.</small></span><button type="button" disabled>Open queue <ArrowRight size={15} /></button></div>
      <div className="d-metric-grid"><Metric detail="Registered accounts" icon={Users} label="Users" value={m ? m.users.toLocaleString("en-GH") : "—"} /><Metric detail={`${m?.providers.pending ?? 0} pending review`} icon={BadgeCheck} label="Verified providers" tone="green" value={m ? m.providers.verified.toLocaleString("en-GH") : "—"} /><Metric detail={`${m?.requests.open ?? 0} open`} icon={Clock3} label="Service requests" tone="violet" value={m ? String(m.requests.total) : "—"} /><Metric detail={`${m?.payments.paidCount ?? 0} paid`} icon={Banknote} label="Verified payments" tone="amber" value={m ? formatMoney(m.payments.paidValueGhs) : "—"} /></div>
      <div className="d-admin-grid">
        <section className="d-verification">
          <div className="d-card-title"><div><span>PROVIDER VERIFICATION</span><h3>Application review</h3></div><span className={`d-status ${pending.data.length ? "d-status-warning" : "d-status-repairing"}`}><i />{pending.data.length ? "Needs review" : "Clear"}</span></div>
          {error && <p role="alert">{error}</p>}
          {pending.loading && <p className="d-state-note">Loading applications…</p>}
          {!pending.loading && pending.data.length === 0 && <p className="d-state-note">No provider applications are awaiting review.</p>}
          {pending.data.map((provider) => (
            <div className="d-applicant" key={provider.id}>
              <span>{provider.type.slice(0, 2).toUpperCase()}</span>
              <div><h3>{provider.businessName}</h3><p>{provider.type} · {provider.region ?? "Region not set"}</p><small>{provider.serviceAreas.join(", ") || "No service areas listed"}</small></div>
              <div className="d-review-actions"><DButton disabled={busy === provider.id} icon={Check} onClick={() => void verify(provider.id, "verify")} variant="success">Approve</DButton><DButton disabled={busy === provider.id} onClick={() => void verify(provider.id, "reject")} variant="danger">Reject</DButton></div>
            </div>
          ))}
          <div className="d-privacy-note"><ShieldCheck size={15} /> Documents are private. Access is logged in the audit trail.</div>
        </section>
        <section className="d-ops-metrics"><div className="d-card-title"><div><span>TRUST & OPERATIONS</span><h3>Platform totals</h3></div></div>{[["Service requests", m ? String(m.requests.total) : "—"], ["Open requests", m ? String(m.requests.open) : "—"], ["Completed", m ? String(m.requests.completed) : "—"], ["Cancelled", m ? String(m.requests.cancelled) : "—"], ["Open disputes", m ? String(m.disputes.open) : "—"]].map(([label, value]) => <div className="d-op-metric" key={label}><span>{label}</span><strong>{value}</strong></div>)}</section>
      </div>
      <section className="d-audit"><div className="d-card-title"><div><span>AUDIT LOG</span><h3>Recent sensitive actions</h3></div><button type="button" disabled>View full log</button></div>{audit.data.length === 0 && <p className="d-state-note">No audit entries yet.</p>}{audit.data.map((entry) => <div key={entry.id}><span><History size={16} /></span><strong>{entry.action.replace(/_/g, " ")}</strong><small>{entry.actorRole ?? "system"}</small><time>{formatTime(entry.createdAt)}</time></div>)}</section>
    </div>
  );
}

function OwnerDesktop() {
  const [selected, setSelected] = useState(0);
  const providers = ["Kojo AutoCare", "Nii's Mobile Garage", "AutoHaus Accra"];
  return (
    <div className="d-owner">
      <aside className="d-owner-sidebar">
        <div className="d-brand"><span><Navigation size={17} fill="currentColor" /></span><strong>mechnow</strong></div>
        <nav>{[["Overview", LayoutDashboard], ["Vehicles", Car], ["Find help", MapPin], ["Appointments", CalendarDays], ["Service history", History], ["Parts", ShoppingBag], ["Messages", MessageCircle], ["Payments", Banknote], ["Settings", Settings]].map(([label, Icon], i) => { const ItemIcon = Icon as LucideIcon; return <button className={i === 2 ? "active" : ""} key={label as string} type="button" disabled><ItemIcon size={18} />{label as string}</button>; })}</nav>
        <button className="d-owner-emergency" type="button" disabled><LifeBuoy size={19} /><span><strong>Emergency help</strong><small>Get roadside assistance</small></span></button>
      </aside>
      <main className="d-owner-main">
        <header><div><span className="d-kicker">FIND HELP</span><h1>Trusted help near you</h1></div><div><button aria-label="Notifications" type="button" disabled><Bell size={18} /></button><span>KA</span></div></header>
        <div className="d-owner-toolbar"><label><Search size={17} /><input aria-label="Search providers" defaultValue="Mechanics near me" /></label>{["Open now", "Verified", "Within 5 km"].map((x) => <button className="active" key={x} type="button" disabled>{x}<X size={12} /></button>)}<button type="button" disabled><Filter size={14} /> All filters</button></div>
        <div className="d-split-view">
          <section className="d-provider-list"><div className="d-result-summary"><strong>18 providers</strong><span>Sorted by recommended <ChevronDown size={14} /></span></div>{providers.map((provider, i) => <button className={selected === i ? "selected" : ""} key={provider} onClick={() => setSelected(i)} type="button"><img alt="" src={providerPhoto} /><div><span>{i === 0 && <em><Zap size={11} fill="currentColor" /> BEST MATCH</em>}<small className="d-verified"><BadgeCheck size={12} fill="currentColor" /> VERIFIED</small></span><h2>{provider}</h2><p><Star size={13} fill="currentColor" /> {4.9 - i * .1} <span>({312 - i * 64})</span> · {2.4 + i * 1.3} km</p><div><span>Diagnostics</span><span>Brakes</span><span>Electrical</span></div><footer><strong>From GHS {120 + i * 20}</strong><span><i /> Open now</span><b>View profile <ArrowRight size={14} /></b></footer></div></button>)}</section>
          <section className="d-desktop-map"><span className="map-grid" /><span className="d-map-road road-one" /><span className="d-map-road road-two" /><span className="d-map-road road-three" />{providers.map((provider, i) => <button aria-label={`${provider} map marker`} className={`d-map-marker marker-${i} ${selected === i ? "selected" : ""}`} key={provider} onClick={() => setSelected(i)} type="button"><Wrench size={16} /></button>)}<span className="d-map-user"><Navigation size={16} fill="currentColor" /></span><div className="d-map-card"><img alt="" src={providerPhoto} /><div><small><BadgeCheck size={12} fill="currentColor" /> VERIFIED</small><strong>{providers[selected]}</strong><span><Star size={12} fill="currentColor" /> {4.9 - selected * .1} · {2.4 + selected * 1.3} km · Open</span></div><DButton>View profile</DButton></div></section>
        </div>
      </main>
    </div>
  );
}

function HandoffWorkspace() {
  const checks = [
    ["Emergency request reachable within 3 taps", "Passed"],
    ["Paid emergency requests require deliberate hold", "Passed"],
    ["All major lists include loading, empty and error specifications", "Documented"],
    ["Mobile, tablet and desktop layouts", "Passed"],
    ["Dark mode and WCAG AA contrast", "Passed"],
    ["44px minimum touch targets and visible focus", "Passed"],
    ["Reduced-motion fallback", "Passed"],
    ["Provider state machine prevents skipped states", "Passed"],
  ];
  return (
    <div className="d-page">
      <div className="d-page-heading"><div><span className="d-kicker">PLATFORM QUALITY</span><h2>Handoff notes</h2><p>Implementation assumptions, accessibility, motion, and release readiness.</p></div><span className="d-ready"><CheckCircle2 size={18} /> READY FOR HANDOFF</span></div>
      <div className="d-handoff-grid">
        <section><div className="d-card-title"><div><span>BACKEND CONTRACT</span><h3>Core assumptions</h3></div></div>{[["Payment verification", "Payments are verified server-side before success is shown. Webhooks are idempotent."], ["Service records", "Provider-added records are immutable. Corrections create an appended audit event."], ["Date and time", "Stored in UTC and displayed in the user's local timezone, including Africa/Accra."], ["Permissions", "Role-based permissions restrict provider, vendor, fleet and admin data."], ["Real-time status", "Emergency and tow status updates use server-authoritative events with offline queues."]].map(([title, copy], i) => <article key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{copy}</p></div></article>)}</section>
        <section><div className="d-card-title"><div><span>MOTION TOKENS</span><h3>Reason and fallback</h3></div></div>{[["Press", "120ms · scale 0.97", "Confirms direct manipulation"], ["Tooltip", "150ms · fade", "Adds context without distraction"], ["Dropdown", "200ms · opacity + 0.96 scale", "Preserves spatial origin"], ["Modal / drawer", "300ms · ease-out", "Maintains hierarchy and direction"], ["Emergency actions", "No animation", "Speed and certainty over decoration"], ["Reduced motion", "Fade only", "Honours user preference"]].map(([label, value, reason]) => <div className="d-token-row" key={label}><strong>{label}</strong><span>{value}</span><small>{reason}</small></div>)}</section>
      </div>
      <section className="d-qa"><div className="d-card-title"><div><span>QUALITY CHECK</span><h3>Release readiness</h3></div><strong>8 / 8 passed</strong></div>{checks.map(([check, status]) => <div key={check}><CheckCircle2 size={17} /><span>{check}</span><em>{status}</em></div>)}</section>
      <div className="d-handoff-grid d-handoff-grid--bottom"><section><div className="d-card-title"><div><span>ACCESSIBILITY</span><h3>Key implementation notes</h3></div></div><ul><li>Logical focus order follows reading order on all key flows.</li><li>Inputs use persistent visible labels; placeholder text is supplementary.</li><li>Status and validation messages include text and icons, never colour alone.</li><li>Map markers and icon-only controls have descriptive accessible names.</li><li>Live emergency updates should use polite ARIA live regions except urgent safety notices.</li></ul></section><section><div className="d-card-title"><div><span>MAJOR FEATURE STATES</span><h3>Required state matrix</h3></div></div><div className="d-state-chips">{["Loading / skeleton", "Empty + next action", "Human error + retry", "Success", "Disabled", "Offline", "Permission denied", "No availability", "Partial data", "Network failure"].map((x) => <span key={x}><Check size={12} />{x}</span>)}</div></section></div>
    </div>
  );
}

export default function ProviderWorkspaces({ onExit, role = "mechanic" }: { onExit: () => void; role?: Workspace }) {
  const workspace = role;
  const content = useMemo(() => {
    if (workspace === "mechanic") return <MechanicWorkspace onExit={onExit} />;
    if (workspace === "owner") return <OwnerDesktop />;
    return (
      <div className="d-simple-console">
        <div className="d-simple-sidebar"><div className="d-brand"><span><Navigation size={17} fill="currentColor" /></span><strong>mechnow</strong></div><nav><button className="active" type="button" disabled><LayoutDashboard size={18} />Overview</button><button type="button" disabled><History size={18} />Activity</button><button type="button" disabled><MessageCircle size={18} />Messages</button><button type="button" disabled><Settings size={18} />Settings</button></nav></div>
        <Topbar eyebrow={`${workspace.toUpperCase()} WORKSPACE`} onExit={onExit} title={workspace === "tow" ? "Tow operations" : workspace === "vendor" ? "Store operations" : workspace === "fleet" ? "Fleet health" : workspace === "admin" ? "Admin overview" : "Handoff & QA"} />
        <main className="d-main">{workspace === "tow" ? <TowOperator /> : workspace === "vendor" ? <VendorWorkspace /> : workspace === "fleet" ? <FleetWorkspace /> : workspace === "admin" ? <AdminWorkspace /> : <HandoffWorkspace />}</main>
      </div>
    );
  }, [workspace]);
  return <div className="d-root">{content}</div>;
}
