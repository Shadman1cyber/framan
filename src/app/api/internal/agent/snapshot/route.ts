import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const expected = process.env.N8N_BRIDGE_TOKEN;
  const supplied = request.headers.get("X-Farman-Agent-Token");
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Fixed, read-only reporting facts for the local n8n tool; no arbitrary SQL. */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  if (body.allowDb !== true) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const now = new Date();
  const local = new Date(now.getTime() + 210 * 60_000);
  const start = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 29) - 210 * 60_000);
  const [orders, ingredients] = await Promise.all([
    prisma.order.findMany({
      where: { status: "COMPLETED", completedAt: { gte: start } },
      select: { completedAt: true, total: true },
    }),
    prisma.ingredient.findMany({
      where: { isActive: true, minQuantity: { not: null } },
      select: { id: true, nameFa: true, unit: true, stockQuantity: true, minQuantity: true },
      orderBy: { nameFa: "asc" },
    }),
  ]);
  const days = new Map<string, { business_day: string; completed_orders: number; revenue_toman: number }>();
  for (const order of orders) {
    if (!order.completedAt) continue;
    const day = new Date(order.completedAt.getTime() + 210 * 60_000).toISOString().slice(0, 10);
    const row = days.get(day) ?? { business_day: day, completed_orders: 0, revenue_toman: 0 };
    row.completed_orders++;
    row.revenue_toman += order.total;
    days.set(day, row);
  }
  return NextResponse.json({
    window: "last 30 Tehran calendar days",
    completed_sales: [...days.values()].sort((a, b) => b.business_day.localeCompare(a.business_day)),
    low_stock: ingredients.filter(item => item.stockQuantity <= item.minQuantity!).slice(0, 30)
      .map(item => ({ id: item.id, name_fa: item.nameFa, unit: item.unit,
        stock_quantity: item.stockQuantity, min_quantity: item.minQuantity })),
  }, { headers: { "Cache-Control": "no-store" } });
}
