"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LogoutButton } from "@/components/ui/LogoutButton";

function SearchIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.2" /><path d="m16 16 4.5 4.5" /></svg>;
}

function BellIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>;
}

const quickLinks = [
  { label: "حسابداری", href: "/admin/financial" },
  { label: "ERP و انبار", href: "/admin/inventory" },
  { label: "CRM و مشتریان", href: "/admin/customers" },
  { label: "سفارش‌ها", href: "/admin/orders" },
];

export function DashboardHeader() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const matches = quickLinks.filter((item) => item.label.includes(query.trim()));

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    router.push(matches[0]?.href ?? "/admin");
  }

  return <header dir="rtl" className="sticky top-0 z-30 h-[76px] border-b border-dashboard-line bg-dashboard/95 backdrop-blur-xl"><div className="mx-auto flex h-full max-w-[1536px] items-center gap-3 pl-4 pr-10 sm:gap-4 sm:pl-6 sm:pr-10 xl:pl-[43px] xl:pr-10"><div className="flex shrink-0 items-center gap-2.5"><span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-erp/40 bg-erp/20 text-sm font-bold text-erp shadow-[0_0_18px_rgba(79,134,255,0.18)]">آ</span><div className="hidden leading-tight sm:block"><p className="text-xs font-semibold text-dashboard-foreground">رستوران آریانا</p><p className="mt-1 text-[10px] text-dashboard-muted">مدیر عامل</p></div></div><span className="hidden w-8 sm:block" /><button type="button" aria-label="اعلان‌ها" className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashboard-line bg-dashboard-surface text-dashboard-muted transition-colors hover:border-erp/40 hover:text-dashboard-foreground"><BellIcon /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-accent-red ring-2 ring-dashboard" /></button><form onSubmit={submitSearch} className="relative ml-1 mr-7 hidden w-[230px] sm:block lg:w-[230px]"><label htmlFor="dashboard-search" className="sr-only">جستجو</label><div className="flex h-10 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/80 px-3 transition-colors focus-within:border-erp/50"><SearchIcon /><input id="dashboard-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو..." className="min-w-0 flex-1 bg-transparent text-xs text-dashboard-foreground outline-none placeholder:text-dashboard-muted" /></div>{query && <div className="absolute inset-x-0 top-12 overflow-hidden rounded-xl border border-dashboard-line bg-dashboard-surface shadow-elevated">{matches.length ? matches.map((item) => <Link key={item.href} href={item.href} onClick={() => setQuery("")} className="flex items-center justify-between px-3 py-2.5 text-xs text-dashboard-foreground hover:bg-dashboard-raised">{item.label}<span className="text-dashboard-muted">←</span></Link>) : <p className="px-3 py-3 text-xs text-dashboard-muted">نتیجه‌ای پیدا نشد</p>}</div>}</form><LogoutButton callbackUrl="/admin/login" label="خروج" className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-2 focus:z-50 focus:rounded-lg focus:border focus:border-dashboard-line focus:bg-dashboard-surface focus:px-2 focus:py-1 focus:text-[10px] focus:text-dashboard-foreground" /><div className="flex-1" /><span className="hidden text-[11px] text-dashboard-muted lg:block xl:translate-x-4">تصمیم بهتر، کسب‌وکار قوی‌تر</span><span className="hidden h-6 w-px bg-dashboard-line sm:block xl:translate-x-8" /><Link href="/admin" className="hidden items-center gap-[13px] sm:flex"><span className="text-base font-bold tracking-[0.24em] text-dashboard-foreground">FARMAN</span><span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/80 bg-white text-dashboard"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 19V5h14M5 11h10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg></span></Link></div><form onSubmit={submitSearch} className="absolute inset-x-4 top-[68px] sm:hidden"><div className="flex h-9 items-center gap-2 rounded-full border border-dashboard-line bg-dashboard-surface/80 px-3"><SearchIcon /><input aria-label="جستجو" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جستجو..." className="min-w-0 flex-1 bg-transparent text-xs text-dashboard-foreground outline-none placeholder:text-dashboard-muted" /></div></form></header>;
}
