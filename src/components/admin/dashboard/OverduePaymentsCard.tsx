import Link from "next/link";

function WarningIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 16H3L12 3Z" /><path d="M12 9v4M12 16h.01" /></svg>;
}

export function OverduePaymentsCard() {
  return <section className="flex h-[230px] flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-dashboard-foreground"><span className="module-accent-text"><WarningIcon /></span>پرداخت‌های معوق</div><div className="ml-1 mt-8 text-left"><p className="relative -top-2 font-mono text-3xl font-semibold tracking-[-0.06em] text-dashboard-foreground">۵ مورد</p><p className="relative -top-px mt-5 text-[11px] text-dashboard-muted">جمع مبلغ: <span className="font-mono text-dashboard-foreground">۱۸,۷۰۰,۰۰۰</span> تومان</p><Link href="/admin/financial" className="mt-6 inline-flex min-h-12 w-fit min-w-[150px] items-center justify-center gap-2 rounded-lg border border-dashboard-line-strong bg-transparent px-5 text-[11px] font-semibold text-dashboard-foreground transition-colors hover:border-[rgb(var(--module-primary-rgb)/0.6)] hover:bg-[var(--module-tint)]">مشاهده جزئیات <span aria-hidden="true">←</span></Link></div></section>;
}
