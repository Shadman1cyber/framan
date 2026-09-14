import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { Price } from "@/components/ui/Price";
import { ORDER_STATUS_LABELS_FA, orderStatusLabel, type OrderStatus, type OrderType } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

function stepsFor(orderType: OrderType): OrderStatus[] {
  return orderType === "TABLE"
    ? ["PENDING", "CONFIRMED", "PREPARING", "COMPLETED"]
    : ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];
}

export default async function OrderPage({ params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: {
      items: { include: { product: true } },
      table: true,
      qrCode: true,
    },
  });
  if (!order) notFound();

  const orderType = (order.orderType as OrderType) ?? "TAKEAWAY";
  const steps = stepsFor(orderType);
  const currentStep = steps.indexOf(order.status as OrderStatus);
  const isCancelled = order.status === "CANCELLED";
  const isCompleted = order.status === "COMPLETED";
  // Table orders are identified by their table number.
  const orderTitle =
    orderType === "TABLE" && order.table
      ? `سفارش ${order.table.label ?? `میز ${order.table.number}`}`
      : `سفارش ${order.id.slice(-6).toUpperCase()}`;

  return (
    <div className="pb-24 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="heading-section mb-2">{orderTitle}</h1>
        <p className="mb-6 text-sm text-muted">
          کد پیگیری: {order.id.slice(-6).toUpperCase()} · ثبت شده در{" "}
          {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(order.createdAt)}
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="chip">{orderType === "TABLE" ? "سفارش میز" : "بیرون‌بر"}</span>
          {order.table && (
            <span className="chip chip-active">میز: {order.table.label ?? order.table.number}</span>
          )}
        </div>

        {/* Preparation estimate — shown as a range, never a fake exact time */}
        {order.estPrepMin != null && order.estPrepMax != null && !isCancelled && !isCompleted && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border border-olive/25 bg-olive-50 p-4">
            <span aria-hidden="true" className="text-2xl">⏱</span>
            <div>
              <p className="text-sm font-semibold text-olive-700">زمان تقریبی آماده‌سازی</p>
              <p className="text-sm text-olive-600">
                {formatNumber(order.estPrepMin)} تا {formatNumber(order.estPrepMax)} دقیقه
              </p>
            </div>
          </div>
        )}

        {!isCancelled && (
          <ol className="mb-6 flex items-center justify-between rounded-2xl border border-coffee/10 bg-cream-50 p-4">
            {steps.map((s, i) => {
              const done = i <= currentStep;
              return (
                <li key={s} className="flex flex-1 flex-col items-center text-center">
                  <span
                    className={`mb-1 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-olive text-cream" : "bg-beige text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-[11px] text-espresso/70">
                    {orderStatusLabel(s, orderType)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {isCancelled && (
          <div className="mb-4 rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            این سفارش لغو شده است.
          </div>
        )}
        {isCompleted && (
          <div className="mb-4 rounded-2xl border border-olive/25 bg-olive-50 p-3 text-sm text-olive-700">
            این سفارش تکمیل شد. امیدواریم لذت برده باشید!
          </div>
        )}

        {/* Post-order rating CTA */}
        {isCompleted && (
          <div className="mb-4 rounded-2xl border border-coffee/15 bg-beige-soft p-4">
            <p className="mb-2 text-sm font-semibold text-espresso">نظر شما برای ما ارزشمند است</p>
            <p className="mb-3 text-xs text-muted">
              با ثبت امتیاز به بهبود کیفیت کمک کنید. (ورود برای ثبت امتیاز لازم است)
            </p>
            <ul className="flex flex-wrap gap-2">
              {order.items.map((it) => (
                <li key={it.id}>
                  <Link
                    href={`/product/${it.product.slug}#rate`}
                    className="chip chip-active"
                  >
                    ★ امتیاز به {it.product.nameFa}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="mb-4 rounded-2xl border border-coffee/10 bg-cream-50 p-4">
          <h2 className="mb-3 text-sm font-semibold">اقلام</h2>
          <ul className="space-y-2 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between">
                <span>
                  {it.product.nameFa}
                  {it.coffeeLineName ? (
                    <span className="ms-1 text-xs text-olive-600">({it.coffeeLineName})</span>
                  ) : null}
                  {" × "}
                  {it.quantity}
                </span>
                <Price amount={it.price * it.quantity} size="sm" />
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-coffee/10 pt-3">
            <span className="font-semibold">مبلغ کل</span>
            <Price amount={order.total} size="md" />
          </div>
        </section>

        {order.notes && (
          <p className="rounded-2xl border border-coffee/10 bg-cream-50 p-3 text-sm">
            یادداشت: {order.notes}
          </p>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
