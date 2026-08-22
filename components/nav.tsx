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

const groups: Array<{ label: string; items: Array<{ href: string; label: string; icon: ReactNode }> }> = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Command center", icon: <ListChecks size={16} /> },
      { href: "/chat", label: "Chat", icon: <MessageSquare size={16} /> },
      { href: "/tasks", label: "My tasks", icon: <ListChecks size={16} /> },
      { href: "/workflows", label: "Workflows", icon: <GitBranch size={16} /> },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/procurement", label: "Procurement", icon: <Boxes size={16} /> },
      { href: "/finance", label: "Finance", icon: <Landmark size={16} /> },
      { href: "/business", label: "Business", icon: <Building2 size={16} /> },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/agents", label: "Agents", icon: <Boxes size={16} /> },
      { href: "/activity", label: "Activity & audit", icon: <ScrollText size={16} /> },
      { href: "/policies", label: "Policies & permissions", icon: <ShieldCheck size={16} /> },
      { href: "/settings", label: "Settings & integrations", icon: <Settings size={16} /> },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-60 flex-col border-r-[0.5px] border-borders bg-white md:flex">
        <div className="px-5 py-5">
          <Link href="/" className="text-base font-medium">
            Farman
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
                      active ? "bg-surface font-medium" : "text-neutral-600 hover:text-neutral-900"
                    }`}
                  >
                    <span className={active ? "text-neutral-900" : "text-neutral-400"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-10 border-b-[0.5px] border-borders bg-white md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-base font-medium">
            Farman
          </Link>
          <Link href="/tasks" className="text-sm text-amber-700">
            Needs you
          </Link>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-2 text-sm">
          {groups.flatMap((g) => g.items).map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap ${active ? "font-medium" : "text-neutral-500"}`}
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
