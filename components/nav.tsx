"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Building2,
  GitBranch,
  Landmark,
  ListChecks,
  MessageSquare,
  ScrollText,
  Settings,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { company } from "@/lib/mock-data";

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: ReactNode }> }> = [  {
    label: "کارها",
    items: [
      { href: "/", label: "مرکز فرماندهی", icon: <ListChecks size={16} /> },
      { href: "/chat", label: "گفت‌وگو", icon: <MessageSquare size={16} /> },
      { href: "/tasks", label: "کارهای من", icon: <ListChecks size={16} /> },
      { href: "/workflows", label: "جریان‌های کاری", icon: <GitBranch size={16} /> },
    ],
  },
  {
    label: "عملیات",
    items: [
      { href: "/procurement", label: "تدارکات", icon: <Boxes size={16} /> },
      { href: "/finance", label: "مالی", icon: <Landmark size={16} /> },
      { href: "/business", label: "کسب‌وکار", icon: <Building2 size={16} /> },
    ],
  },
  {
    label: "پلتفرم",
    items: [
      { href: "/agents", label: "عامل‌ها", icon: <Boxes size={16} /> },
      { href: "/activity", label: "فعالیت و حسابرسی", icon: <ScrollText size={16} /> },
      { href: "/policies", label: "سیاست‌ها و دسترسی‌ها", icon: <ShieldCheck size={16} /> },
      { href: "/settings", label: "تنظیمات و یکپارچه‌سازی", icon: <Settings size={16} /> },
    ],
  },
];

export function Nav({
  user,
}: {
  user?: { name: string; title: string } | null;
}) {
  const pathname = usePathname();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-10 hidden w-60 flex-col border-e-[0.5px] border-borders bg-white md:flex">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-baseline gap-1.5">
            <span className="text-base font-medium">فرمان</span>
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          </Link>
          <div className="mt-0.5 text-sm text-neutral-500">{company.name}</div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="px-2 pb-1 text-xs text-neutral-400">{group.label}</div>
              {group.items.map((item) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mb-0.5 flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm ${
                      active
                        ? "bg-brand-soft font-medium text-brand"
                        : "text-neutral-600 hover:bg-white hover:text-neutral-900"
                    }`}
                  >
                    <span className={active ? "text-brand" : "text-neutral-400"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {user ? (
          <div className="border-t-[0.5px] border-borders px-4 py-3">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-neutral-500">{user.title}</div>
            <button
              onClick={signOut}
              className="mt-2 text-xs text-neutral-500 underline hover:text-neutral-900"
            >
              خروج
            </button>
          </div>
        ) : (
          <div className="flex gap-3 border-t-[0.5px] border-borders px-4 py-3">
            <Link href="/login" className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-hover">
              ورود
            </Link>
            <Link href="/signup" className="px-1 py-1.5 text-sm underline hover:text-neutral-600">
              ساخت حساب
            </Link>
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 border-b-[0.5px] border-borders bg-white md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-medium">
            فرمان
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/tasks" className="text-sm text-amber-700">
              نیازمند شما
            </Link>
            {user ? (
              <button onClick={signOut} className="text-sm text-neutral-500 underline">
                خروج
              </button>
            ) : (
              <Link href="/login" className="text-sm underline">
                ورود
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {groups.flatMap((g) => g.items).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap ${active ? "font-medium text-brand" : "text-neutral-500"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
    </>
  );
}
