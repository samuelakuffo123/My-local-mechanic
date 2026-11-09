export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span
      aria-label="My Local Mechanic"
      className={`brand-logo${compact ? " brand-logo--compact" : ""}`}
      role="img"
    >
      <img
        alt=""
        className="brand-logo__image"
        src={compact ? "/brand-mark.png" : "/logo.png"}
      />
    </span>
  );
}
