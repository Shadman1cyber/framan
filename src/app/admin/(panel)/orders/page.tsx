import { prisma } from "@/lib/db";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import type { OrderStatus, OrderType } from "@/lib/constants";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import { nextStatuses } from "@/lib/orders";
import { requireAdminPage } from "@/lib/admin-page-access";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireAdminPage("orders");
  const status = searchParams.status as OrderStatus | undefined;
  const [orders, products, tables] = await Promise.all([prisma.order.findMany({
    where: status && ORDER_STATUSES.includes(status) ? { status } : {},
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      orderType: true,
      total: true,
      estPrepMin: true,
      estPrepMax: true,
      createdAt: true,
      customerName: true,
      customerPhone: true,
      user: { select: { name: true } },
      table: { select: { label: true, number: true } },
      items: { select: { quantity: true } },
    },
    take: 100,
  }), prisma.product.findMany({
    where: { isAvailable: true },
    orderBy: [{ category: { order: "asc" } }, { order: "asc" }],
    select: { id: true, nameFa: true, price: true },
  }), prisma.cafeTable.findMany({
    where: { isActive: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, label: true },
  })]);
  return (
    <div>
      <h1 className="heading-section mb-6">سفارش‌ها</h1>
      <OrdersAdmin
        initial={orders.map((o) => {
          const orderType = (o.orderType as OrderType) ?? "TAKEAWAY";
          const current = o.status as OrderStatus;
          return {
            id: o.id,
            status: current,
            statusLabel: orderStatusLabel(current, orderType),
            orderType,
            total: o.total,
            estPrepMin: o.estPrepMin,
            estPrepMax: o.estPrepMax,
            createdAt: o.createdAt.toISOString(),
            customerName: o.user?.name ?? o.customerName ?? "مهمان",
            itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
            tableLabel: o.table?.label ?? o.table?.number ?? null,
            tableNumber: o.table?.number ?? null,
            allowedNext: nextStatuses(current, orderType),
          };
        })}
        currentStatus={status}
        products={products}
        tables={tables}
      />
    </div>
  );
}
