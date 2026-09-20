import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { GOAL_METRICS } from "@/lib/operations";

const schema = z.object({
  title: z.string().min(1).max(120).optional(),
  metric: z.enum(GOAL_METRICS).optional(),
  targetValue: z.number().int().positive().max(1_000_000_000_000).optional(),
  productId: z.string().optional().nullable(),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title.trim();
  if (parsed.data.metric !== undefined) data.metric = parsed.data.metric;
  if (parsed.data.targetValue !== undefined) data.targetValue = parsed.data.targetValue;
  if (parsed.data.productId !== undefined) data.productId = parsed.data.productId;
  if (parsed.data.from !== undefined) data.from = new Date(parsed.data.from.length <= 10 ? `${parsed.data.from}T00:00:00.000Z` : parsed.data.from);
  if (parsed.data.to !== undefined) data.to = new Date(parsed.data.to.length <= 10 ? `${parsed.data.to}T23:59:59.999Z` : parsed.data.to);
  if (parsed.data.isActive !== undefined) data.isActive = parsed.data.isActive;
  try {
    await prisma.goal.update({ where: { id: params.id }, data });
  } catch {
    return NextResponse.json({ error: "هدف یافت نشد" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  try {
    await prisma.goal.delete({ where: { id: params.id } });
  } catch {
    return NextResponse.json({ error: "هدف یافت نشد" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
