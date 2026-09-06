"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const nav = [
  { href: "/admin", label: "داشبورد", icon: "📊" },
  { href: "/admin/products", label: "محصولات", icon: "🍽️" },
  { href: "/admin/categories", label: "دسته‌ها", icon: "🗂️" },
  { href: "/admin/ingredients", label: "مواد اولیه", icon: "🌿" },
  { href: "/admin/allergens", label: "آلرژن‌ها", icon: "⚠️" },
  { href: "/admin/orders", label: "سفارش‌ها", icon: "📦" },
  { href: "/admin/users", label: "کاربران", icon: "👥" },
  { href: "/admin/ratings", label: "امتیازها", icon: "⭐" },
  { href: "/admin/tables", label: "میزها", icon: "🪑" },
  { href: "/admin/qr", label: "کدهای QR", icon: "🔳" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l border-coffee/10 bg-cream-50 p-4 md:block">
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-olive text-cream font-bold">ف</span>
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-espresso">پنل مدیریت</span>
          <span className="text-[11px] text-muted">کافه فرمان</span>
        </div>
      </div>
      <nav aria-label="ناوبری مدیر">
        <ul className="space-y-1">
          {nav.map((n) => {
            const active = pathname === n.href || (n.href !== "/admin" && pathname.startsWith(n.href));
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${active ? "bg-olive text-cream" : "text-espresso/80 hover:bg-beige"}`}
                >
                  <span aria-hidden="true">{n.icon}</span>
                  <span>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-secondary mt-6 w-full text-sm">
        خروج
      </button>
    </aside>
  );
}