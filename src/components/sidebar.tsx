"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  Factory,
  ShoppingCart,
  LineChart,
  Wallet,
  TrendingUp,
  ReceiptText,
  Bot,
  Cpu,
  ScrollText,
  ShieldCheck,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";

const NAV = [
  {
    section: null,
    items: [{ href: "/dashboard", label: "Command Center", icon: LayoutDashboard }],
  },
  {
    section: "Business",
    items: [
      { href: "/business/tasks", label: "Tasks", icon: ClipboardList },
      { href: "/business/setup", label: "Business Setup", icon: Building2 },
    ],
  },
  {
    section: "Procurement",
    items: [
      { href: "/procurement/requests", label: "Requests", icon: ShoppingCart },
      { href: "/procurement/suppliers", label: "Suppliers", icon: Factory },
      { href: "/procurement/orders", label: "Purchase Orders", icon: PackageIcon },
      { href: "/procurement/intelligence", label: "Intelligence", icon: LineChart },
    ],
  },
  {
    section: "Finance",
    items: [
      { href: "/finance/overview", label: "Overview", icon: Wallet },
      { href: "/finance/cashflow", label: "Cash Flow", icon: TrendingUp },
      { href: "/finance/expenses", label: "Expenses", icon: ReceiptText },
      { href: "/finance/cfo", label: "AI CFO", icon: Bot },
    ],
  },
  {
    section: "AI",
    items: [
      { href: "/ai/agents", label: "Agents", icon: Cpu },
      { href: "/ai/activity", label: "Activity", icon: ScrollText },
      { href: "/ai/approvals", label: "Approvals", icon: ShieldCheck, badgeKey: "approvals" as const },
    ],
  },
  {
    section: null,
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function PackageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

export function Sidebar({
  pendingApprovals,
  companyName,
}: {
  pendingApprovals: number;
  companyName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen((v) => !v)}
        className="lg:hidden fixed top-3 left-3 z-50 h-9 w-9 rounded-lg border border-line bg-surface text-ink-dim flex items-center justify-center"
        aria-label="Toggle navigation"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${mobileOpen ? "" : "-rotate-90"}`} />
      </button>

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[236px] border-r border-line bg-surface flex flex-col transition-transform lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand */}
        <div className="px-5 pt-5 pb-4">
          <Link href="/dashboard" className="block" onClick={() => setMobileOpen(false)}>
            <div className="flex items-baseline gap-2">
              <span className="text-[17px] font-bold tracking-[0.18em]">FARMAN</span>
              <span className="text-sm text-accent font-semibold" dir="rtl">فرمان</span>
            </div>
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-faint">
              Command · Authority · Execution
            </p>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-4">
          {NAV.map((group, gi) => (
            <div key={gi}>
              {group.section && (
                <p className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-widest text-ink-faint/80">
                  {group.section}
                </p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] transition-colors ${
                          active
                            ? "bg-accent-soft text-accent font-medium"
                            : "text-ink-dim hover:text-ink hover:bg-raised"
                        }`}
                      >
                        <Icon className={`h-[15px] w-[15px] ${active ? "text-accent" : "text-ink-faint"}`} />
                        <span className="flex-1">{item.label}</span>
                        {"badgeKey" in item && item.badgeKey === "approvals" && pendingApprovals > 0 && (
                          <span className="num rounded-md bg-warn/15 text-warn px-1.5 py-0.5 text-[10px] font-semibold">
                            {pendingApprovals}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-line px-4 py-3">
          <p className="text-[11px] text-ink-faint truncate">{companyName}</p>
          <p className="text-[10px] text-ink-faint/70 mt-0.5">Prototype v0.1 — demo data</p>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
