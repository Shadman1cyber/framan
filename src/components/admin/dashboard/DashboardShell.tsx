"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardHeader } from "./DashboardHeader";
import { RelatedSections, type RelatedLink } from "./RelatedSections";
import { DASHBOARD_HOME_HREF } from "@/lib/dashboard/modules";

/**
 * The dark full-bleed shell every focused dashboard page sits in: header, a back
 * link to the dashboard, a title block with a circular accent badge, optional
 * related sections, then the page's own content. `ModulePage` builds on this,
 * and so do pages that are not owned by a module (e.g. the assistant page).
 */
export function DashboardShell({
  title,
  subtitle,
  icon,
  aside,
  related,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Circular accent badge; the accent colour comes from `--module-primary`. */
  icon: ReactNode;
  /** Right-hand slot in the title block (a percentage + mini ring, …). */
  aside?: ReactNode;
  related?: RelatedLink[];
  children: ReactNode;
}) {
  return (
    <div dir="rtl" lang="fa" data-shell="dashboard" className="relative min-h-dvh overflow-hidden bg-dashboard text-dashboard-foreground">
      <DashboardHeader />
      <main className="relative z-10 mx-auto max-w-[1536px] px-4 pb-6 pt-5 sm:px-6 sm:pt-6 xl:px-[43px]">
        <nav aria-label="مسیر صفحه" className="mb-4">
          <Link
            href={DASHBOARD_HOME_HREF}
            data-testid="back-home"
            className="module-back-link inline-flex min-h-9 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/75 px-4 text-[12px] font-semibold text-dashboard-muted transition-colors hover:border-dashboard-line-strong hover:text-dashboard-foreground"
          >
            <span aria-hidden="true">→</span>
            بازگشت به داشبورد
          </Link>
        </nav>

        <header className="mb-5 flex flex-wrap items-center justify-between gap-5 rounded-[18px] border border-dashboard-line bg-dashboard-surface/60 p-5">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              data-testid="module-badge"
              className="module-tint-bg flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashboard-line module-accent-text"
            >
              {icon}
            </span>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-[-0.03em] text-dashboard-foreground sm:text-2xl">{title}</h1>
              {subtitle ? <p className="mt-1 text-xs leading-relaxed text-dashboard-foreground">{subtitle}</p> : null}
            </div>
          </div>
          {aside}
        </header>

        {related && related.length > 0 ? <RelatedSections label="بخش‌های مرتبط" links={related} /> : null}

        {children}
      </main>
    </div>
  );
}
