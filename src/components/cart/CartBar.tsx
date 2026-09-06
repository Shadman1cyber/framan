"use client";
import { useCart } from "@/components/cart/CartContext";
import { Price } from "@/components/ui/Price";
import Link from "next/link";
import { useEffect, useState } from "react";

export function CartBar() {
  const { count, total } = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-coffee/10 bg-cream-50/95 p-3 backdrop-blur md:hidden">
      <Link
        href="/cart"
        className="flex items-center justify-between rounded-2xl bg-olive px-4 py-3 text-cream shadow-elevated"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cream-50/20 text-xs font-bold">
            {count}
          </span>
          <span>سبد خرید</span>
        </div>
        <Price amount={total} className="text-cream" />
      </Link>
    </div>
  );
}