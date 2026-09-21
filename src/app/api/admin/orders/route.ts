import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import type { OrderStatus } from "@/lib/constants";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import { nextStatuses } from "@/lib/orders";
import type { OrderType } from "@/lib/constants";
import { z } from "zod";
import { createOrder, OrderError } from "@/lib/orders";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";
import { cached, invalidateOrdersCache, cacheKeys, CACHE_TTL } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("orders.view", "orders");
  if ("res" in g) return g.res;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") as OrderStatus | null;
  const orders = await cached(
    cacheKeys.orderList(status),
    CACHE_TTL.ORDER_LIST,
    async () =>
      prisma.order.findMany({
        where: status && ORDER_STATUSES.includes(status) ? { status } : {},
        orderBy: { createdAt: "desc" },
        include: { user: true, table: true, items: true },
        take: 100,
      }),
  );
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
        createdAt: new Date(o.createdAt).toISOString(),
        customerName: o.user?.name ?? o.customerName ?? "مهمان",
        itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
        tableLabel: o.table?.label ?? o.table?.number ?? null,
        tableNumber: o.table?.number ?? null,
        allowedNext: nextStatuses(current, orderType),
      };
    }),
  });
}

const manualOrderSchema = z.object({
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1),
  tableId: z.string().optional().nullable(),
  customerName: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

/** Cashier/owner order entry for orders received directly by a waiter. */
export async function POST(req: Request) {
  const g = await guard("orders.status", "orders");
  if ("res" in g) return g.res;
  const parsed = manualOrderSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی سفارش نامعتبر است" }, { status: 400 });
  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, parsed.data, async (tx) => {
      const order = await createOrder({
        items: parsed.data.items,
        manualTableId: parsed.data.tableId || null,
        customerName: parsed.data.customerName?.trim() || "سفارش حضوری",
        notes: parsed.data.notes?.trim() || undefined,
      }, tx);
      return { body: { id: order.id } };
    });
    await invalidateOrdersCache();
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (error) {
    if (error instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof OrderError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json({ error: "ثبت سفارش انجام نشد" }, { status: 500 });
  }
}
