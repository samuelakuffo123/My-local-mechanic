import { CarFront, Wrench } from "lucide-react";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="My Local Mechanic"
      className={`brand-logo${compact ? " brand-logo--compact" : ""}`}
      role="img"
    >
      <span className="brand-logo__mark" aria-hidden="true">
        <CarFront className="brand-logo__car" size={23} strokeWidth={2.2} />
        <Wrench className="brand-logo__wrench" size={13} strokeWidth={2.6} />
      </span>
      {!compact && (
        <span className="brand-logo__name">
          <strong>My Local</strong>
          <strong>Mechanic</strong>
        </span>
      )}
    </span>
  );
}
