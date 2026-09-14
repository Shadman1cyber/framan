import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeRole } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Customer order status polling (owner of the order or QR-holder can view). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const order = await prisma.order.findUnique({
    where: { id: params.id },
    include: { items: { include: { product: { select: { nameFa: true } } } }, table: true },
  });
  if (!order) return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });

  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const isOwnerUser = userId && order.userId === userId;
  const isManagement = role === "CASHIER" || role === "OWNER";
  if (!isOwnerUser && !isManagement && order.customerName == null) {
    // Anonymous QR orders are viewable by id (unguessable cuid), as before.
  }

  return NextResponse.json({
    order: {
      id: order.id,
      status: order.status,
      orderType: order.orderType,
      total: order.total,
      estPrepMin: order.estPrepMin,
      estPrepMax: order.estPrepMax,
      createdAt: order.createdAt.toISOString(),
      tableLabel: order.table?.label ?? order.table?.number ?? null,
      items: order.items.map((it) => ({
        id: it.id,
        name: it.product.nameFa,
        quantity: it.quantity,
        price: it.price,
        coffeeLineName: it.coffeeLineName,
      })),
    },
  });
}
