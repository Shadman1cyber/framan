import { prisma } from "@/lib/db";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import type { OrderStatus, OrderType } from "@/lib/constants";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import { nextStatuses } from "@/lib/orders";
import { requireAdminPage } from "@/lib/admin-page-access";
import { DashboardShell } from "@/components/admin/dashboard/DashboardShell";

function OrdersIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h14l-1.2 14.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 4Z" /><path d="M9 4a3 3 0 0 1 6 0M9.5 10h5" /></svg>;
}

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
      subtotal: true,
      discountAmount: true,
      discountCode: true,
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
    select: {
      id: true,
      nameFa: true,
      price: true,
      category: { select: { id: true, nameFa: true } },
    },
  }), prisma.cafeTable.findMany({
    where: { isActive: true },
    orderBy: { number: "asc" },
    select: { id: true, number: true, label: true },
  })]);
  return (
    <DashboardShell title="سفارش‌ها" icon={<OrdersIcon />}>
      <div data-legacy-surface="dashboard">
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
            subtotal: o.subtotal,
            discountAmount: o.discountAmount,
            discountCode: o.discountCode,
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
    </DashboardShell>
  );
}
