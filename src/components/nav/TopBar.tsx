"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CafeBrand } from "./CafeBrand";

export function TopBar({
  showTable,
  tableLabel,
}: {
  showTable?: boolean;
  tableLabel?: string | null;
}) {
  const { data: session } = useSession();
  const user = session?.user;
  const role = (user as { role?: string } | undefined)?.role;

  return (
    <header className="sticky top-0 z-30 border-b border-coffee/10 bg-cream-50/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <CafeBrand />
        </Link>
        <div className="flex items-center gap-3">
          {showTable && tableLabel && (
            <span className="hidden rounded-full border border-olive/30 bg-olive-50 px-3 py-1 text-xs font-medium text-olive-600 md:inline-flex">
              {tableLabel}
            </span>
          )}
          {user ? (
            <>
              {role === "ADMIN" || role === "STAFF" ? (
                <Link
                  href="/admin"
                  className="hidden items-center gap-1 rounded-xl border border-olive/30 bg-olive-50 px-3 py-2 text-xs font-medium text-olive-700 transition-colors hover:bg-olive-100 md:inline-flex"
                >
                  <span aria-hidden="true">⚙</span>
                  مدیریت
                </Link>
              ) : null}
              <Link
                href="/profile"
                className="hidden rounded-xl border border-coffee/15 bg-cream-50 px-3 py-2 text-xs font-medium text-espresso transition-colors hover:bg-beige md:inline-flex"
              >
                {user.name ?? user.email}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-xl px-3 py-2 text-xs font-medium text-espresso/80 transition-colors hover:bg-beige md:inline-flex"
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
          <Link
            href="/cart"
            className="relative inline-flex items-center gap-1 rounded-xl border border-coffee/15 bg-cream-50 px-3 py-2 text-sm hover:bg-beige"
            aria-label="سبد خرید"
          >
            <span aria-hidden="true">🧺</span>
            <span className="hidden md:inline">سبد</span>
          </Link>
        </div>
      </div>
    </header>
  );
}