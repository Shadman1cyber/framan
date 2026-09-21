import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { transitionOrderAtomic } from "@/lib/business/orders-write";
import { OrderError } from "@/lib/orders";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import type { OrderType } from "@/lib/constants";
import { OfflineMutationConflict, runIdempotentOfflineMutation } from "@/lib/offline/server";
import { invalidateOrdersCache } from "@/lib/cache";
const schema = z.object({ status: z.enum(ORDER_STATUSES) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("orders.status", "orders");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "وضعیت نامعتبر است" }, { status: 400 });
  try {
    const receipt = await runIdempotentOfflineMutation(req, g.user.id, { id: params.id, ...parsed.data }, async (tx) => {
      // Shared atomic service: order + table + offline receipt in one transaction.
      const { order } = await transitionOrderAtomic(tx, params.id, parsed.data.status);
      return { body: {
        ok: true,
        status: order.status,
        label: orderStatusLabel(order.status as never, (order.orderType as OrderType) ?? "TAKEAWAY"),
      } };
    });
    await invalidateOrdersCache();
    return NextResponse.json(receipt.body, {
      status: receipt.status,
      headers: { "X-Farman-Replayed": receipt.replayed ? "1" : "0" },
    });
  } catch (e) {
    if (e instanceof OfflineMutationConflict) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
