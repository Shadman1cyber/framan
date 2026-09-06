import { prisma } from "@/lib/db";
import { Price } from "@/components/ui/Price";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import { ORDER_STATUS_LABELS_FA, type OrderStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const status = searchParams.status as OrderStatus | undefined;
  const orders = await prisma.order.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    include: { user: true, table: true, items: { include: { product: true } } },
    take: 100,
  });
  return (
    <div>
      <h1 className="heading-section mb-6">سفارش‌ها</h1>
      <OrdersAdmin
        initial={orders.map((o) => ({
          id: o.id,
          status: o.status,
          total: o.total,
          createdAt: o.createdAt.toISOString(),
          customerName: o.user?.name ?? o.customerName ?? "مهمان",
          itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
          tableLabel: o.table?.label ?? o.table?.number ?? null,
        }))}
        currentStatus={status}
      />
    </div>
  );
}