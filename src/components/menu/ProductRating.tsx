"use client";
import { useState } from "react";
import Link from "next/link";
import { Rating } from "@/components/ui/Rating";
import { useToast } from "@/components/ui/Toast";
import { usePathname, useSearchParams } from "next/navigation";
import { useOffline } from "@/lib/offline/OfflineContext";
import { enqueueAction } from "@/lib/offline/queue";

type Review = {
  id: string;
  rating: number;
  review: string | null;
  userName: string;
  createdAt: string;
};

/**
 * Product rating widget. Viewing is public; submitting requires authentication
 * (login flow returns the user back to this page to complete the rating).
 */
export function ProductRating({
  productId,
  authenticated,
  average,
  count,
  mine,
  reviews,
}: {
  productId: string;
  authenticated: boolean;
  average: number | null;
  count: number;
  mine: { rating: number; review: string | null } | null;
  reviews: Review[];
}) {
  const [userRating, setUserRating] = useState(mine?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [review, setReview] = useState(mine?.review ?? "");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const { show } = useToast();
  const { isOnline } = useOffline();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qrQuery = searchParams.get("qr") ?? searchParams.get("table");
  const backHref = qrQuery ? `${pathname}?${qrQuery ? `table=${qrQuery}` : ""}#rate` : `${pathname}#rate`;

  const displayValue = hover || userRating;

  async function submit() {
    if (!userRating) {
      show("ابتدا امتیاز را انتخاب کنید", "error");
      return;
    }
    setSaving(true);
    const payload = { productId, rating: userRating, review: review || undefined };
    try {
      if (isOnline) {
        const res = await fetch("/api/ratings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "خطا");
        show("امتیاز شما ثبت شد؛ سپاسگزاریم", "success");
        setSubmitted(true);
      } else {
        await enqueueAction({
          type: "SUBMIT_RATING",
          payload,
        });
        show("امتیاز شما ذخیره شد و به محض اتصال اینترنت ثبت می‌شود", "success");
        setSubmitted(true);
      }
    } catch (e) {
      show(e instanceof Error ? e.message : "خطا در ثبت امتیاز", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="rate" className="mt-10 scroll-mt-24">
      <div className="mb-4 flex items-end justify-between">
        <h2 className="heading-card">امتیاز و نظرات</h2>
        {count > 0 && average != null && <Rating value={average} count={count} size="md" />}
      </div>

      <div className="rounded-2xl border border-coffee/10 bg-cream-50 p-5 dark:border-dark-border dark:bg-dark-surface">
        {authenticated ? (
          <>
            {!isOnline && (
              <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 text-center dark:border-amber/40 dark:bg-amber/10 dark:text-amber-300">
                آفلاین هستید — امتیاز در صف ذخیره و هنگام اتصال ثبت می‌شود
              </div>
            )}
            <p className="mb-3 text-sm font-medium text-espresso dark:text-dark-text">
              {mine ? "امتیاز شما برای این محصول" : "به این محصول امتیاز دهید"}
            </p>
            <div className="mb-3 flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setUserRating(n);
                    setSubmitted(false);
                  }}
                  onMouseEnter={() => setHover(n)}
                  aria-label={`${n} ستاره`}
                  className="text-2xl transition-transform hover:scale-110"
                  style={{ color: n <= displayValue ? "var(--color-warning)" : "var(--color-text-muted)" }}
                >
                  ★
                </button>
              ))}
              {userRating > 0 && (
                <span className="ms-2 text-xs text-muted">{userRating} از ۵</span>
              )}
            </div>
            <textarea
              className="input mb-3"
              rows={2}
              maxLength={1000}
              placeholder="نظر شما (اختیاری)"
              value={review}
              onChange={(e) => setReview(e.target.value)}
            />
            <button
              type="button"
              onClick={submit}
              disabled={saving || submitted}
              className="btn-primary"
            >
              {saving ? "در حال ثبت..." : submitted ? "ثبت شد ✓" : mine ? "به‌روزرسانی امتیاز" : isOnline ? "ثبت امتیاز" : "ثبت امتیاز آفلاین"}
            </button>
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-espresso">برای ثبت امتیاز وارد شوید</p>
              <p className="mt-1 text-xs text-muted">
                مشاهده امتیازها برای همه آزاد است؛ ثبت امتیاز نیازمند حساب کاربری است.
              </p>
            </div>
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(backHref)}`}
              className="btn-secondary whitespace-nowrap text-sm"
            >
              ورود برای ثبت امتیاز
            </Link>
          </div>
        )}
      </div>

      {reviews.length > 0 && (
        <ul className="mt-4 space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-coffee/10 bg-cream-50 p-4 dark:border-dark-border dark:bg-dark-surface">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-semibold text-espresso dark:text-dark-text">{r.userName}</span>
                <Rating value={r.rating} />
              </div>
              {r.review && <p className="text-sm text-espresso/80 dark:text-dark-textSecondary">{r.review}</p>}
              <p className="mt-1 text-[11px] text-muted">
                {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short" }).format(new Date(r.createdAt))}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
