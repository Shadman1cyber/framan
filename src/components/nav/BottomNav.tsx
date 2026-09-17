"use client";
import { useCart } from "@/components/cart/CartContext";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "منو", icon: "☕" },
  { href: "/orders", label: "سفارش‌ها", icon: "📦" },
  { href: "/profile", label: "حساب", icon: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { count } = useCart();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isManagement = role === "ADMIN" || role === "STAFF" || role === "OWNER" || role === "CASHIER";
  const visibleItems = isManagement
    ? items.filter((i) => i.href !== "/")
    : items;
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-coffee/10 bg-cream-50/95 backdrop-blur md:hidden dark:border-dark-border dark:bg-dark-surface/95"
    >
      <ul className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {visibleItems.map((i) => {
          const active = pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href));
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-olive-600 dark:text-olive-300" : "text-espresso/60 dark:text-dark-textSecondary/60"}`}
              >
                <span className="text-lg" aria-hidden="true">{i.icon}</span>
                <span>{i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}