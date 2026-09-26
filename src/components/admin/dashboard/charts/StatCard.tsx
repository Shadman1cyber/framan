import type { ReactNode } from "react";

export type StatCardProps = {
  label: string;
  value: string;
  /** Circular icon badge, tinted with the module accent (--module-primary). */
  icon: ReactNode;
  hint?: string;
  className?: string;
};

/**
 * Stat card in the dashboard language: navy surface, 1px line, circular icon
 * badge. The accent comes from the page's data-theme, never from a prop.
 */
export function StatCard({ label, value, icon, hint, className = "" }: StatCardProps) {
  return (
    <div className={`flex flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4 ${className}`}>
      <span className="module-tint-bg mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-dashboard-line module-accent-text">
        {icon}
      </span>
      <p className="text-[12px] font-medium leading-relaxed text-dashboard-foreground">{label}</p>
      <p className="mt-1.5 font-mono text-lg font-semibold tracking-[-0.04em] text-dashboard-foreground">{value}</p>
      {hint ? <p className="mt-1 text-[11px] leading-relaxed text-dashboard-muted">{hint}</p> : null}
    </div>
  );
}
