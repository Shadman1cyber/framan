"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CafeBrand } from "./CafeBrand";
import { useTheme } from "@/lib/ThemeContext";

const THEME_OPTIONS: Array<{ value: "light" | "dark" | "system"; label: string; icon: string }> = [
  { value: "light", label: "روشن", icon: "☀️" },
  { value: "dark", label: "تیره", icon: "🌙" },
  { value: "system", label: "سیستم", icon: "💻" },
];

export function TopBar({
  showTable,
  tableLabel,
}: {
  showTable?: boolean;
  tableLabel?: string | null;
}) {
  const { data: session } = useSession();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const user = session?.user;
  const role = (user as { role?: string } | undefined)?.role;
  const isManagement = role === "ADMIN" || role === "STAFF" || role === "OWNER" || role === "CASHIER";

  const currentOption = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[2];

  return (
    <header className="sticky top-0 z-30 border-b border-coffee/10 bg-cream-50/80 backdrop-blur dark:border-dark-border dark:bg-dark-bg/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <CafeBrand />
        </Link>
        <div className="flex items-center gap-3">
          {showTable && tableLabel && (
            <span className="hidden rounded-full border border-olive/30 bg-olive-50 px-3 py-1 text-xs font-medium text-olive-600 dark:border-olive/40 dark:bg-olive/20 dark:text-olive-300 md:inline-flex">
              {tableLabel}
            </span>
          )}
          <div className="relative">
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-coffee/15 bg-cream-50 text-espresso transition-colors hover:bg-beige dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover"
              aria-label="تنظیمات تم"
              aria-expanded={themeMenuOpen}
              aria-haspopup="true"
            >
              <span aria-hidden="true" className="text-lg">{currentOption.icon}</span>
            </button>
            {themeMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setThemeMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 top-full z-50 mt-2 w-40 origin-top-right rounded-xl border border-coffee/15 bg-cream-50 shadow-elevated dark:border-dark-border dark:bg-dark-surface animate-fade-in">
                  <ul role="menu" className="py-1">
                    {THEME_OPTIONS.map((opt) => (
                      <li key={opt.value}>
                        <button
                          role="menuitem"
                          onClick={() => {
                            setTheme(opt.value);
                            setThemeMenuOpen(false);
                          }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right ${theme === opt.value ? "bg-olive/10 text-olive-700 dark:bg-olive/20 dark:text-olive-300" : "text-espresso dark:text-dark-text hover:bg-beige dark:hover:bg-dark-surfaceHover"}`}
                        >
                          <span aria-hidden="true">{opt.icon}</span>
                          <span>{opt.label}</span>
                          {theme === opt.value && <span aria-hidden="true">✓</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
          {user ? (
            <>
              {isManagement ? (
                <Link
                  href="/admin"
                  className="hidden items-center gap-1 rounded-xl border border-olive/30 bg-olive-50 px-3 py-2 text-xs font-medium text-olive-700 transition-colors hover:bg-olive-100 dark:border-olive/40 dark:bg-olive/20 dark:text-olive-300 dark:hover:bg-olive/30 md:inline-flex"
                >
                  <span aria-hidden="true">⚙</span>
                  مدیریت
                </Link>
              ) : null}
              <Link
                href="/profile"
                className="hidden rounded-xl border border-coffee/15 bg-cream-50 px-3 py-2 text-xs font-medium text-espresso transition-colors hover:bg-beige dark:border-dark-border dark:bg-dark-surface dark:text-dark-text dark:hover:bg-dark-surfaceHover md:inline-flex"
              >
                {user.name ?? user.email}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-xl px-3 py-2 text-xs font-medium text-espresso/80 transition-colors hover:bg-beige dark:text-dark-textSecondary dark:hover:bg-dark-surfaceHover md:inline-flex"
              >
                ورود
              </Link>
              <Link
                href="/register"
                className="hidden rounded-xl border border-olive/30 bg-olive px-3 py-2 text-xs font-medium text-cream transition-colors hover:bg-olive-600 md:inline-flex"
              >
                ثبتنام
              </Link>
            </>
          )}
          {!isManagement && (
            <Link
              href="/cart"
              className="relative inline-flex items-center gap-1 rounded-xl border border-coffee/15 bg-cream-50 px-3 py-2 text-sm hover:bg-beige dark:border-dark-border dark:bg-dark-surface dark:hover:bg-dark-surfaceHover"
              aria-label="سبد خرید"
            >
              <span aria-hidden="true">🧺</span>
              <span className="hidden md:inline">سبد</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}