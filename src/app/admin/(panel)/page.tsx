import { prisma } from "@/lib/db";
import { Price } from "@/components/ui/Price";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { normalizeRole, isOwner, orderStatusLabel, type OrderStatus, type OrderType } from "@/lib/constants";
import { getFinancialSummary, getInventoryStatus, getOperationalStatus } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  const owner = isOwner(role);

  const [pending, ops, financial, lowStock, recentOrders] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING" } }),
    getOperationalStatus(),
    getFinancialSummary(),
    getInventoryStatus(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: true, table: true },
    }),
  ]);

  const cards = [
    { label: "در انتظار تایید", value: pending, href: "/admin/orders?status=PENDING" },
    { label: "سفارش‌های فعال", value: ops.activeOrders, href: "/admin/orders" },
    { label: "درآمد امروز", value: null, href: owner ? "/admin/financial" : "/admin/orders" },
    { label: "مواد کم‌موجود", value: lowStock.filter((i) => i.isLow).length, href: "/admin/inventory" },
  ];

  return (
    <div>
      <h1 className="heading-section mb-6">داشبورد</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-4">
            <div className="text-xs text-muted">{c.label}</div>
            {c.value != null ? (
              <div className="mt-2 text-2xl font-bold text-espresso dark:text-dark-text tabular-nums">{c.value}</div>
            ) : (
              <div className="mt-2 text-lg font-bold text-espresso dark:text-dark-text">
                <Price amount={financial.revenue.today ?? 0} size="md" />
              </div>
            )}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <div className="text-xs text-muted">پرسنل فعال</div>
          <div className="mt-2 text-2xl font-bold text-espresso dark:text-dark-text">{ops.chefs + ops.otherStaff}</div>
          <div className="mt-1 text-xs text-muted">{ops.chefs} شف · {ops.otherStaff} سایر</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">سفارش در حال آماده‌سازی</div>
          <div className="mt-2 text-2xl font-bold text-espresso dark:text-dark-text">{ops.preparingCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-muted">درآمد ماه</div>
          <div className="mt-2 font-bold text-espresso dark:text-dark-text"><Price amount={financial.revenue.month ?? 0} size="md" /></div>
        </div>
      </div>

      {lowStock.some((i) => i.isLow) && (
        <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <span className="font-semibold text-warning">مواد کم‌موجود: </span>
          {lowStock.filter((i) => i.isLow).map((i) => i.name).join("، ")}
        </div>
      )}

      <div className="mt-6 card p-4">
        <h2 className="mb-3 text-sm font-semibold">سفارش‌های اخیر</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted">سفارشی ثبت نشده است.</p>
        ) : (
          <ul className="divide-y divide-coffee/10">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/order/${o.id}`} className="font-medium hover:underline">
                  #{o.id.slice(-6).toUpperCase()}
                </Link>
                <span className="text-muted">
                  {new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(o.createdAt)}
                </span>
                <span>{o.user?.name ?? (o.customerName ?? "مهمان")}</span>
                <span className="chip">
                  {orderStatusLabel(o.status as OrderStatus, (o.orderType as OrderType) ?? "TAKEAWAY")}
                </span>
                <Price amount={o.total} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
