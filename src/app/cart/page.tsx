"use client";
import { useCart } from "@/components/cart/CartContext";
import Image from "next/image";
import Link from "next/link";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { EmptyState } from "@/components/ui/States";
import { Price } from "@/components/ui/Price";
import { QuantitySelector } from "@/components/ui/QuantitySelector";

export default function CartPage() {
  const { items, total, count, increase, decrease, remove, qrId, tableLabel, clear } = useCart();
  if (items.length === 0) {
    return (
      <div className="pb-24 md:pb-12">
        <TopBar />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <EmptyState
            title="سبد خرید شما خالی است"
            description="برای شروع، یک محصول به سبد اضافه کنید."
            icon="🧺"
            action={
              <Link href="/" className="btn-primary">
                مشاهده منو
              </Link>
            }
          />
        </main>
        <BottomNav />
      </div>
    );
  }
  return (
    <div className="pb-32 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="heading-section">سبد خرید</h1>
          <button onClick={clear} className="btn-ghost text-sm">پاک کردن</button>
        </div>
        {tableLabel ? (
          <div className="mb-4 rounded-2xl border border-olive/20 bg-olive-50 p-3 text-sm text-olive-600">
            سفارش برای {tableLabel}
          </div>
        ) : (
          <div className="mb-4 rounded-2xl border border-coffee/15 bg-beige-soft p-3 text-sm text-espresso/80">
            سفارش بیرون‌بر — پس از آماده شدن، برای تحویل اطلاع داده می‌شود.
          </div>
        )}
        <ul className="space-y-3">
          {items.map((i) => (
            <li
              key={`${i.productId}::${i.coffeeLineId ?? ""}`}
              className="flex items-center gap-3 rounded-2xl border border-coffee/10 bg-cream-50 p-3 dark:border-dark-border dark:bg-dark-surface"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-beige">
                {i.image && <Image src={i.image} alt={i.name} fill className="object-cover" />}
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <span className="font-semibold text-espresso">{i.name}</span>
                {i.coffeeLineName && (
                  <span className="w-fit rounded-full bg-olive-50 px-2 py-0.5 text-xs text-olive-600">
                    خط قهوه: {i.coffeeLineName}
                  </span>
                )}
                <Price amount={i.price} size="sm" className="text-muted" />
                <QuantitySelector
                  value={i.quantity}
                  min={0}
                  onChange={(n) => {
                    if (n > i.quantity) increase(i.productId, i.coffeeLineId);
                    else decrease(i.productId, i.coffeeLineId);
                  }}
                />
              </div>
              <div className="flex flex-col items-end gap-2">
                <Price amount={i.price * i.quantity} size="sm" />
                <button
                  onClick={() => remove(i.productId, i.coffeeLineId)}
                  className="btn-ghost text-xs text-danger"
                >
                  حذف
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-2xl border border-coffee/10 bg-cream-50 p-4 dark:border-dark-border dark:bg-dark-surface">
          <div className="mb-2 flex items-center justify-between text-sm text-muted">
            <span>{count} محصول</span>
            <span>جمع</span>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-lg font-semibold">مبلغ کل</span>
            <Price amount={total} size="lg" />
          </div>
          <Link
            href={`/checkout${qrId ? `?qr=${qrId}` : ""}`}
            className="btn-primary w-full"
          >
            ادامه و ثبت سفارش
          </Link>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
