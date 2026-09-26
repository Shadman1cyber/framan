"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { LogoutButton } from "@/components/ui/LogoutButton";
import { attentionItems } from "@/lib/dashboard/modules";
import { statToneClass } from "./StatItem";

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.5 4.5" /></svg>;
}

function BellIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

const quickLinks = [
  { label: "حسابداری", href: "/admin/accounting" },
  { label: "گزارش مالی", href: "/admin/financial" },
  { label: "جریان فروش", href: "/admin/sales-flow" },
  { label: "ERP", href: "/admin/erp" },
  { label: "CRM", href: "/admin/crm" },
  { label: "سفارش‌ها", href: "/admin/orders" },
  { label: "دستیار", href: "/admin/ai" },
  { label: "نیازهای عملیات", href: "/admin/operations" },
  { label: "تنظیمات جریان فروش", href: "/admin/sales-flow/settings" },
  { label: "کاربران", href: "/admin/users" },
  { label: "پرسنل", href: "/admin/staff" },
  { label: "میزها", href: "/admin/tables" },
];

export function DashboardHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = quickLinks.filter((item) => item.label.includes(query.trim()));
  // Bell: the dashboard's own "not settled yet" stats, newest module first.
  const notifications = attentionItems();
  const [openNotifications, setOpenNotifications] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openNotifications) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenNotifications(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) setOpenNotifications(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openNotifications]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    router.push(matches[0]?.href ?? "/admin");
  }

  return <header dir="rtl" className="sticky top-0 z-30 h-[76px] border-b border-dashboard-line bg-dashboard/95 backdrop-blur-xl"><div className="mx-auto flex h-full max-w-[1536px] items-center gap-3 pl-4 pr-10 sm:gap-4 sm:pl-6 sm:pr-10 xl:pl-[43px] xl:pr-10"><div className="flex shrink-0 items-center gap-2.5"><span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-erp/40 bg-erp/20 text-sm font-bold text-erp shadow-[0_0_18px_rgba(79,134,255,0.18)]">آ</span><div className="hidden leading-tight sm:block"><p className="text-xs font-semibold text-dashboard-foreground">رستوران آریانا</p><p className="mt-1 text-[11px] text-dashboard-muted">مدیر عامل</p></div></div><span className="hidden w-8 sm:block" /><div ref={notificationsRef} className="relative shrink-0"><button type="button" data-testid="notifications-toggle" aria-label="اعلان‌ها" aria-expanded={openNotifications} aria-haspopup="true" onClick={() => setOpenNotifications((value) => !value)} className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border bg-dashboard-surface transition-colors ${openNotifications ? "border-erp/60 text-dashboard-foreground" : "border-dashboard-line text-dashboard-muted hover:border-erp/40 hover:text-dashboard-foreground"}`}><BellIcon />{notifications.length > 0 && <span data-testid="notifications-count" className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-red px-1 font-mono text-[11px] font-semibold text-dashboard ring-2 ring-dashboard">{notifications.length}</span>}</button>{openNotifications && <div data-testid="notifications-panel" className="absolute right-0 top-12 z-40 w-[290px] overflow-hidden rounded-2xl border border-dashboard-line bg-dashboard-surface shadow-elevated"><div className="flex items-center justify-between border-b border-dashboard-line px-3.5 py-2.5"><p className="text-xs font-semibold text-dashboard-foreground">اعلان‌ها</p><span className="font-mono text-[11px] text-dashboard-muted">{notifications.length} مورد</span></div><ul className="max-h-[300px] overflow-y-auto p-1.5">{notifications.map((item) => <li key={`${item.kind}-${item.stat.label}`}><Link href={item.href} onClick={() => setOpenNotifications(false)} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors hover:bg-dashboard-raised"><span className={`h-[7px] w-[7px] shrink-0 rounded-full ${statToneClass(item.stat.tone)}`} aria-hidden="true" /><span className="min-w-0 flex-1"><span className="block truncate text-[12px] text-dashboard-foreground">{item.stat.label} — {item.stat.status}</span><span className="block truncate text-[11px] text-dashboard-muted">{item.moduleLabel}</span></span><span aria-hidden="true" className="text-dashboard-muted">←</span></Link></li>)}</ul></div>}</div><form onSubmit={submitSearch} className="relative ml-1 mr-7 hidden w-[230px] sm:block lg:w-[230px]"><label htmlFor="dashboard-search" className="sr-only">جستجو</label><div className="flex h-10 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/80 px-3 transition-colors focus-within:border-erp/50"><SearchIcon /><input id="dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو..." className="min-w-0 flex-1 bg-transparent text-xs text-dashboard-foreground outline-none placeholder:text-dashboard-muted" /></div>{query && <div className="absolute inset-x-0 top-12 overflow-hidden rounded-xl border border-dashboard-line bg-dashboard-surface shadow-elevated">{matches.length ? matches.map((item) => <Link key={item.href} href={item.href} onClick={() => setQuery("")} className="flex items-center justify-between px-3 py-2.5 text-xs text-dashboard-foreground hover:bg-dashboard-raised">{item.label}<span className="text-dashboard-muted">←</span></Link>) : <p className="px-3 py-3 text-xs text-dashboard-muted">نتیجه‌ای پیدا نشد</p>}</div>}</form><LogoutButton callbackUrl="/admin/login" label="خروج" className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-2 focus:z-50 focus:rounded-lg focus:border focus:border-dashboard-line focus:bg-dashboard-surface focus:px-2 focus:py-1 focus:text-[11px] focus:text-dashboard-foreground" /><div className="flex-1" /><span className="hidden text-[12px] text-dashboard-muted lg:block xl:translate-x-4">تصمیم بهتر، کسب‌وکار قوی‌تر</span><span className="hidden h-6 w-px bg-dashboard-line sm:block xl:translate-x-8" /><Link href="/admin" className="hidden items-center gap-[13px] sm:flex"><span className="text-base font-bold tracking-[0.24em] text-dashboard-foreground">FARMAN</span><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white text-dashboard"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V5h14M5 11h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></span></Link></div><form onSubmit={submitSearch} className="absolute inset-x-4 top-[68px] sm:hidden"><div className="flex h-9 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/80 px-3"><SearchIcon /><input aria-label="جستجو" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو..." className="min-w-0 flex-1 bg-transparent text-xs text-dashboard-foreground outline-none placeholder:text-dashboard-muted" /></div></form></header>;
}
