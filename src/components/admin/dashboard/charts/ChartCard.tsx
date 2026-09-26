import type { ReactNode } from "react";

export type ChartCardProps = {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Shared dark card chrome. The accent color comes from the page's data-theme. */
export function ChartCard({ title, icon, action, children, className = "" }: ChartCardProps) {
  return (
    <section className={`flex min-h-[230px] flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4 ${className}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-dashboard-foreground">
          {icon ? <span className="module-accent-text shrink-0">{icon}</span> : null}
          <span className="truncate">{title}</span>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
