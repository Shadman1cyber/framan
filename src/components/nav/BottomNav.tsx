"use client";
import { useCart } from "@/components/cart/CartContext";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "منو", icon: "☕" },
  { href: "/search", label: "جستجو", icon: "🔍" },
  { href: "/orders", label: "سفارش‌ها", icon: "📦" },
  { href: "/profile", label: "حساب", icon: "👤" },
];

export function BottomNav() {
  const pathname = usePathname();
  const { count } = useCart();
  return (
    <nav
      aria-label="ناوبری اصلی"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-coffee/10 bg-cream-50/95 backdrop-blur md:hidden"
    >
      <ul className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {items.map((i) => {
          const active = pathname === i.href || (i.href !== "/" && pathname.startsWith(i.href));
          return (
            <li key={i.href} className="flex-1">
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-olive-600" : "text-espresso/60"}`}
              >
                <span className="text-lg" aria-hidden="true">{i.icon}</span>
                <span>{i.label}</span>
                {i.href === "/cart" && count > 0 && (
                  <span className="absolute top-1 left-1/2 ml-3 rounded-full bg-danger px-1.5 text-[10px] font-bold text-cream">
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}