import { Sparkline } from "./charts/Sparkline";

const salesTrend = "M0 79 C28 76 38 62 64 67 S103 50 126 59 S166 37 190 48 S224 23 250 37 S286 18 312 27 S338 12 360 8";

function TrendIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 16 5-5 3 3 7-7" /><path d="M14 7h5v5" /></svg>;
}

export function SalesCard() {
  return <section className="relative flex h-[230px] min-h-[190px] flex-col overflow-hidden rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-dashboard-foreground"><span className="module-accent-text"><TrendIcon /></span>فروش امروز</div><div className="relative z-10 ml-2 mt-8 text-left"><p className="relative -top-2 font-mono text-[22px] font-semibold tracking-[-0.06em] text-dashboard-foreground">۲۸,۴۵۰,۰۰۰ <span className="text-[11px] font-normal text-dashboard-muted">تومان</span></p><p className="module-accent-text relative -top-px mt-6 text-[11px] font-semibold">+۱۲٪ نسبت به دیروز</p></div><Sparkline d={salesTrend} className="pointer-events-none absolute bottom-[72px] right-4 h-[72px] w-[38%] opacity-80" /></section>;
}
