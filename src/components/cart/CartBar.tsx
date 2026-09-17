"use client";
import { useCart } from "@/components/cart/CartContext";
import { Price } from "@/components/ui/Price";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useOffline } from "@/lib/offline/OfflineContext";

export function CartBar() {
  const { count, total } = useCart();
  const { isOnline } = useOffline();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-coffee/10 bg-cream-50/95 p-3 backdrop-blur md:hidden dark:border-dark-border dark:bg-dark-surface/95">
      {!isOnline && (
        <div className="mb-2 text-center text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded-xl dark:bg-amber-900/30 dark:text-amber-300">
          آفلاین — سبد ذخیره شده و هنگام اتصال همگام‌سازی می‌شود
        </div>
      )}
      <Link
        href="/cart"
        className="flex items-center justify-between rounded-2xl bg-olive px-4 py-3 text-cream shadow-elevated"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/20 text-xs font-bold dark:bg-dark-surfaceHover">
            {count}
          </span>
          <span>سبد خرید</span>
        </div>
        <Price amount={total} className="text-cream" />
      </Link>
    </div>
  );
}