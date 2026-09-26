"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/ui/LogoutButton";
import type { CashierTabId } from "@/lib/cashier-tabs";

type NavItem = { href: string; label: string; icon: string; ownerOnly?: boolean; cashierTab?: CashierTabId; cashierTabAny?: CashierTabId[]; parent?: string };

const NAV: NavItem[] = [
  { href: "/admin", label: "داشبورد", icon: "📊", cashierTab: "dashboard" },
  { href: "/admin/operations", label: "نیازهای عملیات", icon: "🧭", ownerOnly: true },
  { href: "/admin/sales-flow/settings", label: "تنظیمات جریان فروش", icon: "⚙️", ownerOnly: true },
  // Legacy assistant: nested under the workspace that replaced it, so it no
  // longer reads as a top-level destination.
  // میزها and رزرو میزها share one page, so either cashier permission reveals it.
  { href: "/admin/users", label: "کاربران", icon: "👥", ownerOnly: true },
];

function NavLinks({ role, cashierTabs, onNavigate }: { role: string; cashierTabs: CashierTabId[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isOwner = role === "OWNER" || role === "ADMIN";
  const allowed = (n: NavItem) => {
    if (n.ownerOnly) return isOwner;
    if (isOwner) return true;
    if (n.cashierTabAny) return n.cashierTabAny.some((tab) => cashierTabs.includes(tab));
    return !n.cashierTab || cashierTabs.includes(n.cashierTab);
  };
  const items = NAV.filter((n) => allowed(n) && !n.parent);
  const childrenOf = (href: string) => NAV.filter((n) => n.parent === href && allowed(n));
  return (
    <nav aria-label="ناوبری مدیریت" className="min-h-0 flex-1 overflow-y-auto">
      <ul className="space-y-1">
        {items.map((n) => {
          const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
          return (
            <li key={n.href}>
              <Link
                href={n.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border border-saffron/50 bg-lapis text-espresso shadow-soft"
                    : "text-muted hover:bg-cream-200 dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover"
                }`}
              >
                <span aria-hidden="true" className="w-5 text-center">{n.icon}</span>
                <span>{n.label}</span>
              </Link>
              {(() => {
                const nested = childrenOf(n.href);
                if (nested.length === 0) return null;
                return (
                  <ul className="mt-1 space-y-1 border-s-2 border-coffee/15 ps-2 dark:border-dark-border/60">
                    {nested.map((child) => {
                      const childActive = pathname === child.href || pathname.startsWith(`${child.href}/`);
                      return (
                        <li key={child.href}>
                          <Link
                            href={child.href}
                            onClick={onNavigate}
                            aria-current={childActive ? "page" : undefined}
                            className={`flex items-center gap-2 rounded-lg py-1.5 pe-2 text-xs transition-colors ${
                              childActive
                                ? "bg-lapis text-espresso"
                                : "text-muted hover:bg-cream-200 dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover"
                            }`}
                          >
                            <span aria-hidden="true" className="w-4 text-center text-[11px]">{child.icon}</span>
                            <span>{child.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Brand() {
  return (
    <div className="mb-6 flex items-center gap-2">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-lapis text-espresso font-bold">ف</span>
      <div className="flex flex-col leading-tight">
        <span className="font-bold text-espresso dark:text-dark-text">پنل مدیریت</span>
        <span className="text-[11px] text-muted dark:text-dark-textSecondary">کافه ۱۳</span>
      </div>
    </div>
  );
}

export function AdminSidebar({ role, cashierTabs }: { role: string; cashierTabs: CashierTabId[] }) {
  const [open, setOpen] = useState(false);

  // Close the drawer on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* Mobile top bar with hamburger */}
      <div className="admin-mobile-header sticky top-0 z-40 flex items-center justify-between border-b border-coffee/20 bg-cream-50/95 px-4 py-3 backdrop-blur md:hidden dark:border-dark-border dark:bg-dark-surface/90">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-lapis text-espresso font-bold text-sm">ف</span>
          <span className="font-bold text-espresso dark:text-dark-text">پنل مدیریت</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="باز کردن منو"
          aria-expanded={open}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-coffee/15 bg-cream-50 text-espresso hover:bg-beige dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover"
        >
          <span aria-hidden="true" className="text-lg">☰</span>
        </button>
      </div>

      {/* Desktop sidebar — attached to the RIGHT edge (natural in RTL) */}
      <aside className="admin-desktop-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-s border-coffee/20 bg-cream-50 p-4 md:flex dark:border-dark-border dark:bg-dark-surface">
        <Brand />
        <NavLinks role={role} cashierTabs={cashierTabs} />
        <LogoutButton callbackUrl="/admin/login" className="btn-secondary mt-4 w-full shrink-0 text-sm" />
      </aside>

      {/* Mobile drawer — opens from the right (RTL side) */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-espresso/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="admin-drawer absolute inset-y-0 right-0 flex w-72 max-w-full flex-col border-s border-coffee/20 bg-cream-50 p-4 shadow-elevated animate-fade-in dark:border-dark-border dark:bg-dark-surface dark:shadow-dark-card">
            <div className="flex items-center justify-between">
              <Brand />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="بستن منو"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-espresso hover:bg-beige dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover"
              >
                ✕
              </button>
            </div>
            <NavLinks role={role} cashierTabs={cashierTabs} onNavigate={() => setOpen(false)} />
            <LogoutButton callbackUrl="/admin/login" className="btn-secondary mt-4 w-full shrink-0 text-sm" />
          </div>
        </div>
      )}
    </>
  );
}
