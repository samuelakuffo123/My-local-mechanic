import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CircleAlert, CreditCard, History, Wrench } from "lucide-react";
import { Link } from "react-router";
import { AppLayout } from "../../components/AppLayout";
import { bookingService } from "../../services/booking";
import { emergencyService } from "../../services/emergency";
import { paymentService, type Payment } from "../../services/payments";
import type { RequestStatus } from "../../services/apiTypes";
import { useAppStore } from "../../state/store";

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  date: string;
  state: string;
  kind: "booking" | "emergency" | "payment";
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not available"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function getEmergencyState(status: RequestStatus) {
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  if (status === "requested") return "Saved · not dispatched";
  if (status === "accepted" || status === "enRoute" || status === "arrived") return "Provider update";
  if (status === "awaitingApproval" || status === "awaitingParts") return "Needs attention";
  return "In progress";
}

export function ActivityRoute() {
  const theme = useAppStore((state) => state.theme);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([bookingService.list(), paymentService.list(), emergencyService.active()])
      .then(([bookings, payments, emergency]) => {
        if (!active) return;
        const activity: ActivityItem[] = [
          ...bookings.map((booking) => ({
            id: `booking-${booking.id}`,
            title: booking.problem || "Service booking",
            detail: `Booking request · ${booking.status}`,
            date: booking.createdAt,
            state: booking.status,
            kind: "booking" as const,
          })),
          ...payments.map((payment: Payment) => ({
            id: `payment-${payment.id}`,
            title: `Payment · GHS ${payment.amountGhs.toFixed(2)}`,
            detail: "Payment has not been processed by a payment provider.",
            date: "",
            state: payment.status === "pending" ? "Not charged" : payment.status,
            kind: "payment" as const,
          })),
          ...(emergency ? [{
            id: `emergency-${emergency.id}`,
            title: emergency.problem || "Roadside assistance",
            detail: emergency.location?.label ? `Pickup area: ${emergency.location.label}` : "Roadside request saved to your account.",
            date: emergency.updatedAt || emergency.createdAt,
            state: getEmergencyState(emergency.status),
            kind: "emergency" as const,
          }] : []),
        ];
        activity.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
        setItems(activity);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Couldn't load your saved activity.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [attempt]);

  return (
    <AppLayout theme={theme}>
      <main className="activity-page">
        <header className="activity-header">
          <Link to="/app/home" aria-label="Back to home"><ArrowLeft size={18} /></Link>
          <div><span className="auth-kicker">YOUR ACCOUNT</span><h1>Activity</h1></div>
          <span className="activity-header__icon"><History size={18} /></span>
        </header>
        <p className="activity-intro">Your bookings and service activity.</p>
        {error && <div className="activity-error" role="alert"><CircleAlert aria-hidden="true" size={18} /><div><p>{error}</p><button onClick={() => { setError(""); setLoading(true); setAttempt((current) => current + 1); }} type="button">Try again</button></div></div>}
        {loading ? (
          <p className="activity-state" role="status">Loading saved activity…</p>
        ) : error ? null : items.length ? (
          <section className="activity-list" aria-label="Saved activity">
            {items.map((item) => {
              const Icon = item.kind === "booking" ? CalendarDays : item.kind === "payment" ? CreditCard : CircleAlert;
              return (
                <article className="activity-card" key={item.id}>
                  <span className={`activity-card__icon activity-card__icon--${item.kind}`}><Icon size={18} /></span>
                  <div className="activity-card__body">
                    <div className="activity-card__title"><strong>{item.title}</strong><span>{item.state}</span></div>
                    <p>{item.detail}</p>
                    {item.date && <time dateTime={item.date}>{formatDate(item.date)}</time>}
                  </div>
                </article>
              );
            })}
          </section>
        ) : (
          <section className="activity-empty">
            <span><Wrench size={24} /></span>
            <h2>Your service history starts here</h2>
            <p>Saved booking requests, roadside requests, and payment intents will appear here.</p>
            <Link to="/app/services">Explore services <ArrowRight size={15} /></Link>
          </section>
        )}
        <p className="activity-local-note">Payments shown as pending have not been charged by a payment provider.</p>
      </main>
    </AppLayout>
  );
}
