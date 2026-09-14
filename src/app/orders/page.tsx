import { TopBar } from "@/components/nav/TopBar";
import { BottomNav } from "@/components/nav/BottomNav";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Price } from "@/components/ui/Price";
import { ORDER_STATUS_LABELS_FA, orderStatusLabel, type OrderStatus, type OrderType } from "@/lib/constants";
import { EmptyState } from "@/components/ui/States";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await getServerSession(authOptions);
  const userId = session?.user ? (session.user as { id?: string }).id : null;
  const orders = userId
    ? await prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: { items: { include: { product: true } } },
        take: 50,
      })
    : [];

  return (
    <div className="pb-24 md:pb-12">
      <TopBar />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="heading-section mb-4">سفارش‌های من</h1>
        {!userId ? (
          <EmptyState
            title="برای مشاهده سفارش‌ها وارد شوید"
            description="می‌توانید بدون حساب هم از منو استفاده کنید."
            icon="🔒"
            action={<Link href="/login" className="btn-primary">ورود</Link>}
          />
        ) : orders.length === 0 ? (
          <EmptyState title="هنوز سفارشی ندارید" icon="🧾" />
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/order/${o.id}`}
                  className="block rounded-2xl border border-coffee/10 bg-cream-50 p-4 transition-shadow hover:shadow-card"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      سفارش {o.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="text-xs text-muted">
                      {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(o.createdAt)}
                    </span>
                  </div>
                  <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
                    {o.items.slice(0, 3).map((it) => (
                      <span key={it.id} className="rounded-full bg-beige px-2 py-0.5">
                        {it.product.nameFa} × {it.quantity}
                      </span>
                    ))}
                    {o.items.length > 3 && <span>+{o.items.length - 3}</span>}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="rounded-full bg-olive-50 px-2 py-0.5 text-olive-600">
                      {orderStatusLabel(o.status as OrderStatus, (o.orderType as OrderType) ?? "TAKEAWAY")}
                    </span>
                    <Price amount={o.total} size="sm" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <BottomNav />
    </div>
  );
}