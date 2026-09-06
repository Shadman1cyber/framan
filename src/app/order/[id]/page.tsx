import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { Price } from "@/components/ui/Price";
import { ORDER_STATUS_LABELS_FA, type OrderStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

const STEPS: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

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

  const currentStep = STEPS.indexOf(order.status as OrderStatus);
  const isCancelled = order.status === "CANCELLED";

  return (
    <div className="pb-24 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="heading-section mb-2">سفارش {order.id.slice(-6).toUpperCase()}</h1>
        <p className="mb-6 text-sm text-muted">
          ثبت شده در {new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(order.createdAt)}
        </p>

        {order.table && (
          <div className="mb-4 rounded-2xl border border-olive/20 bg-olive-50 p-3 text-sm text-olive-600">
            میز: {order.table.label ?? order.table.number}
          </div>
        )}

        {!isCancelled && (
          <ol className="mb-6 flex items-center justify-between rounded-2xl border border-coffee/10 bg-cream-50 p-4">
            {STEPS.map((s, i) => {
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
                  <span className="text-[11px] text-espresso/70">{ORDER_STATUS_LABELS_FA[s]}</span>
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

        <section className="mb-4 rounded-2xl border border-coffee/10 bg-cream-50 p-4">
          <h2 className="mb-3 text-sm font-semibold">اقلام</h2>
          <ul className="space-y-2 text-sm">
            {order.items.map((it) => (
              <li key={it.id} className="flex items-center justify-between">
                <span>
                  {it.product.nameFa} × {it.quantity}
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