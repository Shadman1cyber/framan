import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import type { OrderStatus } from "@/lib/constants";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import { nextStatuses } from "@/lib/orders";
import type { OrderType } from "@/lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("orders.view");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as OrderStatus | null;
  const orders = await prisma.order.findMany({
    where: status && ORDER_STATUSES.includes(status) ? { status } : {},
    orderBy: { createdAt: "desc" },
    include: { user: true, table: true, items: true },
    take: 100,
  });
  return NextResponse.json({
    orders: orders.map((o) => {
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
    }),
  });
}
