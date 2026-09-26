"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartContext";
import { TopBar } from "@/components/nav/TopBar";
import { Price } from "@/components/ui/Price";
import { useToast } from "@/components/ui/Toast";
import { useOffline } from "@/lib/offline/OfflineContext";
import { enqueueAction } from "@/lib/offline/queue";

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { items, total, clear, qrId, tableLabel, hydrated } = useCart();
  const { isOnline } = useOffline();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const { show } = useToast();

  const [discountCodeInput, setDiscountCodeInput] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<{
    code: string;
    amount: number;
    finalTotal: number;
  } | null>(null);
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // Prices may have changed while a quote was applied — drop it so we never
  // submit at a stale price (the server re-validates anyway).
  useEffect(() => {
    setAppliedDiscount(null);
  }, [total]);

  const finalTotal = appliedDiscount
    ? Math.max(0, total - appliedDiscount.amount)
    : total;

  async function applyDiscount() {
    const code = discountCodeInput.trim();
    if (!code) return;
    setApplyingDiscount(true);
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, subtotal: total }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "کد تخفیف معتبر نیست");
      setAppliedDiscount({
        code: json.quote.code,
        amount: json.quote.amount,
        finalTotal: json.quote.finalTotal,
      });
      show("کد تخفیف اعمال شد", "success");
    } catch (err) {
      setAppliedDiscount(null);
      show(err instanceof Error ? err.message : "کد تخفیف معتبر نیست", "error");
    } finally {
      setApplyingDiscount(false);
    }
  }

  function removeDiscount() {
    setAppliedDiscount(null);
    setDiscountCodeInput("");
  }

  useEffect(() => {
    if (!hydrated || submittedRef.current) return;
    if (items.length === 0 && typeof window !== "undefined") {
      router.replace("/cart");
    }
  }, [hydrated, items.length, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const orderPayload = {
        qrCodeId: qrId,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          coffeeLineId: i.coffeeLineId ?? undefined,
        })),
        customerName: name || undefined,
        customerPhone: phone || undefined,
        notes: notes || undefined,
        ...(appliedDiscount ? { discountCode: appliedDiscount.code } : {}),
      };

      if (isOnline) {
        const res = await fetch("/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(orderPayload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "خطا");
        submittedRef.current = true;
        clear();
        router.push(`/order/${json.order.id}`);
      } else {
        await enqueueAction({
          type: "PLACE_ORDER",
          payload: orderPayload,
        });
        show(
          appliedDiscount
            ? "سفارش با کد تخفیف ذخیره شد؛ کد هنگام ثبت نهایی دوباره بررسی می‌شود و در صورت نامعتبر بودن سفارش با همان قیمت ثبت نمی‌شود"
            : "سفارش شما ذخیره شد و به محض اتصال اینترنت ثبت می‌شود",
          appliedDiscount ? "info" : "success",
        );
        submittedRef.current = true;
        clear();
        router.push("/orders");
      }
    } catch (err) {
      show(err instanceof Error ? err.message : "خطا در ثبت سفارش", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitting || (!hydrated && items.length === 0)) return null;

  if (items.length === 0) {
    return (
      <div className="pb-24 md:pb-12">
        <TopBar />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <h1 className="heading-section mb-4">تایید نهایی</h1>
          <p className="text-muted">در حال انتقال به سبد...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="pb-24 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="heading-section mb-4">تایید نهایی</h1>
        {tableLabel && (
          <div className="mb-4 rounded-2xl border border-olive/20 bg-olive-50 p-3 text-sm text-olive-600 dark:border-olive/40 dark:bg-olive/10 dark:text-olive-300">
            سفارش شما برای {tableLabel} ثبت می‌شود.
          </div>
        )}
        {!isOnline && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber/40 dark:bg-amber/10 dark:text-amber-300">
            <span className="flex items-center gap-2">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 1l22 22" />
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" />
              </svg>
              آفلاین هستید — سفارش در صف ذخیره و به محض اتصال ثبت می‌شود
            </span>
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-2xl border border-coffee/10 bg-cream-50 p-4 dark:border-dark-border dark:bg-dark-surface">
            <h2 className="mb-2 text-sm font-semibold">اقلام</h2>
            <ul className="space-y-1 text-sm">
              {items.map((i) => (
                <li key={`${i.productId}::${i.coffeeLineId ?? ""}`} className="flex justify-between">
                  <span>
                    {i.name}
                    {i.coffeeLineName ? ` — ${i.coffeeLineName}` : ""} × {i.quantity}
                  </span>
                  <Price amount={i.price * i.quantity} size="sm" />
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1.5 border-t border-coffee/10 pt-3 dark:border-dark-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted">جمع اقلام</span>
                <Price amount={total} size="sm" />
              </div>
              {appliedDiscount && (
                <div className="flex justify-between text-sm text-olive-600 dark:text-olive-300">
                  <span>
                    تخفیف ({appliedDiscount.code})
                    <button
                      type="button"
                      onClick={removeDiscount}
                      className="ms-2 text-xs text-danger underline"
                    >
                      حذف
                    </button>
                  </span>
                  <span>− {appliedDiscount.amount.toLocaleString("fa-IR")} تومان</span>
                </div>
              )}
              <div className="flex justify-between border-t border-coffee/10 pt-2 dark:border-dark-border">
                <span className="font-semibold">مبلغ قابل پرداخت</span>
                <Price amount={finalTotal} size="md" />
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                className="input flex-1"
                placeholder="کد تخفیف"
                value={discountCodeInput}
                onChange={(e) => setDiscountCodeInput(e.target.value)}
                disabled={appliedDiscount != null}
                aria-label="کد تخفیف"
              />
              {appliedDiscount ? (
                <button type="button" onClick={removeDiscount} className="btn-secondary text-sm">
                  حذف کد
                </button>
              ) : (
                <button
                  type="button"
                  onClick={applyDiscount}
                  disabled={applyingDiscount || !discountCodeInput.trim()}
                  className="btn-secondary text-sm"
                >
                  {applyingDiscount ? "بررسی..." : "اعمال"}
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-coffee/10 bg-cream-50 p-4 dark:border-dark-border dark:bg-dark-surface">
            <h2 className="mb-2 text-sm font-semibold">اطلاعات تماس (اختیاری)</h2>
            <p className="mb-3 text-xs text-muted">برای اطلاع‌رسانی درباره سفارش مفید است.</p>
            <label className="label" htmlFor="name">نام</label>
            <input
              id="name"
              className="input mb-3"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="نام شما"
            />
            <label className="label" htmlFor="phone">شماره تماس</label>
            <input
              id="phone"
              type="tel"
              className="input mb-3"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="۰۹۱۲..."
            />
            <label className="label" htmlFor="notes">یادداشت</label>
            <textarea
              id="notes"
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="مثلاً بدون شکر"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full"
          >
            {submitting ? "در حال ثبت..." : isOnline ? "ثبت سفارش" : "ذخیره برای ثبت آفلاین"}
          </button>
        </form>
      </main>
    </div>
  );
}