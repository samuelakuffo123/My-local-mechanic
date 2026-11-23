import type { CSSProperties, ReactNode } from "react";
import "./skeleton.css";

/** Layout-shaped placeholder. Announce it through SkeletonRegion, not the shimmer itself. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`ui-skeleton ${className}`.trim()} style={style} />;
}

export function SkeletonRegion({
  children,
  className = "",
  label = "Loading",
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div aria-busy="true" aria-label={label} className={className} role="status">
      {children}
    </div>
  );
}
