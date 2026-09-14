import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api";
import { transitionOrderAtomic } from "@/lib/business/orders-write";
import { OrderError } from "@/lib/orders";
import { prisma } from "@/lib/db";
import { ORDER_STATUSES, orderStatusLabel } from "@/lib/constants";
import type { OrderType } from "@/lib/constants";

const schema = z.object({ status: z.enum(ORDER_STATUSES) });

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("orders.status");
  if ("res" in g) return g.res;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "وضعیت نامعتبر است" }, { status: 400 });
  try {
    // Shared atomic service: same path as the agent (order + table + receipt).
    const { order } = await prisma.$transaction(tx => transitionOrderAtomic(tx, params.id, parsed.data.status));
    return NextResponse.json({
      ok: true,
      status: order.status,
      label: orderStatusLabel(order.status as never, (order.orderType as OrderType) ?? "TAKEAWAY"),
    });
  } catch (e) {
    if (e instanceof OrderError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return NextResponse.json({ error: "خطای سرور" }, { status: 500 });
  }
}
