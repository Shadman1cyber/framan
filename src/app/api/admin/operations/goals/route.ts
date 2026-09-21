import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guard } from "@/lib/api";
import { GOAL_METRICS, getGoalsWithProgress } from "@/lib/operations";

export const dynamic = "force-dynamic";

const schema = z.object({
  title: z.string().min(1).max(120),
  metric: z.enum(GOAL_METRICS),
  targetValue: z.number().int().positive().max(1_000_000_000_000),
  productId: z.string().optional().nullable(),
  from: z.string().min(1),
  to: z.string().min(1),
  isActive: z.boolean().optional(),
});

export async function GET() {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const goals = await getGoalsWithProgress();
  // Persist warnings as AI insights (best effort, deduplicated per day per goal).
  const warnings = goals.filter((x) => x.warning && (x.status === "REACHED" || x.status === "APPROACHING"));
  for (const w of warnings) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const exists = await prisma.aIInsight.findFirst({
        where: { kind: "OPERATION", title: { contains: w.id }, body: { contains: today } },
      });
      if (!exists) {
        await prisma.aIInsight.create({
          data: { kind: "OPERATION", severity: w.status === "REACHED" ? "WARNING" : "INFO", title: `هدف: ${w.title} (${w.id})`, body: `${today} — ${w.warning}` },
        });
      }
    } catch { /* best effort */ }
  }
  return NextResponse.json({ goals });
}

export async function POST(req: Request) {
  const g = await guard("finance.view");
  if ("res" in g) return g.res;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "ورودی نامعتبر" }, { status: 400 });
  const { title, metric, targetValue, productId, from, to, isActive } = parsed.data;
  if (metric === "ITEM_COUNT" && !productId) {
    return NextResponse.json({ error: "برای هدف تعدادی، انتخاب محصول الزامی است" }, { status: 400 });
  }
  const fromD = new Date(from.length <= 10 ? `${from}T00:00:00.000Z` : from);
  const toD = new Date(to.length <= 10 ? `${to}T23:59:59.999Z` : to);
  if (!(fromD < toD)) return NextResponse.json({ error: "بازهٔ تاریخ نامعتبر است" }, { status: 400 });
  if (productId) {
    const p = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!p) return NextResponse.json({ error: "محصول یافت نشد" }, { status: 400 });
  }
  const created = await prisma.goal.create({
    data: { title: title.trim(), metric, targetValue, productId: productId ?? null, from: fromD, to: toD, isActive: isActive ?? true },
  });
  return NextResponse.json({ id: created.id });
}
