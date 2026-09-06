import { prisma } from "@/lib/db";
import { Price } from "@/components/ui/Price";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [products, orders, users, pending] = await Promise.all([
    prisma.product.count(),
    prisma.order.count(),
    prisma.user.count(),
    prisma.order.count({ where: { status: "PENDING" } }),
  ]);
  const revenue = await prisma.order.aggregate({
    where: { status: { in: ["COMPLETED", "READY", "PREPARING"] } },
    _sum: { total: true },
  });
  const recentOrders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { user: true, table: true, items: true },
  });
  const cards = [
    { label: "محصولات", value: products, href: "/admin/products" },
    { label: "سفارش‌ها", value: orders, href: "/admin/orders" },
    { label: "کاربران", value: users, href: "/admin/users" },
    { label: "در انتظار", value: pending, href: "/admin/orders" },
  ];
  return (
    <div>
      <h1 className="heading-section mb-6">داشبورد</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.label} href={c.href} className="card p-4">
            <div className="text-xs text-muted">{c.label}</div>
            <div className="mt-2 text-2xl font-bold text-espresso tabular-nums">{c.value}</div>
          </Link>
        ))}
      </div>
      <div className="mt-6 card p-4">
        <div className="mb-2 text-sm text-muted">درآمد کل</div>
        <Price amount={revenue._sum.total ?? 0} size="lg" />
      </div>
      <div className="mt-6 card p-4">
        <h2 className="mb-3 text-sm font-semibold">سفارش‌های اخیر</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-muted">سفارشی ثبت نشده است.</p>
        ) : (
          <ul className="divide-y divide-coffee/10">
            {recentOrders.map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                <span>#{o.id.slice(-6).toUpperCase()}</span>
                <span className="text-muted">{new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(o.createdAt)}</span>
                <span>{o.user?.name ?? (o.customerName ?? "مهمان")}</span>
                <span>{o.status}</span>
                <Price amount={o.total} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}