import type { ReactNode } from "react";
import { DashboardShell } from "./DashboardShell";
import { ModuleIcon } from "./ModuleChart";
import { StatItem } from "./StatItem";
import { MiniRing } from "./charts/MiniRing";
import type { RelatedLink } from "./RelatedSections";
import { dashboardModules, type ModuleKind } from "@/lib/dashboard/modules";

/**
 * A module's page. It sets the single `data-theme` for the whole page, so every
 * chart, ring, bar, badge and icon background below reads `--module-primary`
 * from here and switching ERP → CRM recolors all of its graphics without
 * touching a call site.
 */
export function ModulePage({ kind, title, subtitle, related, children }: { kind: ModuleKind; title?: string; subtitle?: string; related?: RelatedLink[]; children: ReactNode }) {
  const mod = dashboardModules[kind];
  const heading = title ?? mod.label;

  return (
    <div data-theme={kind} data-module-page={kind} className="contents">
      <DashboardShell
        title={heading}
        subtitle={subtitle ?? mod.subtitle}
        icon={<ModuleIcon kind={kind} className="h-6 w-6" />}
        aside={
          <div className="flex items-center gap-3">
            <div className="text-left">
              <p className="module-accent-text font-mono text-2xl font-semibold tracking-[-0.07em] sm:text-3xl">{mod.percent}%</p>
              <p className="mt-0.5 text-[12px] font-semibold text-dashboard-foreground">عملکرد کلی</p>
            </div>
            <MiniRing percent={mod.percent} label={heading} caption="عملکرد کلی" size={84} strokeWidth={8} />
          </div>
        }
        related={related}
      >
        <section aria-label={`آمار ${heading}`} className="mb-5 grid grid-cols-3 gap-2 rounded-[14px] border border-dashboard-line bg-dashboard-surface/60 px-4 py-3.5">
          {mod.stats.map((stat) => (
            <StatItem key={stat.label} {...stat} />
          ))}
        </section>
        {children}
      </DashboardShell>
    </div>
  );
}
