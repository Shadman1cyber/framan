import Link from "next/link";
import { StatItem, type StatItemProps } from "./StatItem";
import type { ModuleKind } from "@/lib/dashboard/modules";

type ModuleStat = StatItemProps;

export function ModuleIcon({ kind, className = "" }: { kind: ModuleKind; className?: string }) {
  if (kind === "erp") return <svg className={`module-ring-glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.2l8 4.6" /></svg>;
  if (kind === "accounting") return <svg className={`module-ring-glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="6" ry="3" /><path d="M6 6v5c0 1.7 2.7 3 6 3s6-1.3 6-3V6M6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></svg>;
  return <svg className={`module-ring-glyph ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3" /><circle cx="17" cy="10" r="2.5" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M14 19a4.5 4.5 0 0 1 6.5-3" /></svg>;
}

/**
 * Home-screen module ring. The arc, the icon and the button all read their
 * color from `color`, which defaults to the `--module-primary` token of the
 * nearest `data-theme` ancestor — no per-module color lives in this component.
 *
 * The ring and its button are two separate anchors to the same route: nesting
 * a button inside a link is invalid HTML, and a div+onClick is not reachable
 * by keyboard or screen reader.
 */
export function ModuleRing({ kind, label, subtitle, percent, stats, href, buttonLabel, featured = false, color = "var(--module-primary)" }: { kind: ModuleKind; label: string; subtitle: string; percent: number; stats: ModuleStat[]; href: string; buttonLabel: string; featured?: boolean; color?: string }) {
  return <div dir="rtl" className={`mx-auto flex w-full flex-col items-center text-center ${featured ? "max-w-[380px]" : "max-w-[300px]"}`}>
    <Link href={href} data-testid={`ring-${kind}`} aria-label={`${label}؛ عملکرد کلی ${percent} درصد`} style={{ color }} className="module-interactive group/ring mx-auto flex w-fit flex-col items-center rounded-full">
      <div data-featured={featured} className={`module-ring relative flex items-center justify-center rounded-full border border-dashboard-line/80 bg-dashboard ${featured ? "module-glow -translate-y-[13px]" : "translate-y-[31px]"}`}><svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true"><circle cx="100" cy="100" r="85" pathLength="100" className="fill-none stroke-dashboard-raised" strokeWidth="30" /><circle data-testid={`ring-arc-${kind}`} cx="100" cy="100" r="85" pathLength="100" className="fill-none" stroke={color} strokeWidth="30" strokeLinecap="round" strokeDasharray={`${percent} ${100 - percent}`} /></svg><div className="module-ring-content relative z-10 flex flex-col items-center text-center"><span data-testid={`ring-icon-${kind}`} className="module-ring-icon module-tint-bg inline-flex items-center justify-center rounded-full border border-dashboard-line bg-dashboard-surface"><ModuleIcon kind={kind} /></span><h3 className="module-ring-title font-bold text-dashboard-foreground">{label}</h3><p className="module-ring-subtitle text-dashboard-muted">{subtitle}</p><p className="module-ring-percentage font-mono font-semibold tracking-[-0.07em] text-dashboard-foreground">{percent}%</p><p className="module-ring-caption font-semibold text-dashboard-foreground">عملکرد کلی</p></div></div>
    </Link>
    <div className={`${featured ? "mt-0" : "mt-[60px]"} grid w-full grid-cols-3 gap-2 pt-0 ${featured ? "mt-4" : ""}`}>{stats.map((stat) => <StatItem key={stat.label} {...stat} />)}</div>
    <Link href={href} data-testid={`ring-button-${kind}`} className={`module-focusable group/button inline-flex min-h-10 w-fit items-center justify-center gap-2 rounded-full border px-5 text-[12px] font-semibold transition-all ${featured ? "module-button-primary mt-10 min-h-[52px] min-w-[240px] hover:brightness-110" : "module-button-ghost mt-[46px] min-h-[44px] min-w-[196px] bg-dashboard-surface text-dashboard-foreground hover:brightness-110"}`}>{buttonLabel}<span aria-hidden="true" className="transition-transform group-hover/button:-translate-x-1">←</span></Link>
  </div>;
}
