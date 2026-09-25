import Link from "next/link";

const activities = [
  { time: "۱۰:۴۲", text: "خرید جدید ثبت شد", detail: "تأمین‌کننده پارس", tone: "bg-signal-bright" },
  { time: "۰۹:۳۸", text: "فاکتور فروش صادر شد", detail: "مشتری رادین", tone: "bg-accent-blue" },
  { time: "۰۸:۱۵", text: "پرداخت دریافت شد", detail: "شرکت سامان", tone: "bg-accent-yellow" },
  { time: "۰۸:۰۲", text: "موجودی روغن کاهش یافت", detail: "نیاز به بررسی", tone: "bg-accent-red" },
  { time: "۰۷:۵۵", text: "گزارش روزانه آماده شد", detail: "گزارش کامل", tone: "bg-signal-bright" },
];

function ClockIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>;
}

export function ActivityCard() {
  return <section className="flex h-[230px] flex-col rounded-[14px] border border-dashboard-line bg-dashboard-surface/75 p-4"><div className="mb-5 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-semibold text-dashboard-foreground"><span className="text-signal-bright"><ClockIcon /></span>آخرین فعالیت‌ها</div><Link href="/admin/orders" aria-label="مشاهده فعالیت‌ها" className="text-dashboard-muted transition-colors hover:text-dashboard-foreground">←</Link></div><ol className="divide-y divide-dashboard-line/60">{activities.map((item) => <li key={`${item.time}-${item.text}`} className="flex items-center gap-2.5 py-1 first:pt-0 last:pb-0"><span className="w-11 shrink-0 font-mono text-[9px] text-dashboard-muted">{item.time}</span><span className="min-w-0 flex-1 truncate text-[10px] leading-3 text-dashboard-foreground"><span className="block truncate">{item.text}</span><span className="block truncate text-[9px] leading-3 text-dashboard-muted">{item.detail}</span></span><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.tone}`} aria-hidden="true" /></li>)}</ol></section>;
}
