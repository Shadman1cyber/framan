"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/cart/CartContext";
import { TopBar } from "@/components/nav/TopBar";
import { Price } from "@/components/ui/Price";
import { useToast } from "@/components/ui/Toast";

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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const { show } = useToast();

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
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qrCodeId: qrId,
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          customerName: name || undefined,
          customerPhone: phone || undefined,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "خطا");
      submittedRef.current = true;
      clear();
      router.push(`/order/${json.order.id}`);
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
          <div className="mb-4 rounded-2xl border border-olive/20 bg-olive-50 p-3 text-sm text-olive-600">
            سفارش شما برای {tableLabel} ثبت می‌شود.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-2xl border border-coffee/10 bg-cream-50 p-4">
            <h2 className="mb-2 text-sm font-semibold">اقلام</h2>
            <ul className="space-y-1 text-sm">
              {items.map((i) => (
                <li key={i.productId} className="flex justify-between">
                  <span>{i.name} × {i.quantity}</span>
                  <Price amount={i.price * i.quantity} size="sm" />
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-between border-t border-coffee/10 pt-3">
              <span className="font-semibold">مبلغ کل</span>
              <Price amount={total} size="md" />
            </div>
          </div>

          <div className="rounded-2xl border border-coffee/10 bg-cream-50 p-4">
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
            {submitting ? "در حال ثبت..." : "ثبت سفارش"}
          </button>
        </form>
      </main>
    </div>
  );
}