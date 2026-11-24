import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { StatusTone } from "../design/status";

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  block = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: LucideIcon;
  block?: boolean;
}) {
  const classes = [
    "mn-button",
    variant !== "primary" ? `mn-button--${variant}` : "",
    block ? "mn-button--block" : "",
    className,
  ].filter(Boolean).join(" ");
  return (
    <button className={classes} type={type} {...props}>
      {Icon ? <Icon aria-hidden="true" size={18} /> : null}
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mn-field">
      <label className="mn-field__label" htmlFor={htmlFor}>{label}</label>
      {hint ? <span className="mn-field__hint">{hint}</span> : null}
      {children}
      {error ? <span className="mn-field__error" role="alert">{error}</span> : null}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`mn-card ${className}`.trim()}>{children}</section>;
}

export function StatusPill({ children, tone = "info" }: { children: ReactNode; tone?: StatusTone }) {
  return <span className={`mn-status-pill mn-status-pill--${tone}`}>{children}</span>;
}

export interface TimelineStep {
  label: string;
  state?: "done" | "current" | "upcoming";
  detail?: string;
}

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="mn-timeline">
      {steps.map((step) => (
        <li
          className={`mn-timeline__item${step.state === "done" ? " mn-timeline__item--done" : ""}${step.state === "current" ? " mn-timeline__item--current" : ""}`}
          key={step.label}
        >
          <div>
            <div>{step.label}</div>
            {step.detail ? <div className="mn-field__hint">{step.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function Sheet({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="mn-sheet__backdrop" onClick={onClose}>
      <section
        aria-label={title}
        aria-modal="true"
        className="mn-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {children}
      </section>
    </div>
  );
}

export function Banner({
  children,
  tone = "info",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "danger";
  icon?: LucideIcon;
}) {
  return (
    <div className={`mn-banner${tone !== "info" ? ` mn-banner--${tone}` : ""}`} role={tone === "danger" ? "alert" : "status"}>
      {Icon ? <Icon aria-hidden="true" size={20} /> : null}
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon: Icon,
}: {
  title: string;
  body: string;
  action?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="mn-empty-state">
      {Icon ? <Icon aria-hidden="true" size={32} /> : null}
      <div className="mn-empty-state__title">{title}</div>
      <div className="mn-empty-state__body">{body}</div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  eyebrow,
  back,
  trailing,
}: {
  title: string;
  eyebrow?: string;
  back?: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="mn-page-header">
      {back}
      <div>
        {eyebrow ? <div className="mn-page-header__eyebrow">{eyebrow}</div> : null}
        <p className="mn-page-header__title">{title}</p>
      </div>
      {trailing ? <div style={{ marginLeft: "auto" }}>{trailing}</div> : null}
    </header>
  );
}

export interface NavItem {
  label: string;
  href: string;
  current?: boolean;
  icon?: LucideIcon;
}

export function TabBar({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Primary" className="mn-tab-bar">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            aria-current={item.current ? "page" : undefined}
            className="mn-tab-bar__item"
            href={item.href}
            key={item.href}
          >
            {Icon ? <Icon aria-hidden="true" size={20} /> : null}
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function SideNav({ items }: { items: NavItem[] }) {
  return (
    <nav aria-label="Sections" className="mn-side-nav">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <a
            aria-current={item.current ? "page" : undefined}
            className="mn-side-nav__item"
            href={item.href}
            key={item.href}
          >
            {Icon ? <Icon aria-hidden="true" size={18} /> : null}
            <span>{item.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
